import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAllTools } from "../src/tools/index.js";
import type { ProtectClient } from "../src/client.js";
import { formatDryRun } from "../src/utils/safety.js";
import { createMockServer, createMockClient, mockFn } from "./tools/_helpers.js";

/**
 * Contract tests through the real MCP SDK. The per-domain tests capture
 * handlers and call them directly, which skips the SDK's input validation,
 * the JSON Schema it publishes, the client's validation of structuredContent
 * against that schema, and the per-call `extra` (abort signal). A result the
 * SDK rejects still passes there, so these run the real server and client.
 */

async function connect(toolClient: ProtectClient, readOnly = false): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerAllTools(server, toolClient, readOnly);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  // The SDK client validates structuredContent only against output schemas it
  // has cached from tools/list, which every real host calls first.
  await client.listTools();
  return client;
}

describe("output schemas through the SDK", () => {
  let mcpClient: Client;
  const toolClient = createMockClient();

  beforeAll(async () => {
    mcpClient = await connect(toolClient);
  });

  afterAll(async () => {
    await mcpClient.close();
  });

  // The SDK client validates structuredContent against the published JSON
  // Schema, and the server passes through what Protect returned. A schema
  // that forbids unlisted fields breaks the tool the day a firmware update
  // adds one.
  it("never forbids additional properties at any depth", async () => {
    const forbidding: string[] = [];
    const walk = (node: unknown, where: string) => {
      if (node === null || typeof node !== "object") return;
      if ((node as Record<string, unknown>).additionalProperties === false) forbidding.push(where);
      for (const [key, child] of Object.entries(node)) walk(child, `${where}.${key}`);
    };
    for (const tool of (await mcpClient.listTools()).tools) walk(tool.outputSchema, tool.name);
    expect(forbidding).toEqual([]);
  });

  it("returns a resource carrying a top-level field the schema does not list", async () => {
    mockFn(toolClient, "get").mockResolvedValueOnce({ id: "cam1", name: "Door", addedInNextFirmware: true });
    const result = await mcpClient.callTool({ name: "protect_get_camera", arguments: { id: "cam1" } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ id: "cam1", addedInNextFirmware: true });
  });

  // Live consoles send {} for an unset nested object, but a null there must
  // not take the whole list down with it.
  it("returns a list whose items carry null for a nested object", async () => {
    mockFn(toolClient, "get").mockResolvedValueOnce([{ id: "cam1", lcdMessage: null, ledSettings: null }]);
    const result = await mcpClient.callTool({ name: "protect_list_cameras", arguments: {} });
    expect(result.isError).toBeFalsy();
  });
});

describe("dry-run results through the SDK", () => {
  let mcpClient: Client;
  const toolClient = createMockClient();

  beforeAll(async () => {
    mcpClient = await connect(toolClient);
  });

  afterAll(async () => {
    await mcpClient.close();
  });

  it("returns the preview for a write tool that declares an outputSchema", async () => {
    const result = await mcpClient.callTool({
      name: "protect_update_camera",
      arguments: { id: "cam1", settings: { name: "Front" }, dryRun: true },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ dryRun: true, action: "PATCH", path: "/cameras/cam1" });
    expect(mockFn(toolClient, "patch")).not.toHaveBeenCalled();
  });
});

describe("dry-run preview against every write tool's published outputSchema", () => {
  const { server, configs } = createMockServer();
  registerAllTools(server, createMockClient(), false);
  const preview = formatDryRun("PATCH", "/things/thing1", { name: "x" });
  const writeToolsWithOutput = [...configs].filter(
    ([, config]) => config.annotations?.readOnlyHint === false && config.outputSchema !== undefined
  );

  it("covers the write tools that declare an outputSchema", () => {
    expect(writeToolsWithOutput.length).toBeGreaterThan(0);
  });

  for (const [name, config] of writeToolsWithOutput) {
    it(`${name} accepts the dry-run preview as structuredContent`, () => {
      // registerAllTools publishes every outputSchema as a loose Zod object.
      const schema = config.outputSchema as z.ZodType;
      expect(schema.safeParse(preview.structuredContent).success).toBe(true);
    });
  }
});
