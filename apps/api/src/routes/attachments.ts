import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { db, attachments } from '@dovetail/db';
import { authMiddleware } from '../middleware/auth.js';

export const attachmentsRouter: Router = Router();

// GET /api/articles/:id/attachments — list attachments for an article
export const articleAttachmentsRouter: Router = Router({ mergeParams: true });

articleAttachmentsRouter.get('/', authMiddleware, async (req, res) => {
  const articleId = req.params.id as string;

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
attachmentsRouter.get('/:id/download', authMiddleware, async (req, res) => {
  const id = req.params.id as string;

  const [attachment] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id));

  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

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
