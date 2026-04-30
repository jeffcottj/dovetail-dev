import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
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

vi.mock('../../services/docx-conversion.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/docx-conversion.js')>();
  return {
    ...actual,
    convertDocxFile: vi.fn().mockResolvedValue({
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Converted' }] }] },
      plainText: 'Converted',
      suggestedTitle: 'Converted',
      warnings: [],
    }),
  };
});

import { app } from '../../app.js';
import { db } from '@dovetail/db';
import { convertDocxFile } from '../../services/docx-conversion.js';

const KB_ID = '00000000-0000-4000-8000-000000000100';
const CAT_ID = '00000000-0000-4000-8000-000000000001';
const ART_ID = '00000000-0000-4000-8000-000000000010';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const mockKb = {
  id: KB_ID,
  name: 'Default',
  slug: 'default',
  description: null,
  defaultAccess: 'org_viewer' as const,
  createdAt: new Date(),
};

describe('DOCX conversion route', () => {
  let uploadsDir: string;
  let editorToken: string;
  let viewerToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dovetail-docx-route-'));
    process.env.UPLOADS_DIR = uploadsDir;
    editorToken = await makeToken({ sub: 'editor-user', role: 'editor' });
    viewerToken = await makeToken({ sub: 'viewer-user', role: 'viewer' });
  });

  afterEach(async () => {
    delete process.env.UPLOADS_DIR;
    await fs.rm(uploadsDir, { recursive: true, force: true });
  });

  it('converts for an editor with category access', async () => {
    (db.select as Mock)
      .mockReturnValueOnce(createChain([mockKb]))
      .mockReturnValueOnce(createChain([{ id: CAT_ID, knowledgeBaseId: KB_ID }]));
    (db.execute as Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ defaultAccess: 'org_viewer', kbRole: null }]);

    const res = await supertest(app)
      .post(`/api/knowledge-bases/${KB_ID}/document-conversions/docx`)
      .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
      .field('categoryId', CAT_ID)
      .attach('file', Buffer.from('PK\u0003\u0004word/'), { filename: 'notice.docx', contentType: DOCX_MIME });

    expect(res.status).toBe(200);
    expect(res.body.content.type).toBe('doc');
    expect(convertDocxFile).toHaveBeenCalledOnce();
  });

  it('rejects a viewer without category edit access', async () => {
    (db.select as Mock)
      .mockReturnValueOnce(createChain([mockKb]))
      .mockReturnValueOnce(createChain([{ id: CAT_ID, knowledgeBaseId: KB_ID }]));
    (db.execute as Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ defaultAccess: 'org_viewer', kbRole: null }]);

    const res = await supertest(app)
      .post(`/api/knowledge-bases/${KB_ID}/document-conversions/docx`)
      .set('Cookie', `${COOKIE_NAME}=${viewerToken}`)
      .field('categoryId', CAT_ID)
      .attach('file', Buffer.from('PK\u0003\u0004word/'), { filename: 'notice.docx', contentType: DOCX_MIME });

    expect(res.status).toBe(403);
    expect(convertDocxFile).not.toHaveBeenCalled();
  });

  it('converts for an editor with article access', async () => {
    (db.select as Mock)
      .mockReturnValueOnce(createChain([mockKb]))
      .mockReturnValueOnce(createChain([{ id: ART_ID, categoryId: CAT_ID, knowledgeBaseId: KB_ID }]));
    (db.execute as Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ defaultAccess: 'org_viewer', kbRole: null }]);

    const res = await supertest(app)
      .post(`/api/knowledge-bases/${KB_ID}/document-conversions/docx`)
      .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
      .field('articleId', ART_ID)
      .attach('file', Buffer.from('PK\u0003\u0004word/'), { filename: 'notice.docx', contentType: DOCX_MIME });

    expect(res.status).toBe(200);
    expect(res.body.suggestedTitle).toBe('Converted');
  });

  it('rejects non-DOCX uploads', async () => {
    (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

    const res = await supertest(app)
      .post(`/api/knowledge-bases/${KB_ID}/document-conversions/docx`)
      .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
      .field('categoryId', CAT_ID)
      .attach('file', Buffer.from('hello'), { filename: 'notice.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(convertDocxFile).not.toHaveBeenCalled();
  });

  it('requires exactly one target scope', async () => {
    (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

    const res = await supertest(app)
      .post(`/api/knowledge-bases/${KB_ID}/document-conversions/docx`)
      .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
      .field('categoryId', CAT_ID)
      .field('articleId', ART_ID)
      .attach('file', Buffer.from('PK\u0003\u0004word/'), { filename: 'notice.docx', contentType: DOCX_MIME });

    expect(res.status).toBe(400);
    expect(convertDocxFile).not.toHaveBeenCalled();
  });
});
