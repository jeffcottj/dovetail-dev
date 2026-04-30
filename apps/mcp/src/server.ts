import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './api-client.js';
import { tools } from './tools/index.js';

export interface CreateServerOptions {
  client: ApiClient;
  name?: string;
  version?: string;
}

export function createMcpServer({ client, name = 'dovetail-mcp', version = '0.1.0' }: CreateServerOptions): McpServer {
  const server = new McpServer({ name, version });

  for (const tool of tools) {
    const config = tool.config as {
      title?: string;
      description: string;
      inputSchema?: Record<string, unknown>;
    };

    if (config.inputSchema) {
      server.registerTool(
        tool.name,
        config as Parameters<McpServer['registerTool']>[1],
        (args: unknown) => tool.handler(args as never, { client }) as ReturnType<Parameters<McpServer['registerTool']>[2]>,
      );
    } else {
      server.registerTool(
        tool.name,
        config as Parameters<McpServer['registerTool']>[1],
        (() => tool.handler(undefined as never, { client })) as Parameters<McpServer['registerTool']>[2],
      );
    }
  }

  return server;
}
