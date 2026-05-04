import { describe, expect, it } from 'vitest';
import { loadConfig, redactKey } from '../config.js';

const REQUIRED = {
  MCP_API_BASE_URL: 'http://localhost:3001',
  DOVETAIL_RAG_API_KEY: 'rag-key',
  MCP_PUBLIC_BEARER_TOKEN: 'public-bearer',
};

describe('loadConfig', () => {
  it('loads required values', () => {
    const cfg = loadConfig({
      ...REQUIRED,
      DOVETAIL_RAG_API_KEY: 'abcd1234',
      MCP_PUBLIC_BEARER_TOKEN: 'public-token',
      MCP_PORT: '3002',
    } as NodeJS.ProcessEnv);
    expect(cfg.apiBaseUrl).toBe('http://localhost:3001');
    expect(cfg.ragApiKey).toBe('abcd1234');
    expect(cfg.publicBearerToken).toBe('public-token');
    expect(cfg.port).toBe(3002);
  });

  it('strips trailing slashes from base URL', () => {
    const cfg = loadConfig({
      ...REQUIRED,
      MCP_API_BASE_URL: 'http://localhost:3001///',
    } as NodeJS.ProcessEnv);
    expect(cfg.apiBaseUrl).toBe('http://localhost:3001');
  });

  it('throws when rag api key missing', () => {
    expect(() =>
      loadConfig({
        MCP_API_BASE_URL: 'http://localhost:3001',
        MCP_PUBLIC_BEARER_TOKEN: 'p',
      } as NodeJS.ProcessEnv),
    ).toThrow(/DOVETAIL_RAG_API_KEY/);
  });

  it('throws when public bearer token missing', () => {
    expect(() =>
      loadConfig({
        MCP_API_BASE_URL: 'http://localhost:3001',
        DOVETAIL_RAG_API_KEY: 'k',
      } as NodeJS.ProcessEnv),
    ).toThrow(/MCP_PUBLIC_BEARER_TOKEN/);
  });

  it('throws when api base url missing', () => {
    expect(() =>
      loadConfig({
        DOVETAIL_RAG_API_KEY: 'k',
        MCP_PUBLIC_BEARER_TOKEN: 'p',
      } as NodeJS.ProcessEnv),
    ).toThrow(/MCP_API_BASE_URL/);
  });

  it('throws when api base url is invalid', () => {
    expect(() =>
      loadConfig({
        ...REQUIRED,
        MCP_API_BASE_URL: 'not-a-url',
      } as NodeJS.ProcessEnv),
    ).toThrow(/valid URL/);
  });

  it('throws when port is invalid', () => {
    expect(() =>
      loadConfig({
        ...REQUIRED,
        MCP_PORT: 'abc',
      } as NodeJS.ProcessEnv),
    ).toThrow();
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
