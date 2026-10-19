import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAllTools } from "../src/tools/index.js";
import { ProtectClient } from "../src/client.js";
import { formatDryRun } from "../src/utils/safety.js";
import {
  BINARY_TIMEOUT_MS,
  MAX_JSON_BYTES,
  MAX_SNAPSHOT_BYTES,
  MAX_UPLOAD_BASE64_CHARS,
  REQUEST_TIMEOUT_MS,
} from "../src/utils/limits.js";
import { STDIO_DEFAULT_MAX_BUFFER_SIZE } from "@modelcontextprotocol/sdk/shared/stdio.js";
import { createMockServer, createMockClient, mockFn } from "./tools/_helpers.js";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("undici", async (importOriginal) => ({ ...await importOriginal<typeof import("undici")>(), fetch: fetchMock }));

beforeEach(() => {
  fetchMock.mockReset();
});

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

  it("declares the preview fields in each published outputSchema", () => {
    for (const [name, config] of writeToolsWithOutput) {
      const shape = (config.outputSchema as z.ZodObject).shape;
      expect(Object.keys(shape), name).toEqual(expect.arrayContaining(["dryRun", "action", "path", "body"]));
    }
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
  async function snapshot(bytes: number) {
    fetchMock.mockImplementation(() => Promise.resolve(
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

  // A result's text copy is JSON-escaped again inside the JSON-RPC line, so
  // a JSON response under MAX_JSON_BYTES can still make an unreadable message
  // (quotes double at each level). The final result is what must fit.
  it("refuses a JSON result that would not fit one stdio message once serialised", async () => {
    const toolClient = createMockClient();
    mockFn(toolClient, "get").mockResolvedValueOnce({ applicationVersion: "7.3.70", notes: '"'.repeat(MAX_JSON_BYTES / 2) });
    const mcpClient = await connect(toolClient, true);
    const result = await mcpClient.callTool({ name: "protect_get_info", arguments: {} });
    await mcpClient.close();
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/too large/);
    expect(JSON.stringify({ jsonrpc: "2.0", id: 1, result }).length).toBeLessThan(STDIO_DEFAULT_MAX_BUFFER_SIZE);
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
  // Open access: each returns a credentialed stream URL.
  ["protect_create_rtsp_stream", { id: "cam1", qualities: ["high"] }, "post"],
  ["protect_create_talkback", { id: "cam1" }, "post"],
  // Weaken alarm coverage.
  ["protect_stop_siren", { id: "s1" }, "post"],
  ["protect_delete_arm_profile", { id: "p1" }, "delete"],
  ["protect_set_current_arm_profile", { armProfileId: "p1" }, "patch"],
  // Field-level: only these settings need confirm (see below for the rest).
  ["protect_update_sensor", { id: "s1", settings: { alarmSettings: { isEnabled: false } } }, "patch"],
  ["protect_update_sensor", { id: "s1", settings: { armProfileIds: null } }, "patch"],
  ["protect_update_fob", { id: "f1", settings: { armControlSettings: { enabled: false } } }, "patch"],
  ["protect_update_arm_profile", { id: "p1", settings: { schedules: [] } }, "patch"],
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

describe("field-level confirm leaves routine updates alone", () => {
  let mcpClient: Client;
  const toolClient = createMockClient();

  beforeAll(async () => {
    mcpClient = await connect(toolClient);
  });

  afterAll(async () => {
    await mcpClient.close();
  });

  it.each([
    ["protect_update_sensor", { id: "s1", settings: { name: "Back door" } }],
    ["protect_update_fob", { id: "f1", settings: { name: "Keys" } }],
    ["protect_update_arm_profile", { id: "p1", settings: { name: "Night" } }],
  ])("%s with only non-alarm settings acts without confirm", async (name, args) => {
    mockFn(toolClient, "patch").mockClear().mockResolvedValueOnce({});
    const result = await mcpClient.callTool({ name, arguments: args });
    expect(result.isError).toBeFalsy();
    expect(mockFn(toolClient, "patch")).toHaveBeenCalledOnce();
  });
});

describe("annotations through the SDK", () => {
  // The MCP spec reserves destructiveHint: false for additive-only updates; an
  // update changes existing settings, so clients should be able to prompt.
  it("marks every update tool destructive", async () => {
    const mcpClient = await connect(createMockClient());
    const updates = (await mcpClient.listTools()).tools.filter((tool) => tool.name.startsWith("protect_update_"));
    await mcpClient.close();
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.filter((tool) => tool.annotations?.destructiveHint !== true).map((tool) => tool.name)).toEqual([]);
  });

  // Gated tools weaken alarm coverage, switch physical outputs or open stream
  // access. confirm is set by the model; the annotation lets the client ask
  // the person as well.
  it("marks every confirm-gated tool destructive", async () => {
    const mcpClient = await connect(createMockClient());
    const gated = (await mcpClient.listTools()).tools
      .filter((tool) => "confirm" in ((tool.inputSchema as { properties?: object }).properties ?? {}));
    await mcpClient.close();
    expect(gated.length).toBeGreaterThan(0);
    expect(gated.filter((tool) => tool.annotations?.destructiveHint !== true).map((tool) => tool.name)).toEqual([]);
  });
});

/** The smallest input a published JSON Schema accepts: required fields only. */
function minimalArgs(schema: { properties?: Record<string, Record<string, unknown>>; required?: string[] }) {
  const args: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    const prop = schema.properties?.[key] ?? {};
    if ("const" in prop) args[key] = prop.const;
    else if (Array.isArray(prop.enum)) args[key] = prop.enum[0];
    else if (prop.type === "number" || prop.type === "integer") args[key] = prop.minimum ?? 1;
    else args[key] = "6805169300863503e4032252";
  }
  return args;
}

describe("read-only mode through the SDK", () => {
  // Behaviour, not annotations: every tool the server lists in read-only mode
  // is called, and the console must see nothing but GETs.
  it("lists only read-only tools, and none of them sends anything but GET", async () => {
    const methods: string[] = [];
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      methods.push(init.method ?? "GET");
      return Promise.resolve(new Response("{}", { headers: { "content-type": "application/json" } }));
    });
    const protect = new ProtectClient({ host: "192.168.1.1", apiKey: "k", verifySsl: true, readOnly: true });
    // Subscriptions open a WebSocket, not an HTTP request: answer with a
    // socket that closes at once, so no connection is attempted.
    vi.spyOn(protect, "connectWebSocket").mockImplementation(() => {
      const ws = Object.assign(new EventEmitter(), { close: vi.fn(), terminate: vi.fn() });
      setTimeout(() => ws.emit("close", 1000, Buffer.alloc(0)), 0);
      return ws as never;
    });
    const mcpClient = await connect(protect, true);
    const { tools } = await mcpClient.listTools();
    expect(tools.filter((tool) => tool.annotations?.readOnlyHint !== true).map((tool) => tool.name)).toEqual([]);

    for (const tool of tools) {
      await mcpClient.callTool({ name: tool.name, arguments: minimalArgs(tool.inputSchema as never) });
    }
    await mcpClient.close();
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.filter((method) => method !== "GET")).toEqual([]);
  });
});

describe("tool metadata through the SDK", () => {
  let tools: Awaited<ReturnType<Client["listTools"]>>["tools"];

  beforeAll(async () => {
    const mcpClient = await connect(createMockClient());
    tools = (await mcpClient.listTools()).tools;
    await mcpClient.close();
  });

  it("gives every tool a readable title", () => {
    for (const tool of tools) expect(tool.title, tool.name).toMatch(/^[A-Z][^_]*$/);
  });

  it.each([
    ["protect_get_rtsp_streams", "Get RTSP streams"],
    ["protect_goto_ptz_preset", "Go to PTZ preset"],
    ["protect_list_nvrs", "List NVRs"],
    ["protect_list_ulp_users", "List ULP users"],
    ["protect_ingest_pos_transaction", "Ingest POS transaction"],
  ])("titles %s as %s", (name, title) => {
    expect(tools.find((tool) => tool.name === name)?.title).toBe(title);
  });

  it("marks every tool as talking to one closed system", () => {
    for (const tool of tools) expect(tool.annotations?.openWorldHint, tool.name).toBe(false);
  });
});

describe("confirm coverage", () => {
  // Every tool that publishes a confirm input must be in CONFIRM_GATED, so a
  // new gated tool cannot skip the dry-run / refuse / act checks above.
  it("covers every tool that takes confirm", async () => {
    const mcpClient = await connect(createMockClient());
    const gated = (await mcpClient.listTools()).tools
      .filter((tool) => "confirm" in ((tool.inputSchema as { properties?: object }).properties ?? {}))
      .map((tool) => tool.name);
    await mcpClient.close();
    expect([...new Set(CONFIRM_GATED.map(([name]) => name))].sort()).toEqual(gated.sort());
  });
});

describe("every alarm-related field is gated", () => {
  // The policy, pinned field by field: dropping one from a gate's list must
  // fail here. Each is sent alongside a routine field, as a model would.
  const GATED_FIELDS: [string, string, unknown][] = [
    ["protect_update_sensor", "alarmSettings", { isEnabled: false }],
    ["protect_update_sensor", "motionSettings", { isEnabled: false }],
    ["protect_update_sensor", "glassBreakSettings", { isEnabled: false }],
    ["protect_update_sensor", "armProfileIds", null],
    ["protect_update_sensor", "scheduleMode", "always"],
    ["protect_update_fob", "armControlSettings", { enabled: false }],
    ["protect_update_arm_profile", "schedules", []],
    ["protect_update_arm_profile", "automations", []],
  ];
  let mcpClient: Client;
  const toolClient = createMockClient();

  beforeAll(async () => {
    mcpClient = await connect(toolClient);
  });

  afterAll(async () => {
    await mcpClient.close();
  });

  it.each(GATED_FIELDS)("%s refuses %s without confirm", async (name, field, value) => {
    mockFn(toolClient, "patch").mockClear();
    const result = await mcpClient.callTool({ name, arguments: { id: "x1", settings: { name: "Renamed", [field]: value } } });
    expect(result.isError).toBe(true);
    expect(mockFn(toolClient, "patch")).not.toHaveBeenCalled();
  });
});

describe("request timeouts inside an MCP call", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The caller's abort signal is combined with the request timeout; using the
  // caller's signal alone would drop the timeout from every real tool call.
  it.each([
    ["protect_get_info", {}, REQUEST_TIMEOUT_MS, /GET \/meta\/info: Protect did not respond/],
    ["protect_get_snapshot", { id: "cam1" }, BINARY_TIMEOUT_MS, /GET \/cameras\/cam1\/snapshot: Protect did not respond/],
    ["protect_upload_file", { fileType: "animations", base64Data: "R0lGODlhAQABAAAAACw=" }, BINARY_TIMEOUT_MS, /POST \/files\/animations: Protect did not respond.*may still have been applied/],
  ])("%s times out after its budget with a message naming the call", async (name, args, budget, message) => {
    const timers: { ms: number; controller: AbortController }[] = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      const controller = new AbortController();
      timers.push({ ms, controller });
      return controller.signal;
    });
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => { reject(init.signal?.reason as Error); });
    }));
    const mcpClient = await connect(
      new ProtectClient({ host: "192.168.1.1", apiKey: "k", verifySsl: true, readOnly: false })
    );
    const call = mcpClient.callTool({ name, arguments: args });
    await vi.waitFor(() => { expect(timers.length).toBe(1); });
    expect(timers[0].ms).toBe(budget);
    timers[0].controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const result = await call;
    await mcpClient.close();
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(message);
  });

  // AsyncLocalStorage gives each call its own signal: cancelling one call
  // must not abort another running beside it.
  it("cancels only the call that was cancelled", async () => {
    const NVRS_DELAY_MS = 500;
    const signals = new Map<string, AbortSignal>();
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      signals.set(url.replace(/.*\/v1/, ""), init.signal!);
      return new Promise((resolve, reject) => {
        init.signal?.addEventListener("abort", () => { reject(init.signal?.reason as Error); });
        if (url.endsWith("/nvrs")) setTimeout(() => { resolve(new Response("{}", { headers: { "content-type": "application/json" } })); }, NVRS_DELAY_MS);
      });
    });
    const mcpClient = await connect(
      new ProtectClient({ host: "192.168.1.1", apiKey: "k", verifySsl: true, readOnly: true }),
      true
    );
    const cancelled = new AbortController();
    const first = mcpClient.callTool({ name: "protect_get_info", arguments: {} }, undefined, { signal: cancelled.signal });
    const firstRejects = expect(first).rejects.toThrow();
    const second = mcpClient.callTool({ name: "protect_list_nvrs", arguments: {} });
    await vi.waitFor(() => { expect(signals.size).toBe(2); });
    cancelled.abort();
    // The cancellation reaches the server asynchronously. Checked while the
    // second request is still in flight: the SDK may abort a call's signal
    // once that call has finished.
    await vi.waitFor(() => { expect(signals.get("/meta/info")?.aborted).toBe(true); });
    expect(signals.get("/nvrs")?.aborted).toBe(false);
    await firstRejects;
    const result = await second;
    await mcpClient.close();
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
  });
});

describe("list paging through the SDK", () => {
  let mcpClient: Client;
  const toolClient = createMockClient();
  const cameras = [1, 2, 3, 4, 5].map((n) => ({ id: `cam${n.toString()}` }));

  beforeAll(async () => {
    mcpClient = await connect(toolClient);
  });

  afterAll(async () => {
    await mcpClient.close();
  });

  // Every list tool that returns an array can be paged (list_nvrs returns one
  // object despite its name).
  it("offers limit and offset on every array list tool", async () => {
    const lists = (await mcpClient.listTools()).tools.filter((tool) => tool.name.startsWith("protect_list_") && tool.name !== "protect_list_nvrs");
    expect(lists.length).toBeGreaterThan(0);
    for (const tool of lists) {
      expect(Object.keys((tool.inputSchema as { properties?: object }).properties ?? {}), tool.name).toEqual(expect.arrayContaining(["limit", "offset"]));
    }
  });

  it("returns one page with the total when limit or offset is given", async () => {
    mockFn(toolClient, "get").mockResolvedValueOnce(cameras);
    const result = await mcpClient.callTool({ name: "protect_list_cameras", arguments: { limit: 2, offset: 1 } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ result: [{ id: "cam2" }, { id: "cam3" }], totalCount: 5, offset: 1 });
  });

  it("pages a config-driven device list the same way", async () => {
    mockFn(toolClient, "get").mockResolvedValueOnce(cameras);
    const result = await mcpClient.callTool({ name: "protect_list_sensors", arguments: { offset: 4 } });
    expect(result.structuredContent).toEqual({ result: [{ id: "cam5" }], totalCount: 5, offset: 4 });
  });

  it("returns the whole list unchanged when neither is given", async () => {
    mockFn(toolClient, "get").mockResolvedValueOnce(cameras);
    const result = await mcpClient.callTool({ name: "protect_list_cameras", arguments: {} });
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify(cameras) }]);
    expect(result.structuredContent).toEqual({ result: cameras });
  });
});

describe("hostile IDs through the SDK", () => {
  it.each([
    ["protect_get_camera", { id: ".." }],
    ["protect_update_light", { id: "..", settings: { name: "x" } }],
    ["protect_delete_arm_profile", { id: "..", confirm: true }],
    ["protect_update_arm_profile", { id: "settings", settings: { armProfileId: "p1" } }],
    ["protect_ingest_pos_transaction", { id: "..", type: "sale", externalId: "t1", amount: 1 }],
  ])("%s with a path-changing ID sends nothing", async (name, args) => {
    const mcpClient = await connect(
      new ProtectClient({ host: "192.168.1.1", apiKey: "k", verifySsl: true, readOnly: false })
    );
    const result = await mcpClient.callTool({ name, arguments: args });
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    await mcpClient.close();
  });
});

describe("cancellation through the SDK", () => {
  it("aborts the Protect request when the MCP client cancels the call", async () => {
    let requestSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url: string, options: RequestInit) => {
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
      terminate: vi.fn(function (this: EventEmitter) { this.emit("close", 1006, Buffer.alloc(0)); }),
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
