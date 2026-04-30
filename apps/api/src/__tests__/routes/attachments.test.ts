import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createChain } from '../helpers/db-mock.js';
import { COOKIE_NAME, makeToken } from '../helpers/token.js';

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

vi.mock('../../services/permissions.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/permissions.js')>();
  return {
    ...actual,
    canReadArticle: vi.fn(),
    canEditArticle: vi.fn(),
  };
});

vi.mock('../../services/attachment-indexing.js', () => ({
  enqueueAttachmentIndexing: vi.fn(),
  resetAttachmentIndexing: vi.fn().mockResolvedValue(undefined),
}));

import { app } from '../../app.js';
import { db } from '@dovetail/db';
import { canEditArticle, canReadArticle } from '../../services/permissions.js';

const KB_ID = '00000000-0000-4000-8000-000000000001';
const CAT_ID = '00000000-0000-4000-8000-000000000002';
const ART_ID = '00000000-0000-4000-8000-000000000003';
const ATT_ID = '00000000-0000-4000-8000-000000000004';

const mockKb = {
  id: KB_ID,
  name: 'Housing',
  slug: 'housing',
  description: null,
  defaultAccess: 'org_viewer',
  createdAt: new Date(),
};

const mockArticle = {
  id: ART_ID,
  categoryId: CAT_ID,
  status: 'published' as const,
  knowledgeBaseId: KB_ID,
};

const mockAttachment = {
  id: ATT_ID,
  articleId: ART_ID,
  filename: 'notice.txt',
  storagePath: 'uploads/attachments/notice.txt',
  mimeType: 'text/plain',
  sizeBytes: 6,
  createdAt: new Date(),
};

describe('Attachment routes', () => {
  let token: string;
  let uploadsDir: string;
  let previousUploadsDir: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    token = await makeToken({ sub: 'user-1', role: 'viewer' });
    previousUploadsDir = process.env.UPLOADS_DIR;
    uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dovetail-attachments-'));
    process.env.UPLOADS_DIR = uploadsDir;
    (canReadArticle as Mock).mockResolvedValue(true);
    (canEditArticle as Mock).mockResolvedValue(true);
  });

  afterEach(async () => {
    if (previousUploadsDir === undefined) {
      delete process.env.UPLOADS_DIR;
    } else {
      process.env.UPLOADS_DIR = previousUploadsDir;
    }
    await fs.rm(uploadsDir, { recursive: true, force: true });
  });

  it('lists attachments for a readable KB-scoped article', async () => {
    (db.select as Mock)
      .mockReturnValueOnce(createChain([mockKb]))
      .mockReturnValueOnce(createChain([mockArticle]))
      .mockReturnValueOnce(createChain([mockAttachment]));

    const res = await supertest(app)
      .get(`/api/knowledge-bases/${KB_ID}/articles/${ART_ID}/attachments`)
      .set('Cookie', `${COOKIE_NAME}=${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        id: ATT_ID,
        articleId: ART_ID,
        filename: 'notice.txt',
        mimeType: 'text/plain',
        sizeBytes: 6,
      }),
    ]);
  });

  it('hides attachments when the article is not readable', async () => {
    (canReadArticle as Mock).mockResolvedValue(false);
    (db.select as Mock)
      .mockReturnValueOnce(createChain([mockKb]))
      .mockReturnValueOnce(createChain([mockArticle]));

    const res = await supertest(app)
      .get(`/api/knowledge-bases/${KB_ID}/articles/${ART_ID}/attachments`)
      .set('Cookie', `${COOKIE_NAME}=${token}`);

    expect(res.status).toBe(404);
  });

  it('downloads attachment bytes from UPLOADS_DIR', async () => {
    const attachmentDir = path.join(uploadsDir, 'attachments');
    await fs.mkdir(attachmentDir, { recursive: true });
    await fs.writeFile(path.join(attachmentDir, 'notice.txt'), 'hello\n');

    (db.select as Mock)
      .mockReturnValueOnce(createChain([mockAttachment]))
      .mockReturnValueOnce(createChain([mockArticle]));

    const res = await supertest(app)
      .get(`/api/attachments/${ATT_ID}/download`)
      .set('Cookie', `${COOKIE_NAME}=${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-disposition']).toContain('notice.txt');
    expect(res.text).toBe('hello\n');
  });

  it('creates an attachment for an editor', async () => {
    const created = {
      ...mockAttachment,
      filename: 'upload.txt',
      storagePath: 'uploads/attachments/generated.txt',
      sizeBytes: 5,
    };
    (db.select as Mock)
      .mockReturnValueOnce(createChain([mockKb]))
      .mockReturnValueOnce(createChain([mockArticle]));
    (db.insert as Mock).mockReturnValueOnce(createChain([created]));
    (db.update as Mock).mockReturnValueOnce(createChain([]));

    const res = await supertest(app)
      .post(`/api/knowledge-bases/${KB_ID}/articles/${ART_ID}/attachments`)
      .set('Cookie', `${COOKIE_NAME}=${token}`)
      .attach('file', Buffer.from('hello'), {
        filename: 'upload.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(expect.objectContaining({
      filename: 'upload.txt',
      mimeType: 'text/plain',
      sizeBytes: 5,
    }));
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
  });

  it('rejects attachment upload when edit access is missing', async () => {
    (canEditArticle as Mock).mockResolvedValue(false);
    (db.select as Mock)
      .mockReturnValueOnce(createChain([mockKb]))
      .mockReturnValueOnce(createChain([mockArticle]));

    const res = await supertest(app)
      .post(`/api/knowledge-bases/${KB_ID}/articles/${ART_ID}/attachments`)
      .set('Cookie', `${COOKIE_NAME}=${token}`)
      .attach('file', Buffer.from('hello'), {
        filename: 'upload.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(403);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('replaces an attachment for an editor', async () => {
    const updated = {
      ...mockAttachment,
      filename: 'replacement.txt',
      sizeBytes: 11,
    };
    (db.select as Mock)
      .mockReturnValueOnce(createChain([mockKb]))
      .mockReturnValueOnce(createChain([mockArticle]))
      .mockReturnValueOnce(createChain([mockAttachment]));
    (db.update as Mock)
      .mockReturnValueOnce(createChain([updated]))
      .mockReturnValueOnce(createChain([]));

    const res = await supertest(app)
      .patch(`/api/knowledge-bases/${KB_ID}/articles/${ART_ID}/attachments/${ATT_ID}`)
      .set('Cookie', `${COOKIE_NAME}=${token}`)
      .attach('file', Buffer.from('replacement'), {
        filename: 'replacement.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      filename: 'replacement.txt',
      sizeBytes: 11,
    }));
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it('deletes an attachment for an editor', async () => {
    (db.select as Mock)
      .mockReturnValueOnce(createChain([mockKb]))
      .mockReturnValueOnce(createChain([mockArticle]))
      .mockReturnValueOnce(createChain([mockAttachment]));
    (db.delete as Mock).mockReturnValueOnce(createChain([]));
    (db.update as Mock).mockReturnValueOnce(createChain([]));

    const res = await supertest(app)
      .delete(`/api/knowledge-bases/${KB_ID}/articles/${ART_ID}/attachments/${ATT_ID}`)
      .set('Cookie', `${COOKIE_NAME}=${token}`);

    expect(res.status).toBe(204);
    expect(db.delete).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
  });
});
