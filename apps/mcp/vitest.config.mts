import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      MCP_API_BASE_URL: 'http://localhost:3001',
      MCP_API_KEY: 'test-key',
      MCP_PORT: '3002',
    },
  },
});
