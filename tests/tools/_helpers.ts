import { vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../../src/client.js";

interface ToolConfig {
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

/**
 * Captures tool handlers registered via server.registerTool().
 * Returns maps from tool name → handler function and tool name → config.
 */
export function createMockServer() {
  const handlers = new Map<string, (...args: any[]) => any>();
  const configs = new Map<string, ToolConfig>();
  const server = {
    registerTool: vi.fn((...args: any[]) => {
      // server.registerTool(name, config, handler)
      const name = args[0] as string;
      const config = args[1] as ToolConfig;
      const handler = args[2] as (...a: any[]) => any;
      configs.set(name, config);
      handlers.set(name, handler);
    }),
  } as unknown as McpServer;
  return { server, handlers, configs };
}

/**
 * Creates a ProtectClient with all methods mocked.
 */
export function createMockClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    getBinary: vi.fn(),
    postBinary: vi.fn(),
  } as unknown as ProtectClient;
}

/** Type-safe way to access mock fns on the mock client */
export function mockFn(client: ProtectClient, method: keyof ProtectClient) {
  return (client as any)[method] as ReturnType<typeof vi.fn>;
}
