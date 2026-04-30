import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { Router, type NextFunction, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { articles, categories, db } from '@dovetail/db';
import type { Role } from '@dovetail/types';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import type { AuthKbRequest } from '../middleware/resolveKb.js';
import { canEditArticle } from '../services/permissions.js';
import { convertDocxFile, DocxConversionError, isAllowedDocxUpload } from '../services/docx-conversion.js';
import { getUploadsDir } from '../utils/storage.js';

export const docxConversionsRouter: Router = Router({ mergeParams: true });

const DOCX_CONVERT_MAX_BYTES = Number(process.env.DOCX_CONVERT_MAX_BYTES ?? 25 * 1024 * 1024);

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      const tempDir = path.join(getUploadsDir(), 'docx-temp');
      await fs.mkdir(tempDir, { recursive: true });
      cb(null, tempDir);
    },
  }),
  limits: { fileSize: DOCX_CONVERT_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isAllowedDocxUpload(file)) {
      cb(null, true);
      return;
    }
    cb(new DocxConversionError('Only .docx files can be converted'));
  },
});

function uploadSingleDocx(req: AuthRequest, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof DocxConversionError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }

    if (err instanceof multer.MulterError) {
      res.status(400).json({
        error: err.code === 'LIMIT_FILE_SIZE'
          ? `DOCX files must be ${Math.floor(DOCX_CONVERT_MAX_BYTES / 1024 / 1024)}MB or smaller`
          : err.message,
      });
      return;
    }

    next(err);
  });
}

async function cleanupUploadedFile(file?: Express.Multer.File) {
  if (!file?.path) return;
  await fs.rm(file.path, { force: true }).catch(() => {});
}

async function canConvertForCategory(req: AuthKbRequest, res: Response, categoryId: string) {
  const kbId = req.params.kbId as string;
  const [category] = await db
    .select({ id: categories.id, knowledgeBaseId: categories.knowledgeBaseId })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.knowledgeBaseId, kbId)));

  if (!category) {
    res.status(404).json({ error: 'Category not found' });
    return false;
  }

  const allowed = await canEditArticle({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    categoryId,
    knowledgeBaseId: kbId,
  });

  if (!allowed) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }

  return true;
}

async function canConvertForArticle(req: AuthKbRequest, res: Response, articleId: string) {
  const kbId = req.params.kbId as string;
  const [article] = await db
    .select({
      id: articles.id,
      categoryId: articles.categoryId,
      knowledgeBaseId: categories.knowledgeBaseId,
    })
    .from(articles)
    .innerJoin(categories, eq(categories.id, articles.categoryId))
    .where(eq(articles.id, articleId));

  if (!article || article.knowledgeBaseId !== kbId) {
    res.status(404).json({ error: 'Article not found' });
    return false;
  }

  const allowed = await canEditArticle({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    categoryId: article.categoryId,
    knowledgeBaseId: kbId,
  });

  if (!allowed) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }

  return true;
}

docxConversionsRouter.post('/docx', authMiddleware, uploadSingleDocx, async (req: AuthKbRequest, res, next) => {
  const file = req.file;

  try {
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const categoryId = typeof req.body.categoryId === 'string' ? req.body.categoryId : undefined;
    const articleId = typeof req.body.articleId === 'string' ? req.body.articleId : undefined;

    if ((categoryId && articleId) || (!categoryId && !articleId)) {
      res.status(400).json({ error: 'Provide either categoryId or articleId' });
      return;
    }

    const allowed = categoryId
      ? await canConvertForCategory(req, res, categoryId)
      : await canConvertForArticle(req, res, articleId!);

    if (!allowed) return;

    const converted = await convertDocxFile(file.path);
    res.json(converted);
  } catch (err) {
    if (err instanceof DocxConversionError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    next(err);
  } finally {
    await cleanupUploadedFile(file);
  }
});
