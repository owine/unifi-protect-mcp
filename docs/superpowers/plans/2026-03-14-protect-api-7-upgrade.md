# Protect API 7.0.88 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade from Protect Integration API 6.2.88 to 7.0.88, adding WebSocket subscription tools for real-time device and event streaming.

**Architecture:** Add `ws` dependency for WebSocket support. Extend `ProtectClient` with a `connectWebSocket()` method. Create a new `subscriptions.ts` tool module with two read-only tools that connect, collect messages for a configurable duration, and return results. Update registration counts in existing tests.

**Tech Stack:** TypeScript, ws, Zod, Vitest, MCP SDK

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | modify | Add `ws` + `@types/ws` dependencies |
| `src/client.ts` | modify | Add `connectWebSocket()` method |
| `src/tools/subscriptions.ts` | create | Two WebSocket subscription tools |
| `src/tools/index.ts` | modify | Wire `registerSubscriptionTools` |
| `tests/tools/_helpers.ts` | modify | Add `connectWebSocket` to mock client |
| `tests/tools/subscriptions.test.ts` | create | Tests for subscription tools |
| `tests/tools/index.test.ts` | modify | Update tool counts (33→35, 17→19) |
| `docs/api/04-websocket.md` | modify | Document the two subscription endpoints |

---

## Chunk 1: Dependencies and Client

### Task 1: Add `ws` dependency

**Files:**
- Modify: `package.json:38-49`

- [ ] **Step 1: Install ws and @types/ws**

```bash
npm install ws@^8.18.0 && npm install --save-dev @types/ws@8.18.0
```

Verify `package.json` shows:
- `"ws": "^8.18.0"` in `dependencies`
- `"@types/ws": "8.18.0"` in `devDependencies`

- [ ] **Step 2: Verify build still works**

Run: `npm run build`
Expected: Clean compilation, no errors

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add ws dependency for WebSocket support"
```

---

### Task 2: Add `connectWebSocket` to ProtectClient

**Files:**
- Modify: `src/client.ts:1-108`
- Modify: `tests/tools/_helpers.ts:40-48`
- Test: `tests/tools/subscriptions.test.ts` (created in Task 3)

- [ ] **Step 1: Write the failing test for connectWebSocket**

Create `tests/client.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { ProtectClient } from "../src/client.js";

// We can't easily unit-test actual WebSocket connections without a server,
// but we can verify the method exists and constructs the correct URL.
// Integration-level behavior is tested via the tool tests with mocks.

describe("ProtectClient", () => {
  afterEach(() => {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  });

  it("has connectWebSocket method", () => {
    const client = new ProtectClient({
      host: "192.168.1.1",
      apiKey: "test-key",
      verifySsl: true,
      readOnly: true,
    });
    expect(typeof client.connectWebSocket).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/client.test.ts`
Expected: FAIL — `client.connectWebSocket` is not a function

- [ ] **Step 3: Implement connectWebSocket**

Add import at top of `src/client.ts`:

```ts
import WebSocket from "ws";
```

Add method at the end of the `ProtectClient` class (after `postBinary`, before closing `}`):

```ts
  connectWebSocket(path: string): WebSocket {
    const url = `wss://${this.baseUrl.replace(/^https?:\/\//, "")}${path}`;
    return new WebSocket(url, {
      headers: { "X-API-KEY": this.headers["X-API-KEY"] },
      rejectUnauthorized:
        process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0",
    });
  }
```

Note: The `baseUrl` is `https://host/proxy/protect/integration/v1`. We strip the protocol and use `wss://` instead. The `rejectUnauthorized` check reuses the same env var mechanism already set in the constructor when `verifySsl` is false.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/client.test.ts`
Expected: PASS

- [ ] **Step 5: Add connectWebSocket to mock client helper**

In `tests/tools/_helpers.ts`, update `createMockClient()` (line 40-48) to include the new method:

```ts
export function createMockClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    getBinary: vi.fn(),
    postBinary: vi.fn(),
    connectWebSocket: vi.fn(),
  } as unknown as ProtectClient;
}
```

- [ ] **Step 6: Run all existing tests to verify nothing broke**

Run: `npm test`
Expected: All tests pass, same count as before

- [ ] **Step 7: Commit**

```bash
git add src/client.ts tests/client.test.ts tests/tools/_helpers.ts
git commit -m "feat: add connectWebSocket method to ProtectClient"
```

---

## Chunk 2: Subscription Tools

### Task 3: Create subscription tools module

**Files:**
- Create: `src/tools/subscriptions.ts`
- Test: `tests/tools/subscriptions.test.ts`

- [ ] **Step 1: Write failing tests for protect_subscribe_devices**

Create `tests/tools/subscriptions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";
import {
  createMockServer,
  createMockClient,
  mockFn,
  expectSuccess,
  expectError,
} from "./_helpers.js";
import { registerSubscriptionTools } from "../../src/tools/subscriptions.js";

/** Minimal mock that quacks like a ws.WebSocket */
function createMockWebSocket() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    close: vi.fn(() => emitter.emit("close")),
    readyState: 1, // OPEN
  });
}

describe("subscription tools", () => {
  let server: ReturnType<typeof createMockServer>["server"];
  let handlers: ReturnType<typeof createMockServer>["handlers"];
  let configs: ReturnType<typeof createMockServer>["configs"];
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    ({ server, handlers, configs } = createMockServer());
    client = createMockClient();
    registerSubscriptionTools(server, client);
  });

  describe("protect_subscribe_devices", () => {
    it("collects messages and returns them", async () => {
      const ws = createMockWebSocket();
      mockFn(client, "connectWebSocket").mockReturnValue(ws);

      const promise = handlers.get("protect_subscribe_devices")!({
        duration: 1,
      });

      // Simulate messages arriving after connection opens
      setTimeout(() => {
        ws.emit("open");
        ws.emit("message", JSON.stringify({ type: "update", item: { id: "cam1", modelKey: "camera" } }));
        ws.emit("message", JSON.stringify({ type: "add", item: { id: "light1", modelKey: "light" } }));
      }, 10);

      const result = await promise;
      expectSuccess(result, "cam1");
      expectSuccess(result, "light1");
      expect(mockFn(client, "connectWebSocket")).toHaveBeenCalledWith(
        "/subscribe/devices"
      );
    });

    it("returns empty array when no messages received", async () => {
      const ws = createMockWebSocket();
      mockFn(client, "connectWebSocket").mockReturnValue(ws);

      const promise = handlers.get("protect_subscribe_devices")!({
        duration: 1,
      });

      setTimeout(() => ws.emit("open"), 10);

      const result = await promise;
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.messages).toEqual([]);
      expect(parsed.duration).toBe(1);
    });

    it("handles WebSocket error gracefully", async () => {
      const ws = createMockWebSocket();
      mockFn(client, "connectWebSocket").mockReturnValue(ws);

      const promise = handlers.get("protect_subscribe_devices")!({
        duration: 1,
      });

      setTimeout(() => {
        ws.emit("open");
        ws.emit("message", JSON.stringify({ type: "update", item: { id: "cam1" } }));
        ws.emit("error", new Error("connection reset"));
      }, 10);

      const result = await promise;
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.messages).toHaveLength(1);
      expect(parsed.error).toBe("connection reset");
    });

    it("handles connection failure", async () => {
      mockFn(client, "connectWebSocket").mockImplementation(() => {
        throw new Error("ECONNREFUSED");
      });

      const result = await handlers.get("protect_subscribe_devices")!({
        duration: 1,
      });
      expectError(result);
      expect(result.content[0].text).toContain("ECONNREFUSED");
    });

    it("handles invalid JSON messages gracefully", async () => {
      const ws = createMockWebSocket();
      mockFn(client, "connectWebSocket").mockReturnValue(ws);

      const promise = handlers.get("protect_subscribe_devices")!({
        duration: 1,
      });

      setTimeout(() => {
        ws.emit("open");
        ws.emit("message", "not valid json");
        ws.emit("message", JSON.stringify({ type: "update", item: { id: "cam1" } }));
      }, 10);

      const result = await promise;
      const parsed = JSON.parse(result.content[0].text);
      // Invalid JSON is stored as raw string
      expect(parsed.messages).toHaveLength(2);
      expect(parsed.messages[0]).toBe("not valid json");
    });

    it("has read-only annotations", () => {
      expect(configs.get("protect_subscribe_devices")!.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
      });
    });
  });

  describe("protect_subscribe_events", () => {
    it("collects event messages and returns them", async () => {
      const ws = createMockWebSocket();
      mockFn(client, "connectWebSocket").mockReturnValue(ws);

      const promise = handlers.get("protect_subscribe_events")!({
        duration: 1,
      });

      setTimeout(() => {
        ws.emit("open");
        ws.emit(
          "message",
          JSON.stringify({
            type: "add",
            item: { id: "evt1", modelKey: "event", type: "ring" },
          })
        );
      }, 10);

      const result = await promise;
      expectSuccess(result, "evt1");
      expectSuccess(result, "ring");
      expect(mockFn(client, "connectWebSocket")).toHaveBeenCalledWith(
        "/subscribe/events"
      );
    });

    it("has read-only annotations", () => {
      expect(configs.get("protect_subscribe_events")!.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
      });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/subscriptions.test.ts`
Expected: FAIL — cannot resolve `../../src/tools/subscriptions.js`

- [ ] **Step 3: Implement subscription tools**

Create `src/tools/subscriptions.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY } from "../utils/safety.js";

const durationSchema = z
  .number()
  .min(1)
  .max(30)
  .default(5)
  .describe("Seconds to listen (1-30, default 5)");

function collectMessages(
  client: ProtectClient,
  path: string,
  duration: number
): Promise<{ messages: unknown[]; duration: number; error?: string }> {
  return new Promise((resolve) => {
    const messages: unknown[] = [];
    let error: string | undefined;

    const ws = client.connectWebSocket(path);

    const timeout = setTimeout(() => {
      ws.close();
    }, duration * 1000);

    ws.on("message", (data: unknown) => {
      const text = String(data);
      try {
        messages.push(JSON.parse(text));
      } catch {
        messages.push(text);
      }
    });

    ws.on("error", (err: Error) => {
      error = err.message;
      clearTimeout(timeout);
      ws.close();
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      const result: { messages: unknown[]; duration: number; error?: string } =
        { messages, duration };
      if (error) result.error = error;
      resolve(result);
    });
  });
}

export function registerSubscriptionTools(
  server: McpServer,
  client: ProtectClient
) {
  server.registerTool(
    "protect_subscribe_devices",
    {
      description:
        "Connect to the device update WebSocket and collect messages for a specified duration. Returns real-time add/update/remove events for Protect-managed hardware devices.",
      inputSchema: { duration: durationSchema },
      annotations: READ_ONLY,
    },
    async ({ duration }) => {
      try {
        const data = await collectMessages(
          client,
          "/subscribe/devices",
          duration
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_subscribe_events",
    {
      description:
        "Connect to the Protect event WebSocket and collect messages for a specified duration. Returns events like motion detection, doorbell rings, and smart detections.",
      inputSchema: { duration: durationSchema },
      annotations: READ_ONLY,
    },
    async ({ duration }) => {
      try {
        const data = await collectMessages(
          client,
          "/subscribe/events",
          duration
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
```

- [ ] **Step 4: Run subscription tests to verify they pass**

Run: `npx vitest run tests/tools/subscriptions.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/subscriptions.ts tests/tools/subscriptions.test.ts
git commit -m "feat: add WebSocket subscription tools for devices and events"
```

---

## Chunk 3: Wire Up, Update Counts, and Docs

### Task 4: Wire subscription tools into registerAllTools

**Files:**
- Modify: `src/tools/index.ts:1-19`
- Modify: `tests/tools/index.test.ts:1-134`

- [ ] **Step 1: Update registration index**

In `src/tools/index.ts`, add import and call:

Add after line 7:
```ts
import { registerSubscriptionTools } from "./subscriptions.js";
```

Add after line 14 (after `registerSystemTools`):
```ts
  registerSubscriptionTools(server, client);
```

The call goes alongside `registerSystemTools` because subscription tools are always registered (read-only), not gated by `readOnly`.

- [ ] **Step 2: Update test counts in index.test.ts**

In `tests/tools/index.test.ts`:

Line 6: Change `"registers all 33 tools"` → `"registers all 35 tools"`
Line 10: Change `expect(handlers.size).toBe(33)` → `expect(handlers.size).toBe(35)`
Line 62: Change `expect(expectedTools.length).toBe(33)` → `expect(expectedTools.length).toBe(35)`
Line 67: Change `"registers only 17 read-only tools"` → `"registers only 19 read-only tools"`
Line 71: Change `expect(handlers.size).toBe(17)` → `expect(handlers.size).toBe(19)`
Line 102: Change `expect(readOnlyTools.length).toBe(17)` → `expect(readOnlyTools.length).toBe(19)`

Add to the `expectedTools` array (after the `// System (2)` block, before `// Cameras`):
```ts
      // Subscriptions (2)
      "protect_subscribe_devices",
      "protect_subscribe_events",
```

Add to the `readOnlyTools` array (after `"protect_list_nvrs"`):
```ts
      "protect_subscribe_devices",
      "protect_subscribe_events",
```

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: All tests PASS with updated counts

- [ ] **Step 4: Commit**

```bash
git add src/tools/index.ts tests/tools/index.test.ts
git commit -m "feat: wire subscription tools into registerAllTools"
```

---

### Task 5: Update API docs

**Files:**
- Modify: `docs/api/04-websocket.md`

- [ ] **Step 1: Rewrite the WebSocket docs**

Replace the entire contents of `docs/api/04-websocket.md` with:

```md
# WebSocket updates

## GET /v1/subscribe/devices

Subscribe to real-time device state changes via WebSocket.

| | |
|---|---|
| **Protocol** | WebSocket (`wss://`) |
| **Path** | `/v1/subscribe/devices` |
| **MCP Tool** | `protect_subscribe_devices` |

### Description

Opens a WebSocket connection that broadcasts all changes to Protect-managed hardware devices (cameras, lights, sensors, chimes, viewers, NVRs). Messages are emitted when devices are added, updated, or removed.

### Message schema

```json
{
  "type": "add | update | remove",
  "item": {
    "id": "66d025b301ebc903e80003ea",
    "modelKey": "camera | light | sensor | chime | viewer | nvr",
    "name": "string",
    ...
  }
}
```

### Event types

| Type | Description |
|------|-------------|
| `add` | A new device was adopted |
| `update` | Device settings or state changed |
| `remove` | A device was removed |

---

## GET /v1/subscribe/events

Subscribe to real-time Protect event messages via WebSocket.

| | |
|---|---|
| **Protocol** | WebSocket (`wss://`) |
| **Path** | `/v1/subscribe/events` |
| **MCP Tool** | `protect_subscribe_events` |

### Description

Opens a WebSocket connection that broadcasts Protect events such as motion detection, doorbell rings, and smart detections.

### Message schema

```json
{
  "type": "add | update",
  "item": {
    "id": "66d025b301ebc903e80003ea",
    "modelKey": "event",
    "type": "ring | motion | smartDetect",
    "start": 1445408038748,
    "end": 1445408048748,
    "device": "66d025b301ebc903e80003ea"
  }
}
```

### Event types

| Type | Description |
|------|-------------|
| `add` | A new event started |
| `update` | An in-progress event was updated (e.g., end time set) |
```

- [ ] **Step 2: Commit**

```bash
git add docs/api/04-websocket.md
git commit -m "docs: update WebSocket docs for API 7.0.88 subscription endpoints"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Clean compilation
