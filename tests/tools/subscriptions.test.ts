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
