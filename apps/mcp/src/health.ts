import type { Request, Response } from 'express';
import type { McpConfig } from './config.js';

export interface HealthDeps {
  config: McpConfig;
  fetcher?: typeof fetch;
}

export function createHealthHandler({ config, fetcher = fetch }: HealthDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const deep = req.query.deep === '1' || req.query.deep === 'true';
    const base = {
      status: 'ok' as const,
      apiBaseUrl: config.apiBaseUrl,
      inboundAuth: 'bearer' as const,
    };

    if (!deep) {
      res.json(base);
      return;
    }

    let upstreamReachable = false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
      try {
        const response = await fetcher(`${config.apiBaseUrl}/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        upstreamReachable = response.ok;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      upstreamReachable = false;
    }

    res.json({ ...base, upstreamReachable });
  };
}
