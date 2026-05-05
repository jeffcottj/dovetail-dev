import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpConfig } from './config.js';
import { createApiClient, type ApiClient } from './api-client.js';
import { createMcpServer } from './server.js';
import { createHealthHandler } from './health.js';

export interface CreateAppOptions {
  config: McpConfig;
  fetcher?: typeof fetch;
  idleSessionTtlMs?: number;
}

interface Session {
  transport: StreamableHTTPServerTransport;
  client: ApiClient;
  token: string;
  lastSeenAt: number;
}

interface AuthedRequest extends Request {
  bearerToken?: string;
}

const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1000;

function unauthorized(res: Response): void {
  res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Unauthorized' },
    id: null,
  });
}

function requireBearer(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    unauthorized(res);
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  if (token === '') {
    unauthorized(res);
    return;
  }
  req.bearerToken = token;
  next();
}

export function createApp({ config, fetcher, idleSessionTtlMs = DEFAULT_IDLE_TTL_MS }: CreateAppOptions): Express {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/health', createHealthHandler({ config }));

  const sessions = new Map<string, Session>();

  function sweepIdleSessions(now: number): void {
    for (const [id, session] of sessions) {
      if (now - session.lastSeenAt > idleSessionTtlMs) {
        sessions.delete(id);
        try {
          void session.transport.close?.();
        } catch {
          // ignore
        }
      }
    }
  }

  app.post('/mcp', requireBearer, async (req: AuthedRequest, res) => {
    const now = Date.now();
    sweepIdleSessions(now);

    const token = req.bearerToken!;
    const sessionId = req.header('mcp-session-id');

    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Unknown session' },
          id: null,
        });
        return;
      }
      if (session.token !== token) {
        unauthorized(res);
        return;
      }
      session.lastSeenAt = now;
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    if (!isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Initialization required before non-initialize requests' },
        id: null,
      });
      return;
    }

    const client = createApiClient({ config, token, fetcher });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, client, token, lastSeenAt: Date.now() });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };

    const server = createMcpServer({ client });
    await server.connect(transport);

    await transport.handleRequest(req, res, req.body);
  });

  const sessionRequestHandler = async (req: AuthedRequest, res: express.Response) => {
    const now = Date.now();
    sweepIdleSessions(now);

    const token = req.bearerToken!;
    const sessionId = req.header('mcp-session-id');
    if (!sessionId) {
      res.status(400).end();
      return;
    }
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).end();
      return;
    }
    if (session.token !== token) {
      unauthorized(res);
      return;
    }
    session.lastSeenAt = now;
    await session.transport.handleRequest(req, res);
  };

  app.get('/mcp', requireBearer, sessionRequestHandler);
  app.delete('/mcp', requireBearer, sessionRequestHandler);

  return app;
}
