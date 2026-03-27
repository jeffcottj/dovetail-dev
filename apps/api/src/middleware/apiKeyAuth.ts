import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db, apiKeys, apiKeyKnowledgeBases } from '@dovetail/db';

export interface ApiKeyRequest extends Request {
  apiKeyId?: string;
  allowedKbIds?: string[];
}

export async function apiKeyAuth(req: ApiKeyRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }

  const rawKey = authHeader.slice(7);
  const keyHash = createHash('sha256').update(rawKey).digest('hex');

  const [key] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!key || key.revokedAt) {
    res.status(401).json({ error: 'Invalid or revoked API key' });
    return;
  }

  // Update last_used_at (fire-and-forget)
  db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id)).catch(() => {});

  req.apiKeyId = key.id;

  // Fetch allowed KB IDs
  const kbRows = await db.select({ knowledgeBaseId: apiKeyKnowledgeBases.knowledgeBaseId })
    .from(apiKeyKnowledgeBases)
    .where(eq(apiKeyKnowledgeBases.apiKeyId, key.id));
  req.allowedKbIds = kbRows.map(r => r.knowledgeBaseId);

  next();
}
