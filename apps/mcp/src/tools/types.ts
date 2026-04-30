import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';
import type { ApiClient } from '../api-client.js';
import { ApiClientError } from '../errors.js';

export interface ToolDefinition<Shape extends ZodRawShape | undefined = ZodRawShape | undefined> {
  name: string;
  config: {
    title?: string;
    description: string;
    inputSchema?: Shape;
  };
  handler: (
    args: Shape extends ZodRawShape ? Record<string, unknown> : undefined,
    deps: { client: ApiClient },
  ) => Promise<CallToolResult>;
}

export function jsonResult(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
    structuredContent: value as Record<string, unknown>,
  };
}

export function errorResult(message: string, details?: unknown): CallToolResult {
  const text = details === undefined
    ? message
    : `${message}\n${JSON.stringify(details, null, 2)}`;
  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}

export async function runWithErrorHandling(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiClientError) {
      return errorResult(err.message, err.details ?? undefined);
    }
    return errorResult((err as Error).message ?? 'Unknown error');
  }
}
