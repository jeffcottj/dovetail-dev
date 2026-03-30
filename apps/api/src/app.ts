import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { authMiddleware, type AuthRequest } from './middleware/auth.js';

export const app: ReturnType<typeof express> = express();

app.use(helmet());
app.use(cors({
  origin: process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/me', authMiddleware, (req: AuthRequest, res) => {
  res.json(req.user);
});

import { meRouter } from './routes/me.js';
app.use('/api/me', meRouter);

import { categoriesRouter } from './routes/categories.js';
import { resolveKb } from './middleware/resolveKb.js';
app.use('/api/knowledge-bases/:kbId/categories', resolveKb, categoriesRouter);

import { articlesRouter } from './routes/articles.js';
app.use('/api/knowledge-bases/:kbId/articles', resolveKb, articlesRouter);

import { versionsRouter } from './routes/versions.js';
app.use('/api/knowledge-bases/:kbId/articles/:id/versions', resolveKb, versionsRouter);

import { searchRouter } from './routes/search.js';
app.use('/api/knowledge-bases/:kbId/search', resolveKb, searchRouter);

import { apiKeysRouter } from './routes/admin/api-keys.js';
app.use('/api/admin/api-keys', apiKeysRouter);

import { adminUsersRouter } from './routes/admin/users.js';
app.use('/api/admin/users', adminUsersRouter);

import { overviewRouter } from './routes/admin/overview.js';
app.use('/api/admin/overview', overviewRouter);

import { ragRouter } from './routes/rag.js';
app.use('/api/v1/rag', ragRouter);

import { tagsRouter, articleTagsRouter } from './routes/tags.js';
app.use('/api/knowledge-bases/:kbId/tags', resolveKb, tagsRouter);
app.use('/api/knowledge-bases/:kbId/articles/:id/tags', resolveKb, articleTagsRouter);

import { importRouter } from './routes/admin/import.js';
app.use('/api/knowledge-bases/:kbId/admin/import', resolveKb, importRouter);

import { bulkPublishRouter } from './routes/admin/bulk-publish.js';
app.use('/api/knowledge-bases/:kbId/admin/articles/bulk-publish', resolveKb, bulkPublishRouter);

import { kbOverviewRouter } from './routes/admin/kb-overview.js';
app.use('/api/knowledge-bases/:kbId/admin/overview', authMiddleware, resolveKb, kbOverviewRouter);

import { knowledgeBasesRouter } from './routes/knowledge-bases.js';
app.use('/api/knowledge-bases', knowledgeBasesRouter);

// --- Mount route files above this line ---

// Global error handler — must be after all routes
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
