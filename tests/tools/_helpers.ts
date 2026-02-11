import { vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../../src/client.js";

/**
 * Captures tool handlers registered via server.tool().
 * Returns a map from tool name → handler function.
 */
export function createMockServer() {
  const handlers = new Map<string, (...args: any[]) => any>();
  const server = {
    tool: vi.fn((...args: any[]) => {
      // server.tool(name, description, schema, handler)
      const name = args[0] as string;
      const handler = args[args.length - 1] as (...a: any[]) => any;
      handlers.set(name, handler);
    }),
  } as unknown as McpServer;
  return { server, handlers };
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
