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

import { categoriesRouter } from './routes/categories.js';
app.use('/api/categories', categoriesRouter);

import { articlesRouter } from './routes/articles.js';
app.use('/api/articles', articlesRouter);

import { versionsRouter } from './routes/versions.js';
app.use('/api/articles/:id/versions', versionsRouter);

import { searchRouter } from './routes/search.js';
app.use('/api/search', searchRouter);

// --- Mount route files above this line ---

// Global error handler — must be after all routes
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
