import { describe, expect, it } from 'vitest';
import { loadConfig, redactKey } from '../config.js';

describe('loadConfig', () => {
  it('loads required values', () => {
    const cfg = loadConfig({
      MCP_API_BASE_URL: 'http://localhost:3001',
      MCP_API_KEY: 'abcd1234',
      MCP_PORT: '3002',
    } as NodeJS.ProcessEnv);
    expect(cfg.apiBaseUrl).toBe('http://localhost:3001');
    expect(cfg.apiKey).toBe('abcd1234');
    expect(cfg.port).toBe(3002);
  });

  it('strips trailing slashes from base URL', () => {
    const cfg = loadConfig({
      MCP_API_BASE_URL: 'http://localhost:3001///',
      MCP_API_KEY: 'k',
    } as NodeJS.ProcessEnv);
    expect(cfg.apiBaseUrl).toBe('http://localhost:3001');
  });

  it('throws when api key missing', () => {
    expect(() => loadConfig({ MCP_API_BASE_URL: 'http://localhost:3001' } as NodeJS.ProcessEnv)).toThrow(/MCP_API_KEY/);
  });

  it('throws when api base url missing', () => {
    expect(() => loadConfig({ MCP_API_KEY: 'k' } as NodeJS.ProcessEnv)).toThrow(/MCP_API_BASE_URL/);
  });

  it('throws when api base url is invalid', () => {
    expect(() => loadConfig({ MCP_API_BASE_URL: 'not-a-url', MCP_API_KEY: 'k' } as NodeJS.ProcessEnv)).toThrow(/valid URL/);
  });

  it('throws when port is invalid', () => {
    expect(() => loadConfig({
      MCP_API_BASE_URL: 'http://localhost:3001',
      MCP_API_KEY: 'k',
      MCP_PORT: 'abc',
    } as NodeJS.ProcessEnv)).toThrow();
  });
});

describe('redactKey', () => {
  it('redacts long keys', () => {
    expect(redactKey('abcdefghijklmnop')).toBe('abcd...mnop');
  });
  it('hides short keys entirely', () => {
    expect(redactKey('short')).toBe('***');
  });
});
