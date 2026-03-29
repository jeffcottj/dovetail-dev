import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { adminActivityEvents, db, apiKeys, apiKeyKnowledgeBases } from '@dovetail/db';
import { authMiddleware, type AuthRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { buildAdminActivityInsert } from '../../services/admin-activity.js';
import { validateBody } from '../../utils/validate.js';

export const apiKeysRouter: Router = Router();

const createKeySchema = z.object({
  name: z.string().min(1).max(200),
  knowledgeBaseIds: z.array(z.string().uuid()).min(1),
});

// POST /api/admin/api-keys — create a new API key (returns raw key once)
apiKeysRouter.post('/', authMiddleware, requireRole('admin'), validateBody(createKeySchema), async (req: AuthRequest, res) => {
  const { name, knowledgeBaseIds } = req.body;
  const rawKey = randomBytes(32).toString('base64url');
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const created = await db.transaction(async (tx) => {
    const [created] = await tx.insert(apiKeys).values({
      name,
      keyHash,
      createdBy: req.user!.id,
    }).returning();
    if (!created) {
      throw new Error('API key creation failed');
    }

    await tx.insert(apiKeyKnowledgeBases).values(
      knowledgeBaseIds.map((kbId: string) => ({ apiKeyId: created.id, knowledgeBaseId: kbId })),
    );

    await tx.insert(adminActivityEvents).values(
      knowledgeBaseIds.map((knowledgeBaseId: string) => buildAdminActivityInsert({
        kind: 'api_key.created',
        actorId: req.user!.id,
        knowledgeBaseId,
        subjectId: created.id,
        subjectLabel: created.name,
      })),
    );

    return created;
  });

  res.status(201).json({
    id: created.id,
    name: created.name,
    key: rawKey, // only returned once
    createdAt: created.createdAt,
    knowledgeBaseIds,
  });
});

// GET /api/admin/api-keys — list all API keys (never shows raw key)
apiKeysRouter.get('/', authMiddleware, requireRole('admin'), async (_req, res) => {
  const keys = await db.select({
    id: apiKeys.id,
    name: apiKeys.name,
    createdBy: apiKeys.createdBy,
    createdAt: apiKeys.createdAt,
    lastUsedAt: apiKeys.lastUsedAt,
    revokedAt: apiKeys.revokedAt,
  }).from(apiKeys);

  // Enrich with KB associations
  const enriched = await Promise.all(keys.map(async (key) => {
    const kbs = await db.select({ knowledgeBaseId: apiKeyKnowledgeBases.knowledgeBaseId })
      .from(apiKeyKnowledgeBases)
      .where(eq(apiKeyKnowledgeBases.apiKeyId, key.id));
    return { ...key, knowledgeBaseIds: kbs.map(kb => kb.knowledgeBaseId) };
  }));

  res.json(enriched);
});

// DELETE /api/admin/api-keys/:id — revoke an API key
apiKeysRouter.delete('/:id', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const result = await db.transaction(async (tx) => {
    const [key] = await tx.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    if (!key) {
      return { outcome: 'not_found' as const };
    }

    if (key.revokedAt) {
      return { outcome: 'already_revoked' as const };
    }

    const [revoked] = await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
      .returning();

    if (!revoked) {
      return { outcome: 'already_revoked' as const };
    }

    const associatedKnowledgeBases = await tx
      .select({ knowledgeBaseId: apiKeyKnowledgeBases.knowledgeBaseId })
      .from(apiKeyKnowledgeBases)
      .where(eq(apiKeyKnowledgeBases.apiKeyId, id));

    const activityRows = associatedKnowledgeBases.length > 0
      ? associatedKnowledgeBases.map(({ knowledgeBaseId }) => buildAdminActivityInsert({
        kind: 'api_key.revoked',
        actorId: req.user!.id,
        knowledgeBaseId,
        subjectId: key.id,
        subjectLabel: key.name,
      }))
      : [buildAdminActivityInsert({
        kind: 'api_key.revoked',
        actorId: req.user!.id,
        subjectId: key.id,
        subjectLabel: key.name,
      })];

    await tx.insert(adminActivityEvents).values(activityRows);

    return { outcome: 'revoked' as const };
  });

  if (result.outcome === 'not_found') {
    res.status(404).json({ error: 'API key not found' });
    return;
  }

  if (result.outcome === 'already_revoked') {
    res.status(409).json({ error: 'API key already revoked' });
    return;
  }

  res.status(200).json({ message: 'API key revoked' });
});
