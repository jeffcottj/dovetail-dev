import { Router, type NextFunction, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import mime from 'mime-types';
import { and, eq } from 'drizzle-orm';
import { db, articles, attachments, categories } from '@dovetail/db';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { enqueueAttachmentIndexing, resetAttachmentIndexing } from '../services/attachment-indexing.js';
import { canEditArticle, canReadArticle } from '../services/permissions.js';
import { ensureDir, getUploadsDir } from '../utils/storage.js';
import { resolveAttachmentPath } from '../utils/attachments.js';
import type { Role } from '@dovetail/types';

export const attachmentsRouter: Router = Router();
export const articleAttachmentsRouter: Router = Router({ mergeParams: true });

type AttachmentArticle = {
  id: string;
  categoryId: string;
  status: 'draft' | 'published' | 'archived';
  knowledgeBaseId: string;
};

const MAX_ATTACHMENT_BYTES = Number(process.env.ATTACHMENT_MAX_BYTES ?? 25 * 1024 * 1024);

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      const tempDir = path.join(getUploadsDir(), 'attachment-temp');
      try {
        await ensureDir(tempDir);
        cb(null, tempDir);
      } catch (err) {
        cb(err as Error, tempDir);
      }
    },
  }),
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
});

function uploadSingleAttachment(req: AuthRequest, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Attachment file is too large' });
      return;
    }

    if (err) {
      next(err);
      return;
    }

    next();
  });
}

function serializeAttachment() {
  return {
    id: attachments.id,
    articleId: attachments.articleId,
    filename: attachments.filename,
    mimeType: attachments.mimeType,
    sizeBytes: attachments.sizeBytes,
    extractionStatus: attachments.extractionStatus,
    extractionError: attachments.extractionError,
    extractedAt: attachments.extractedAt,
    indexedAt: attachments.indexedAt,
    createdAt: attachments.createdAt,
  };
}

function toSafeExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return /^[a-z0-9.]{1,16}$/.test(ext) ? ext : '';
}

function toStoragePath(filename: string, attachmentId: string): string {
  return path.posix.join('uploads', 'attachments', `${attachmentId}${toSafeExtension(filename)}`);
}

function contentDispositionFilename(filename: string): string {
  return filename.replace(/[\r\n]/g, ' ').replace(/"/g, '\\"');
}

async function cleanupTempFile(file?: Express.Multer.File) {
  if (!file?.path) return;
  await fs.rm(file.path, { force: true }).catch(() => {});
}

async function removeStoredFile(storagePath: string | null | undefined) {
  if (!storagePath) return;
  try {
    await fs.rm(resolveAttachmentPath(storagePath), { force: true });
  } catch {
    // File cleanup is best-effort; DB state is the source of truth.
  }
}

async function markArticleAttachmentsChanged(articleId: string, userId: string) {
  await db
    .update(articles)
    .set({ updatedAt: new Date(), lastEditedById: userId })
    .where(eq(articles.id, articleId));
}

async function loadAttachmentArticle(articleId: string, kbId?: string): Promise<AttachmentArticle | null> {
  const [article] = await db.select({
    id: articles.id,
    categoryId: articles.categoryId,
    status: articles.status,
    knowledgeBaseId: categories.knowledgeBaseId,
  })
    .from(articles)
    .innerJoin(categories, eq(articles.categoryId, categories.id))
    .where(eq(articles.id, articleId));

  if (!article || (kbId && article.knowledgeBaseId !== kbId)) {
    return null;
  }

  return article;
}

async function requireAttachmentArticleReader(req: AuthRequest, res: any, articleId: string, kbId?: string) {
  const article = await loadAttachmentArticle(articleId, kbId);
  if (!article) {
    res.status(404).json({ error: 'Article not found' });
    return null;
  }

  const canRead = await canReadArticle({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    categoryId: article.categoryId,
    knowledgeBaseId: article.knowledgeBaseId,
    status: article.status,
  });
  if (!canRead) {
    res.status(404).json({ error: 'Article not found' });
    return null;
  }

  return article;
}

async function requireAttachmentArticleEditor(req: AuthRequest, res: any, articleId: string, kbId?: string) {
  const article = await loadAttachmentArticle(articleId, kbId);
  if (!article) {
    res.status(404).json({ error: 'Article not found' });
    return null;
  }

  const canEdit = await canEditArticle({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    categoryId: article.categoryId,
    knowledgeBaseId: article.knowledgeBaseId,
  });
  if (!canEdit) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return article;
}

async function findAttachmentForArticle(attachmentId: string, articleId: string) {
  const [attachment] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.articleId, articleId)));

  return attachment ?? null;
}

async function persistUploadedAttachmentFile(file: Express.Multer.File, attachmentId: string) {
  const storagePath = toStoragePath(file.originalname, attachmentId);
  const destination = resolveAttachmentPath(storagePath);
  await ensureDir(path.dirname(destination));
  await fs.rename(file.path, destination);
  return storagePath;
}

articleAttachmentsRouter.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const articleId = req.params.id as string;
  const kbId = req.params.kbId as string;
  const article = await requireAttachmentArticleReader(req, res, articleId, kbId);
  if (!article) return;

  const result = await db
    .select(serializeAttachment())
    .from(attachments)
    .where(eq(attachments.articleId, articleId));

  res.json(result);
});

articleAttachmentsRouter.get('/:attachmentId/download', authMiddleware, async (req: AuthRequest, res) => {
  const articleId = req.params.id as string;
  const kbId = req.params.kbId as string;
  const attachmentId = req.params.attachmentId as string;

  const attachment = await findAttachmentForArticle(attachmentId, articleId);
  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  const article = await requireAttachmentArticleReader(req, res, articleId, kbId);
  if (!article) return;

  await sendAttachmentFile(res, attachment);
});

articleAttachmentsRouter.post('/', authMiddleware, uploadSingleAttachment, async (req: AuthRequest, res) => {
  const articleId = req.params.id as string;
  const kbId = req.params.kbId as string;
  const file = req.file;

  try {
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const article = await requireAttachmentArticleEditor(req, res, articleId, kbId);
    if (!article) {
      await cleanupTempFile(file);
      return;
    }

    const attachmentId = randomUUID();
    const storagePath = await persistUploadedAttachmentFile(file, attachmentId);
    const mimeType = file.mimetype || mime.lookup(file.originalname) || 'application/octet-stream';

    const [created] = await db.insert(attachments).values({
      id: attachmentId,
      articleId,
      filename: file.originalname,
      storagePath,
      mimeType,
      sizeBytes: file.size,
      extractionStatus: 'pending',
    }).returning(serializeAttachment());

    await markArticleAttachmentsChanged(article.id, req.user!.id);
    enqueueAttachmentIndexing(attachmentId);
    res.status(201).json(created);
  } catch (err) {
    await cleanupTempFile(file);
    throw err;
  }
});

articleAttachmentsRouter.patch('/:attachmentId', authMiddleware, uploadSingleAttachment, async (req: AuthRequest, res) => {
  const articleId = req.params.id as string;
  const kbId = req.params.kbId as string;
  const attachmentId = req.params.attachmentId as string;
  const file = req.file;

  try {
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const article = await requireAttachmentArticleEditor(req, res, articleId, kbId);
    if (!article) {
      await cleanupTempFile(file);
      return;
    }

    const current = await findAttachmentForArticle(attachmentId, articleId);
    if (!current) {
      await cleanupTempFile(file);
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    const nextStoragePath = await persistUploadedAttachmentFile(file, attachmentId);
    const mimeType = file.mimetype || mime.lookup(file.originalname) || 'application/octet-stream';

    await resetAttachmentIndexing(attachmentId);

    const [updated] = await db.update(attachments)
      .set({
        filename: file.originalname,
        storagePath: nextStoragePath,
        mimeType,
        sizeBytes: file.size,
        extractionStatus: 'pending',
        extractedText: null,
        extractionError: null,
        extractedAt: null,
        indexedAt: null,
        contentHash: null,
      })
      .where(and(eq(attachments.id, attachmentId), eq(attachments.articleId, articleId)))
      .returning(serializeAttachment());

    await markArticleAttachmentsChanged(article.id, req.user!.id);
    enqueueAttachmentIndexing(attachmentId);
    if (current.storagePath !== nextStoragePath) {
      await removeStoredFile(current.storagePath);
    }
    res.json(updated);
  } catch (err) {
    await cleanupTempFile(file);
    throw err;
  }
});

articleAttachmentsRouter.delete('/:attachmentId', authMiddleware, async (req: AuthRequest, res) => {
  const articleId = req.params.id as string;
  const kbId = req.params.kbId as string;
  const attachmentId = req.params.attachmentId as string;

  const article = await requireAttachmentArticleEditor(req, res, articleId, kbId);
  if (!article) return;

  const current = await findAttachmentForArticle(attachmentId, articleId);
  if (!current) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  await db.delete(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.articleId, articleId)));

  await markArticleAttachmentsChanged(article.id, req.user!.id);
  await removeStoredFile(current.storagePath);
  res.status(204).send();
});

async function sendAttachmentFile(res: any, attachment: typeof attachments.$inferSelect) {
  let filePath: string;
  try {
    filePath = resolveAttachmentPath(attachment.storagePath);
  } catch {
    res.status(404).json({ error: 'Attachment file not found' });
    return;
  }

  try {
    await fs.access(filePath);
  } catch {
    res.status(404).json({ error: 'Attachment file not found' });
    return;
  }

  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${contentDispositionFilename(attachment.filename)}"`,
  );
  res.sendFile(filePath);
}

attachmentsRouter.get('/:id/download', authMiddleware, async (req: AuthRequest, res) => {
  const id = req.params.id as string;

  const [attachment] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id));

  if (!attachment?.articleId) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  const article = await requireAttachmentArticleReader(req, res, attachment.articleId);
  if (!article) return;

  await sendAttachmentFile(res, attachment);
});
