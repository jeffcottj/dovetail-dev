export interface McpConfig {
  apiBaseUrl: string;
  apiKey: string;
  port: number;
  requestTimeoutMs: number;
}

function parseUrl(value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error('MCP_API_BASE_URL is required');
  }
  try {
    new URL(value);
  } catch {
    throw new Error(`MCP_API_BASE_URL is not a valid URL: ${value}`);
  }
  return value.replace(/\/+$/, '');
}

function parseKey(value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error('MCP_API_KEY is required');
  }
  return value;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`MCP_PORT must be a valid port: ${value}`);
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  return {
    apiBaseUrl: parseUrl(env.MCP_API_BASE_URL),
    apiKey: parseKey(env.MCP_API_KEY),
    port: parsePort(env.MCP_PORT, 3002),
    requestTimeoutMs: parsePort(env.MCP_REQUEST_TIMEOUT_MS, 15000),
  };
}

export function redactKey(apiKey: string): string {
  if (apiKey.length <= 8) return '***';
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}
