import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createChain } from '../helpers/db-mock.js';

vi.mock('@dovetail/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dovetail/db')>();
  return {
    ...actual,
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

const embedMany = vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);

vi.mock('../../services/embeddings.js', () => ({
  createEmbeddingProvider: vi.fn(() => ({
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedMany,
  })),
}));

import { db } from '@dovetail/db';
import { indexAttachmentNow } from '../../services/attachment-indexing.js';

const ATTACHMENT_ID = '00000000-0000-4000-8000-000000000004';

function mockAttachment(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTACHMENT_ID,
    articleId: '00000000-0000-4000-8000-000000000003',
    filename: 'notice.txt',
    storagePath: 'uploads/attachments/notice.txt',
    mimeType: 'text/plain',
    sizeBytes: 6,
    extractionStatus: 'pending',
    extractedText: null,
    extractionError: null,
    extractedAt: null,
    indexedAt: null,
    contentHash: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('attachment indexing', () => {
  let uploadsDir: string;
  let previousUploadsDir: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    embedMany.mockResolvedValue([[0.1, 0.2, 0.3]]);
    previousUploadsDir = process.env.UPLOADS_DIR;
    uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dovetail-attachment-indexing-'));
    process.env.UPLOADS_DIR = uploadsDir;
    (db.update as Mock).mockReturnValue(createChain([]));
    (db.delete as Mock).mockReturnValue(createChain([]));
    (db.insert as Mock).mockReturnValue(createChain([]));
  });

  afterEach(async () => {
    if (previousUploadsDir === undefined) {
      delete process.env.UPLOADS_DIR;
    } else {
      process.env.UPLOADS_DIR = previousUploadsDir;
    }
    await fs.rm(uploadsDir, { recursive: true, force: true });
  });

  it('extracts text files and stores attachment embeddings', async () => {
    await fs.mkdir(path.join(uploadsDir, 'attachments'), { recursive: true });
    await fs.writeFile(path.join(uploadsDir, 'attachments', 'notice.txt'), 'marigold escrow remedy');
    (db.select as Mock).mockReturnValueOnce(createChain([mockAttachment()]));

    await indexAttachmentNow(ATTACHMENT_ID);

    expect(embedMany).toHaveBeenCalledWith(['marigold escrow remedy']);
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it('marks unsupported files without generating embeddings', async () => {
    (db.select as Mock).mockReturnValueOnce(createChain([mockAttachment({
      filename: 'image.png',
      storagePath: 'uploads/attachments/image.png',
      mimeType: 'image/png',
    })]));

    await indexAttachmentNow(ATTACHMENT_ID);

    expect(embedMany).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it('marks missing files as failed', async () => {
    (db.select as Mock).mockReturnValueOnce(createChain([mockAttachment()]));

    await indexAttachmentNow(ATTACHMENT_ID);

    expect(embedMany).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it('does not generate embeddings for empty extracted text', async () => {
    await fs.mkdir(path.join(uploadsDir, 'attachments'), { recursive: true });
    await fs.writeFile(path.join(uploadsDir, 'attachments', 'notice.txt'), '   \n   ');
    (db.select as Mock).mockReturnValueOnce(createChain([mockAttachment()]));

    await indexAttachmentNow(ATTACHMENT_ID);

    expect(embedMany).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
