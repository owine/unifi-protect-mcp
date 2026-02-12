import { vi, expect } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../../src/client.js";

interface ToolConfig {
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

interface ToolResult {
  isError?: boolean;
  content: { type: string; text?: string; data?: string; mimeType?: string }[];
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

/** Assert a tool result is a success containing the given substring */
export function expectSuccess(result: ToolResult, substring: string) {
  expect(result.isError).toBeUndefined();
  expect(result.content[0].text).toContain(substring);
}

/** Assert a tool result is an error with text starting with "Error:" */
export function expectError(result: ToolResult) {
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toMatch(/^Error:/);
}

/**
 * Extract inputSchema from a tool config and wrap it in z.object() for validation testing.
 * Returns a Zod object schema that can be used with .safeParse().
 */
export function parseInputSchema(
  configs: Map<string, ToolConfig>,
  toolName: string
) {
  const config = configs.get(toolName);
  if (!config?.inputSchema) {
    throw new Error(`Tool "${toolName}" has no inputSchema`);
  }
  return z.object(config.inputSchema as Record<string, z.ZodType>);
}
