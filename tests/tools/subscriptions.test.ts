import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import {
  createMockServer,
  createMockClient,
  mockFn,
  expectSuccess,
  expectError,
} from "./_helpers.js";
import {
  registerSubscriptionTools,
  MAX_SUBSCRIPTION_MESSAGES,
  MAX_SUBSCRIPTION_TEXT_CHARS,
} from "../../src/tools/subscriptions.js";
import { withCallSignal } from "../../src/client.js";

/** Minimal mock that quacks like a ws.WebSocket */
function createMockWebSocket() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    close: vi.fn(() => emitter.emit("close")),
    terminate: vi.fn(() => emitter.emit("close")),
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
        "/subscribe/devices",
        expect.objectContaining({ maxPayload: expect.any(Number) })
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
      expect(parsed.duration).toBeCloseTo(1, 0);
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

    it("describes the {type, item} envelope", () => {
      const description = configs.get("protect_subscribe_devices")!.description!;
      expect(description).toContain("{type, item}");
      expect(description).toContain("modelKey");
    });

    it("has read-only annotations", () => {
      expect(configs.get("protect_subscribe_devices")!.annotations).toMatchObject({
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
        "/subscribe/events",
        expect.objectContaining({ maxPayload: expect.any(Number) })
      );
    });

    it("describes the event envelope without undocumented fields", () => {
      const description = configs.get("protect_subscribe_events")!.description!;
      expect(description).toContain("item:");
      for (const field of ["device", "start", "end"]) {
        expect(description).toContain(field);
      }
      for (const stale of ["score", "smartDetectTypes", "metadata"]) {
        expect(description).not.toContain(stale);
      }
    });

    it("has read-only annotations", () => {
      expect(configs.get("protect_subscribe_events")!.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
      });
    });
  });

  describe("message cap", () => {
    it("stops listening once the cap is reached and flags truncation", async () => {
      const ws = createMockWebSocket();
      mockFn(client, "connectWebSocket").mockReturnValue(ws);

      // A 30s listen must end early: the test would time out otherwise.
      const promise = handlers.get("protect_subscribe_devices")!({ duration: 30 });

      setTimeout(() => {
        ws.emit("open");
        for (let i = 0; i < MAX_SUBSCRIPTION_MESSAGES + 5; i++) {
          ws.emit("message", JSON.stringify({ type: "update", item: { id: `d${i.toString()}` } }));
        }
      }, 10);

      const result = await promise;
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.messages).toHaveLength(MAX_SUBSCRIPTION_MESSAGES);
      expect(parsed.truncated).toBe(true);
      expect(ws.close).toHaveBeenCalled();
      // Reports the time actually spent listening, not the 30s requested.
      expect(parsed.duration).toBeLessThan(5);
    });

    it("omits the truncated flag when under the cap", async () => {
      const ws = createMockWebSocket();
      mockFn(client, "connectWebSocket").mockReturnValue(ws);
      const promise = handlers.get("protect_subscribe_devices")!({ duration: 1 });
      setTimeout(() => ws.emit("open"), 10);
      const parsed = JSON.parse((await promise).content[0].text);
      expect(parsed.truncated).toBeUndefined();
    });
  });

  describe("listen budget and lifecycle", () => {
    // Device envelopes carry whole device objects, so a count cap alone let
    // one call return hundreds of thousands of tokens.
    it("stops at the text budget and flags truncation", async () => {
      const ws = createMockWebSocket();
      mockFn(client, "connectWebSocket").mockReturnValue(ws);
      const promise = handlers.get("protect_subscribe_devices")!({ duration: 30 });
      const big = { type: "add", item: { id: "s1", modelKey: "sensor", blob: "x".repeat(5_000) } };
      const sent = Math.ceil(MAX_SUBSCRIPTION_TEXT_CHARS / 5_000) * 2;
      setTimeout(() => {
        ws.emit("open");
        for (let i = 0; i < sent; i++) ws.emit("message", JSON.stringify(big));
      }, 10);
      const result = await promise;
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.truncated).toBe(true);
      expect(parsed.messages.length).toBeLessThan(sent);
      expect(result.content[0].text.length).toBeLessThanOrEqual(MAX_SUBSCRIPTION_TEXT_CHARS);
    });

    it("caps the size of a single WebSocket frame", async () => {
      const ws = createMockWebSocket();
      mockFn(client, "connectWebSocket").mockReturnValue(ws);
      const promise = handlers.get("protect_subscribe_events")!({ duration: 1 });
      setTimeout(() => ws.emit("open"), 10);
      await promise;
      const options = mockFn(client, "connectWebSocket").mock.calls[0][1] as { maxPayload?: number };
      expect(options.maxPayload).toBeGreaterThan(0);
      expect(options.maxPayload).toBeLessThanOrEqual(MAX_SUBSCRIPTION_TEXT_CHARS);
    });

    // A peer that never answers the close handshake used to hold the call
    // open for ws's 30 s close timeout, past the MCP client's own timeout.
    it("returns promptly after the window even if the peer never closes", async () => {
      const emitter = new EventEmitter();
      const ws = Object.assign(emitter, {
        close: vi.fn(), // a silent peer: no "close" event follows
        terminate: vi.fn(() => emitter.emit("close")),
      });
      mockFn(client, "connectWebSocket").mockReturnValue(ws);
      const started = Date.now();
      const promise = handlers.get("protect_subscribe_events")!({ duration: 1 });
      setTimeout(() => ws.emit("open"), 10);
      // Arrives after the window closed: not part of the result.
      setTimeout(() => ws.emit("message", JSON.stringify({ type: "add", item: { id: "late" } })), 1_200);
      const result = await promise;
      const parsed = JSON.parse(result.content[0].text);
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(ws.terminate).toHaveBeenCalled();
      expect(parsed.messages).toEqual([]);
      expect(parsed.duration).toBeLessThan(1.5);
    });

    // An empty listen that failed must not read as "nothing happened".
    it("reports a connection that failed before any message as an error", async () => {
      const ws = createMockWebSocket();
      mockFn(client, "connectWebSocket").mockReturnValue(ws);
      const promise = handlers.get("protect_subscribe_devices")!({ duration: 1 });
      setTimeout(() => { ws.emit("error", new Error("Unexpected server response: 401")); }, 10);
      const result = await promise;
      expectError(result);
      expect(result.content[0].text).toContain("401");
    });
  });

  describe("timers and cancellation", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    // A socket that reports "close" synchronously from close() used to run the
    // close handler before the grace timer was armed, so the timer outlived the
    // call and fired later (as unhandled errors in an unrelated test).
    it("leaves no timer running once the listen has ended", async () => {
      vi.useFakeTimers();
      const ws = createMockWebSocket();
      mockFn(client, "connectWebSocket").mockReturnValue(ws);
      const promise = handlers.get("protect_subscribe_events")!({ duration: 1 });
      ws.emit("open");
      await vi.advanceTimersByTimeAsync(1_000);
      await promise;
      expect(vi.getTimerCount()).toBe(0);
    });

    it("stops at once for a call that was cancelled before it started", async () => {
      const ws = createMockWebSocket();
      mockFn(client, "connectWebSocket").mockReturnValue(ws);
      const cancelled = new AbortController();
      cancelled.abort();
      const started = Date.now();
      await withCallSignal(cancelled.signal, () => handlers.get("protect_subscribe_events")!({ duration: 30 }));
      expect(Date.now() - started).toBeLessThan(1_000);
      expect(ws.terminate).toHaveBeenCalled();
    });
  });
});
