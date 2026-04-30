import type { Request, Response } from 'express';
import type { ApiClient } from './api-client.js';
import type { McpConfig } from './config.js';
import { redactKey } from './config.js';

export interface HealthDeps {
  config: McpConfig;
  client: ApiClient;
}

export function createHealthHandler({ config, client }: HealthDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const deep = req.query.deep === '1' || req.query.deep === 'true';
    const base = {
      status: 'ok' as const,
      apiBaseUrl: config.apiBaseUrl,
      apiKey: redactKey(config.apiKey),
    };

    if (!deep) {
      res.json(base);
      return;
    }

    const reachable = await client.ping();
    res.json({ ...base, upstreamReachable: reachable });
  };
}
