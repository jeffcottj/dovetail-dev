import { Router } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { authMiddleware, type AuthRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { getUploadsDir, ensureDir, cleanupDir } from '../../utils/storage.js';
import { parseDataJson, buildCategoryTree } from '../../services/import/flowlu-parser.js';

const upload = multer({ dest: path.join(getUploadsDir(), 'import-temp') });

// In-memory map of temp import sessions (tempId → dirPath)
const tempSessions = new Map<string, { dir: string; createdAt: number }>();

// Cleanup stale sessions after 1 hour
const SESSION_TTL_MS = 60 * 60 * 1000;

export const importRouter: Router = Router();

// POST /api/admin/import/preview — upload ZIP, return summary
importRouter.post(
  '/preview',
  authMiddleware,
  requireRole('admin'),
  upload.single('file'),
  async (req: AuthRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const tempId = randomUUID();
    const extractDir = path.join(getUploadsDir(), 'import-temp', tempId);

    try {
      // Extract ZIP
      const zip = new AdmZip(req.file.path);
      await ensureDir(extractDir);
      zip.extractAllTo(extractDir, true);

      // Clean up the uploaded ZIP file
      await fs.unlink(req.file.path);

      // Parse data.json
      const dataJsonPath = path.join(extractDir, 'assets', 'data.json');
      const dataJsonContent = await fs.readFile(dataJsonPath, 'utf-8');
      const articles = parseDataJson(dataJsonContent);
      const tree = buildCategoryTree(articles);

      // Count attachments
      const imagesDir = path.join(extractDir, 'assets', 'images');
      let attachmentCount = 0;
      try {
        const imageDirs = await fs.readdir(imagesDir);
        for (const dir of imageDirs) {
          const dirPath = path.join(imagesDir, dir);
          const stat = await fs.stat(dirPath);
          if (stat.isDirectory() && /^\d+$/.test(dir)) {
            const files = await fs.readdir(dirPath);
            attachmentCount += files.length;
          }
        }
      } catch { /* no images dir */ }

      // Check for warnings (articles with no HTML file)
      const warnings: { article: string; message: string }[] = [];
      for (const art of articles) {
        const htmlPath = path.join(extractDir, 'articles', art.code, 'index.html');
        try {
          await fs.access(htmlPath);
        } catch {
          warnings.push({ article: art.title, message: 'No HTML file found; article will be imported with empty content' });
        }
      }

      // Store session
      tempSessions.set(tempId, { dir: extractDir, createdAt: Date.now() });

      // Schedule cleanup
      setTimeout(() => {
        const session = tempSessions.get(tempId);
        if (session) {
          tempSessions.delete(tempId);
          void cleanupDir(session.dir);
        }
      }, SESSION_TTL_MS);

      res.json({
        tempId,
        summary: {
          articleCount: articles.length,
          categoryCount: tree.reduce((acc, n) => acc + countNodes(n), 0),
          attachmentCount,
          categoryTree: tree,
        },
        warnings,
      });
    } catch (err: any) {
      await cleanupDir(extractDir);
      res.status(400).json({ error: `Failed to parse export: ${err.message}` });
    }
  },
);

function countNodes(node: { children: any[] }): number {
  return 1 + node.children.reduce((acc: number, child: any) => acc + countNodes(child), 0);
}

export { tempSessions };
