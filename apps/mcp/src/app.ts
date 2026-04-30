import express, { type Express } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpConfig } from './config.js';
import { createApiClient } from './api-client.js';
import { createMcpServer } from './server.js';
import { createHealthHandler } from './health.js';

export interface CreateAppOptions {
  config: McpConfig;
  fetcher?: typeof fetch;
}

export function createApp({ config, fetcher }: CreateAppOptions): Express {
  const client = createApiClient({ config, fetcher });
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/health', createHealthHandler({ config, client }));

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post('/mcp', async (req, res) => {
    const sessionId = req.header('mcp-session-id');
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      if (sessionId) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Unknown session' },
          id: null,
        });
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

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };

      const server = createMcpServer({ client });
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  const sessionRequestHandler = async (req: express.Request, res: express.Response) => {
    const sessionId = req.header('mcp-session-id');
    if (!sessionId) {
      res.status(400).end();
      return;
    }
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).end();
      return;
    }
    await transport.handleRequest(req, res);
  };

  app.get('/mcp', sessionRequestHandler);
  app.delete('/mcp', sessionRequestHandler);

  return app;
}
