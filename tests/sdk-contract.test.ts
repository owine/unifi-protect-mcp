import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAllTools } from "../src/tools/index.js";
import { ProtectClient } from "../src/client.js";
import { formatDryRun } from "../src/utils/safety.js";
import { MAX_SNAPSHOT_BYTES, MAX_UPLOAD_BASE64_CHARS } from "../src/utils/limits.js";
import { STDIO_DEFAULT_MAX_BUFFER_SIZE } from "@modelcontextprotocol/sdk/shared/stdio.js";
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

describe("payload sizes through the SDK", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function snapshot(bytes: number) {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
      new Response(new Uint8Array(bytes), { headers: { "content-type": "image/jpeg" } })
    ));
    const mcpClient = await connect(
      new ProtectClient({ host: "192.168.1.1", apiKey: "k", verifySsl: true, readOnly: true }),
      true
    );
    const result = await mcpClient.callTool({ name: "protect_get_snapshot", arguments: { id: "cam1" } });
    await mcpClient.close();
    return result;
  }

  // An SDK stdio client drops the connection on a message over its read
  // buffer, which a high-resolution snapshot used to exceed once base64-encoded.
  it("returns the largest allowed snapshot in a message an stdio peer can read", async () => {
    const result = await snapshot(MAX_SNAPSHOT_BYTES);
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result).length).toBeLessThan(STDIO_DEFAULT_MAX_BUFFER_SIZE);
  });

  it("refuses a larger snapshot with an error instead of an unreadable message", async () => {
    const result = await snapshot(MAX_SNAPSHOT_BYTES + 1);
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result).length).toBeLessThan(STDIO_DEFAULT_MAX_BUFFER_SIZE);
  });

  it("rejects an upload over the base64 ceiling at input validation", async () => {
    const postFile = vi.fn();
    const toolClient = createMockClient();
    mockFn(toolClient, "postFile").mockImplementation(postFile);
    const mcpClient = await connect(toolClient);
    const result = await mcpClient.callTool({
      name: "protect_upload_file",
      arguments: { fileType: "animations", base64Data: "A".repeat(MAX_UPLOAD_BASE64_CHARS + 4) },
    });
    await mcpClient.close();
    expect(result.isError).toBe(true);
    expect(postFile).not.toHaveBeenCalled();
  });
});

/**
 * Each confirm-gated tool with the smallest valid input besides confirm, and
 * the client method it calls. A dry run changes nothing, so it never needs
 * confirming; the real call must refuse without confirm: true.
 */
const CONFIRM_GATED: [string, Record<string, unknown>, "post" | "patch" | "delete"][] = [
  ["protect_disable_mic", { id: "cam1" }, "post"],
  ["protect_trigger_alarm_webhook", { id: "hook1" }, "post"],
  ["protect_disable_arm_alarm", {}, "post"],
  ["protect_activate_relay_output", { id: "r1", outputId: 0, state: "on" }, "post"],
  ["protect_trigger_alarm_hub_output", { id: "h1", outputId: 0, enable: true }, "post"],
];

describe("confirm through the SDK", () => {
  let mcpClient: Client;
  const toolClient = createMockClient();

  beforeAll(async () => {
    mcpClient = await connect(toolClient);
  });

  afterAll(async () => {
    await mcpClient.close();
  });

  for (const [name, args, method] of CONFIRM_GATED) {
    describe(name, () => {
      it("previews with dryRun and no confirm, sending nothing", async () => {
        mockFn(toolClient, method).mockClear();
        const result = await mcpClient.callTool({ name, arguments: { ...args, dryRun: true } });
        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({ dryRun: true });
        expect(mockFn(toolClient, method)).not.toHaveBeenCalled();
      });

      it("refuses without confirm, sending nothing", async () => {
        mockFn(toolClient, method).mockClear();
        const result = await mcpClient.callTool({ name, arguments: args });
        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toMatch(/confirm/);
        expect(mockFn(toolClient, method)).not.toHaveBeenCalled();
      });

      it("acts with confirm: true", async () => {
        mockFn(toolClient, method).mockClear().mockResolvedValueOnce({});
        const result = await mcpClient.callTool({ name, arguments: { ...args, confirm: true } });
        expect(result.isError).toBeFalsy();
        expect(mockFn(toolClient, method)).toHaveBeenCalledOnce();
      });
    });
  }
});

describe("hostile IDs through the SDK", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["protect_get_camera", { id: ".." }],
    ["protect_update_light", { id: "..", settings: { name: "x" } }],
    ["protect_delete_arm_profile", { id: "..", confirm: true }],
    ["protect_update_arm_profile", { id: "settings", settings: { armProfileId: "p1" } }],
    ["protect_ingest_pos_transaction", { id: "..", type: "sale", externalId: "t1", amount: 1 }],
  ])("%s with a path-changing ID sends nothing", async (name, args) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const mcpClient = await connect(
      new ProtectClient({ host: "192.168.1.1", apiKey: "k", verifySsl: true, readOnly: false })
    );
    const result = await mcpClient.callTool({ name, arguments: args });
    expect(result.isError).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    await mcpClient.close();
  });
});

describe("cancellation through the SDK", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aborts the Protect request when the MCP client cancels the call", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", (_url: string, options: RequestInit) => {
      requestSignal = options.signal ?? undefined;
      // A console that never answers: settle only when the request aborts.
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => { reject(options.signal?.reason as Error); });
      });
    });
    const mcpClient = await connect(
      new ProtectClient({ host: "192.168.1.1", apiKey: "k", verifySsl: true, readOnly: false })
    );

    const controller = new AbortController();
    const call = mcpClient.callTool(
      { name: "protect_activate_relay_output", arguments: { id: "r1", outputId: 0, state: "on", confirm: true } },
      undefined,
      { signal: controller.signal }
    );
    await vi.waitFor(() => { expect(requestSignal).toBeDefined(); });
    controller.abort();

    await expect(call).rejects.toThrow();
    await vi.waitFor(() => { expect(requestSignal?.aborted).toBe(true); });
    await mcpClient.close();
  });

  it("drops the subscription WebSocket when the MCP client cancels the call", async () => {
    const ws = Object.assign(new EventEmitter(), {
      close: vi.fn(),
      terminate: vi.fn(function (this: EventEmitter) { this.emit("close"); }),
    });
    const toolClient = createMockClient();
    mockFn(toolClient, "connectWebSocket").mockReturnValue(ws);
    const mcpClient = await connect(toolClient, true);

    const controller = new AbortController();
    const call = mcpClient.callTool(
      { name: "protect_subscribe_events", arguments: { duration: 30 } },
      undefined,
      { signal: controller.signal }
    );
    await vi.waitFor(() => { expect(mockFn(toolClient, "connectWebSocket")).toHaveBeenCalled(); });
    controller.abort();

    await expect(call).rejects.toThrow();
    await vi.waitFor(() => { expect(ws.terminate).toHaveBeenCalled(); });
    await mcpClient.close();
  });
});
