import { Router } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { adminActivityEvents, db, importJobs } from '@dovetail/db';
import { authMiddleware, type AuthRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { buildAdminActivityInsert } from '../../services/admin-activity.js';
import { validateBody } from '../../utils/validate.js';
import { getUploadsDir, ensureDir, cleanupDir } from '../../utils/storage.js';
import { parseDataJson, buildCategoryTree } from '../../services/import/flowlu-parser.js';
import { ImportEngine, type ProgressEvent } from '../../services/import/import-engine.js';

const upload = multer({ dest: path.join(getUploadsDir(), 'import-temp') });

// In-memory map of temp import sessions (tempId → dirPath)
const tempSessions = new Map<string, { dir: string; createdAt: number }>();

// Cleanup stale sessions after 1 hour
const SESSION_TTL_MS = 60 * 60 * 1000;

export const importRouter: Router = Router({ mergeParams: true });

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
      res.status(400).json({ error: 'The uploaded file could not be processed. Please ensure it is a valid ZIP file containing an export.' });
    }
  },
);

function countNodes(node: { children: any[] }): number {
  return 1 + node.children.reduce((acc: number, child: any) => acc + countNodes(child), 0);
}

// In-memory map of active SSE listeners per job
const jobListeners = new Map<string, Set<(event: ProgressEvent) => void>>();

const executeSchema = z.object({
  tempId: z.string().uuid(),
  options: z.object({
    defaultStatus: z.enum(['draft', 'published']).default('draft'),
  }),
});

// POST /api/admin/import/execute — start import job
importRouter.post(
  '/execute',
  authMiddleware,
  requireRole('admin'),
  validateBody(executeSchema),
  async (req: AuthRequest, res) => {
    const { tempId, options } = req.body;

    const session = tempSessions.get(tempId);
    if (!session) {
      res.status(404).json({ error: 'Import session not found or expired' });
      return;
    }

    // Create import job record
    const kbId = req.params.kbId as string;
    const job = await db.transaction(async (tx) => {
      const [job] = await tx.insert(importJobs).values({
        createdBy: req.user!.id,
        knowledgeBaseId: kbId,
        options,
      }).returning();
      if (!job) {
        throw new Error('Import job creation failed');
      }

      await tx.insert(adminActivityEvents).values(buildAdminActivityInsert({
        kind: 'import.started',
        actorId: req.user!.id,
        knowledgeBaseId: kbId,
        subjectId: job.id,
        subjectLabel: 'Import job started',
        metadata: {
          jobId: job.id,
          defaultStatus: options.defaultStatus,
        },
      }));

      return job;
    });

    // Start import in background
    const engine = new ImportEngine({
      extractDir: session.dir,
      userId: req.user!.id,
      defaultStatus: options.defaultStatus,
      jobId: job.id,
      knowledgeBaseId: kbId,
    });

    // Wire up SSE listeners
    engine.onProgress((event) => {
      const listeners = jobListeners.get(job.id);
      if (listeners) {
        for (const listener of listeners) {
          listener(event);
        }
      }
      // Cleanup on complete
      if (event.type === 'complete') {
        jobListeners.delete(job.id);
        tempSessions.delete(tempId);
        void cleanupDir(session.dir);
      }
    });

    // Fire and forget
    void engine.run().catch(async (err) => {
      console.error('Import engine error:', err);
      const listeners = jobListeners.get(job.id);
      if (listeners) {
        for (const listener of listeners) {
          listener({ type: 'complete', imported: 0, errors: 1 });
        }
      }
      jobListeners.delete(job.id);
      tempSessions.delete(tempId);
      void cleanupDir(session.dir);
    });

    res.status(202).json({ jobId: job.id });
  },
);

// GET /api/admin/import/:id/progress — SSE stream
importRouter.get(
  '/:id/progress',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    const jobId = req.params.id as string;
    const kbId = req.params.kbId as string;

    const [job] = await db
      .select()
      .from(importJobs)
      .where(and(eq(importJobs.id, jobId), eq(importJobs.knowledgeBaseId, kbId)));
    if (!job) {
      res.status(404).json({ error: 'Import job not found' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Check if job is already complete
    if (job.status === 'completed' || job.status === 'failed') {
      res.write(`data: ${JSON.stringify({ type: 'complete', imported: job.importedCount, errors: (job.errorLog as any[]).length })}\n\n`);
      res.end();
      return;
    }

    const listener = (event: ProgressEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'complete') {
        res.end();
      }
    };

    if (!jobListeners.has(jobId)) {
      jobListeners.set(jobId, new Set());
    }
    jobListeners.get(jobId)!.add(listener);

    req.on('close', () => {
      const listeners = jobListeners.get(jobId);
      if (listeners) {
        listeners.delete(listener);
      }
    });
  },
);

// GET /api/admin/import/:id — job detail
importRouter.get(
  '/:id',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    const [job] = await db
      .select()
      .from(importJobs)
      .where(and(
        eq(importJobs.id, req.params.id as string),
        eq(importJobs.knowledgeBaseId, req.params.kbId as string),
      ));
    if (!job) {
      res.status(404).json({ error: 'Import job not found' });
      return;
    }
    res.json(job);
  },
);

// GET /api/admin/import — list all import jobs
importRouter.get(
  '/',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    const jobs = await db
      .select()
      .from(importJobs)
      .where(eq(importJobs.knowledgeBaseId, req.params.kbId as string))
      .orderBy(desc(importJobs.createdAt));
    res.json(jobs);
  },
);

export { tempSessions };
