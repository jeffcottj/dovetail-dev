import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, redactKey } from './config.js';
import { createApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, '../../../.env'), quiet: true });

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`[mcp] startup failed: ${(err as Error).message}`);
    process.exit(1);
  }

  const app = createApp({ config });
  const server = app.listen(config.port, () => {
    console.log(
      `[mcp] listening on :${config.port} -> ${config.apiBaseUrl} (rag-key=${redactKey(config.ragApiKey)}, inbound=bearer)`,
    );
  });

  const shutdown = (signal: string) => {
    console.log(`[mcp] received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[mcp] unhandled error', err);
  process.exit(1);
});
