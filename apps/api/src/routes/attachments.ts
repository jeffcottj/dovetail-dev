import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { db, articles, attachments, categories } from '@dovetail/db';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { canReadArticle } from '../services/permissions.js';
import type { Role } from '@dovetail/types';

export const attachmentsRouter: Router = Router();

// GET /api/articles/:id/attachments — list attachments for an article
export const articleAttachmentsRouter: Router = Router({ mergeParams: true });

async function requireAttachmentArticleReader(req: AuthRequest, res: any, articleId: string, kbId?: string) {
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

articleAttachmentsRouter.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const articleId = req.params.id as string;
  const kbId = req.params.kbId as string;
  const article = await requireAttachmentArticleReader(req, res, articleId, kbId);
  if (!article) return;

  const result = await db
    .select({
      id: attachments.id,
      articleId: attachments.articleId,
      filename: attachments.filename,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .where(eq(attachments.articleId, articleId));

  res.json(result);
});

// GET /api/attachments/:id/download — download an attachment file
attachmentsRouter.get('/:id/download', authMiddleware, async (req: AuthRequest, res) => {
  const id = req.params.id as string;

  const [attachment] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id));

  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  if (!attachment.articleId) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  const article = await requireAttachmentArticleReader(req, res, attachment.articleId);
  if (!article) return;

  // storagePath is e.g. "uploads/attachments/uuid.ext" — resolve relative to cwd
  const filePath = path.resolve(process.cwd(), attachment.storagePath);

  try {
    await fs.access(filePath);
  } catch {
    res.status(404).json({ error: 'Attachment file not found' });
    return;
  }

  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${attachment.filename.replace(/"/g, '\\"')}"`,
  );
  res.sendFile(filePath);
});
