import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { db, attachments, attachmentEmbeddings } from '@dovetail/db';
import { resolveAttachmentPath } from '../utils/attachments.js';
import { createEmbeddingProvider } from './embeddings.js';
import { chunkText } from './embedding-pipeline.js';

type AttachmentRow = typeof attachments.$inferSelect;

const MAX_EXTRACTED_CHARS = Number(process.env.ATTACHMENT_EXTRACT_MAX_CHARS ?? 500_000);
const MAX_EMBEDDING_CHUNKS = Number(process.env.ATTACHMENT_EMBED_MAX_CHUNKS ?? 100);
const TEXT_MIME_RE = /^text\//i;

const queue: string[] = [];
let processing = false;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_EXTRACTED_CHARS);
}

function supportedKind(attachment: AttachmentRow): 'text' | 'pdf' | 'docx' | null {
  const ext = path.extname(attachment.filename).toLowerCase();
  const mimeType = attachment.mimeType.toLowerCase();

  if (TEXT_MIME_RE.test(mimeType) || ext === '.txt' || ext === '.md' || ext === '.csv') {
    return 'text';
  }
  if (mimeType === 'application/pdf' || ext === '.pdf') {
    return 'pdf';
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    return 'docx';
  }

  return null;
}

async function extractTextFromBuffer(attachment: AttachmentRow, buffer: Buffer): Promise<string | null> {
  const kind = supportedKind(attachment);

  if (!kind) return null;
  if (kind === 'text') return buffer.toString('utf8');
  if (kind === 'pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return parsed.text;
    } finally {
      await parser.destroy();
    }
  }

  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function updateFailure(attachmentId: string, status: 'failed' | 'unsupported', message: string | null) {
  await db.update(attachments)
    .set({
      extractionStatus: status,
      extractionError: message,
      extractedAt: new Date(),
      indexedAt: null,
    })
    .where(eq(attachments.id, attachmentId));
}

async function writeAttachmentEmbeddings(attachmentId: string, text: string): Promise<string | null> {
  const chunks = chunkText(text).filter((chunk) => chunk.trim()).slice(0, MAX_EMBEDDING_CHUNKS);
  await db.delete(attachmentEmbeddings).where(eq(attachmentEmbeddings.attachmentId, attachmentId));

  if (chunks.length === 0) {
    return null;
  }

  try {
    const provider = createEmbeddingProvider();
    const embeddings = await provider.embedMany(chunks);
    await db.insert(attachmentEmbeddings).values(
      chunks.map((chunk, index) => ({
        attachmentId,
        chunkIndex: index,
        chunkText: chunk,
        embedding: embeddings[index],
      })),
    );
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Embedding generation failed';
  }
}

export async function resetAttachmentIndexing(attachmentId: string) {
  await db.delete(attachmentEmbeddings).where(eq(attachmentEmbeddings.attachmentId, attachmentId));
}

export async function indexAttachmentNow(attachmentId: string): Promise<void> {
  const [attachment] = await db.select().from(attachments).where(eq(attachments.id, attachmentId));
  if (!attachment?.articleId) return;

  await db.update(attachments)
    .set({ extractionStatus: 'processing', extractionError: null })
    .where(eq(attachments.id, attachmentId));

  const kind = supportedKind(attachment);
  if (!kind) {
    await resetAttachmentIndexing(attachmentId);
    await updateFailure(attachmentId, 'unsupported', null);
    return;
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(resolveAttachmentPath(attachment.storagePath));
  } catch (err) {
    await resetAttachmentIndexing(attachmentId);
    await updateFailure(
      attachmentId,
      'failed',
      err instanceof Error ? err.message : 'Attachment file could not be read',
    );
    return;
  }

  try {
    const extracted = await extractTextFromBuffer(attachment, buffer);
    const extractedText = normalizeText(extracted ?? '');
    const contentHash = createHash('sha256').update(buffer).digest('hex');
    const embeddingError = extractedText ? await writeAttachmentEmbeddings(attachmentId, extractedText) : null;

    await db.update(attachments)
      .set({
        extractionStatus: 'succeeded',
        extractedText,
        extractionError: embeddingError,
        extractedAt: new Date(),
        indexedAt: new Date(),
        contentHash,
      })
      .where(eq(attachments.id, attachmentId));
  } catch (err) {
    await resetAttachmentIndexing(attachmentId);
    await updateFailure(
      attachmentId,
      'failed',
      err instanceof Error ? err.message : 'Attachment text extraction failed',
    );
  }
}

async function drainQueue() {
  if (processing) return;
  processing = true;
  try {
    while (queue.length > 0) {
      const attachmentId = queue.shift();
      if (!attachmentId) continue;
      await indexAttachmentNow(attachmentId).catch((err) => {
        console.error('Attachment indexing failed', { attachmentId, error: err });
      });
    }
  } finally {
    processing = false;
  }
}

export function enqueueAttachmentIndexing(attachmentId: string) {
  if (!queue.includes(attachmentId)) {
    queue.push(attachmentId);
  }
  void drainQueue();
}
