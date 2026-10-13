import { describe, it, expect } from "vitest";
import {
  createMockServer,
  createMockClient,
  mockFn,
  expectSuccess,
  expectError,
  parseInputSchema,
} from "./_helpers.js";
import { registerDeviceActionTools } from "../../src/tools/device-actions.js";

describe("device action tools", () => {
  const { server, handlers, configs } = createMockServer();
  const client = createMockClient();
  registerDeviceActionTools(server, client, false);

  describe("protect_play_siren", () => {
    it("plays siren without duration", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      const result = await handlers.get("protect_play_siren")!({ id: "s1" });
      expectSuccess(result, "ok");
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/sirens/s1/play", undefined);
    });

    it("plays siren with duration", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      await handlers.get("protect_play_siren")!({ id: "s1", duration: 10 });
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/sirens/s1/play", { duration: 10 });
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("offline"));
      const result = await handlers.get("protect_play_siren")!({ id: "s1" });
      expectError(result);
    });

    it("dry-run does not call client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_play_siren")!({
        id: "s1",
        duration: 30,
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("POST");
      expect(data.path).toBe("/sirens/s1/play");
      expect(data.body).toEqual({ duration: 30 });
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("has WRITE annotations", () => {
      expect(configs.get("protect_play_siren")!.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
      });
    });
  });

  describe("protect_stop_siren", () => {
    it("stops siren", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      const result = await handlers.get("protect_stop_siren")!({ confirm: true, id: "s1" });
      expectSuccess(result, "ok");
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/sirens/s1/stop");
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_stop_siren")!({ id: "s1" });
      expectError(result);
    });

    it("dry-run does not call client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_stop_siren")!({ id: "s1", dryRun: true });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });
  });

  describe("protect_test_siren_sound", () => {
    it("tests siren sound without volume", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      await handlers.get("protect_test_siren_sound")!({ id: "s1" });
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/sirens/s1/test-sound", undefined);
    });

    it("tests siren sound with volume", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      await handlers.get("protect_test_siren_sound")!({ id: "s1", volume: 50 });
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/sirens/s1/test-sound", { volume: 50 });
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_test_siren_sound")!({ id: "s1" });
      expectError(result);
    });

    it("dry-run does not call client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_test_siren_sound")!({
        id: "s1",
        volume: 80,
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.body).toEqual({ volume: 80 });
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });
  });

  describe("protect_test_speaker_sound", () => {
    it("tests speaker sound", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      await handlers.get("protect_test_speaker_sound")!({ id: "sp1", volume: 60 });
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/speakers/sp1/test-sound", { volume: 60 });
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_test_speaker_sound")!({ id: "sp1" });
      expectError(result);
    });

    it("dry-run does not call client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_test_speaker_sound")!({
        id: "sp1",
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });
  });

  describe("protect_activate_relay_output", () => {
    it("refuses without confirm and does not call the client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_activate_relay_output")!({
        id: "x1",
        outputId: 0,
        confirm: false,
      });
      expectError(result);
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("activates with state and pulseDuration", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      await handlers.get("protect_activate_relay_output")!({
        confirm: true,
        id: "r1",
        outputId: 0,
        state: "on",
        pulseDuration: 5000,
      });
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/relays/r1/outputs/0/activate",
        { state: "on", pulseDuration: 5000 }
      );
    });

    it("sends only state when pulseDuration is omitted", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      await handlers.get("protect_activate_relay_output")!({
        confirm: true,
        id: "r1",
        outputId: 1,
        state: "off",
      });
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/relays/r1/outputs/1/activate",
        { state: "off" }
      );
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("offline"));
      const result = await handlers.get("protect_activate_relay_output")!({
        confirm: true,
        id: "r1",
        outputId: 0,
      });
      expectError(result);
    });

    it("dry-run does not call client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_activate_relay_output")!({
        confirm: true,
        id: "r1",
        outputId: 0,
        state: "off",
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.path).toBe("/relays/r1/outputs/0/activate");
      expect(data.body).toEqual({ state: "off" });
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });
  });

  describe("protect_trigger_alarm_hub_output", () => {
    it("refuses without confirm and does not call the client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_trigger_alarm_hub_output")!({
        id: "x1",
        outputId: 0,
        confirm: false,
      });
      expectError(result);
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("triggers with all options", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      await handlers.get("protect_trigger_alarm_hub_output")!({
        confirm: true,
        id: "h1",
        outputId: 0,
        enable: true,
        delay: 0,
        duration: 5000,
      });
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/alarm-hubs/h1/outputs/0/trigger",
        { enable: true, delay: 0, duration: 5000 }
      );
    });

    it("sends only enable when delay and duration are omitted", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      await handlers.get("protect_trigger_alarm_hub_output")!({
        confirm: true,
        id: "h1",
        outputId: 1,
        enable: true,
      });
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/alarm-hubs/h1/outputs/1/trigger",
        { enable: true }
      );
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("offline"));
      const result = await handlers.get("protect_trigger_alarm_hub_output")!({
        confirm: true,
        id: "h1",
        outputId: 0,
      });
      expectError(result);
    });

    it("dry-run does not call client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_trigger_alarm_hub_output")!({
        confirm: true,
        id: "h1",
        outputId: 0,
        enable: false,
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.body).toEqual({ enable: false });
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });
  });
});

describe("device action tools - annotations", () => {
  const { server, configs } = createMockServer();
  const client = createMockClient();
  registerDeviceActionTools(server, client, false);

  const tools = [
    "protect_play_siren",
    "protect_stop_siren",
    "protect_test_siren_sound",
    "protect_test_speaker_sound",
    "protect_activate_relay_output",
    "protect_trigger_alarm_hub_output",
  ];

  it("registers exactly the expected action tools", () => {
    expect([...configs.keys()].sort()).toEqual([...tools].sort());
  });

  // Relays and alarm-hub outputs drive gates, door strikes and sirens.
  const destructive = new Set([
    "protect_activate_relay_output",
    "protect_trigger_alarm_hub_output",
  ]);

  for (const name of tools) {
    const kind = destructive.has(name) ? "DESTRUCTIVE" : "WRITE";
    it(`${name} has ${kind} annotations`, () => {
      expect(configs.get(name)!.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: destructive.has(name),
      });
    });
  }
});

describe("device action tools - input validation", () => {
  const { server, configs } = createMockServer();
  const client = createMockClient();
  registerDeviceActionTools(server, client, false);

  describe("protect_play_siren duration", () => {
    const schema = parseInputSchema(configs, "protect_play_siren");

    for (const duration of [5, 10, 20, 30]) {
      it(`accepts ${duration}`, () => {
        expect(schema.safeParse({ id: "s1", duration }).success).toBe(true);
      });
    }

    for (const duration of [0, 1, 15, 60, -5]) {
      it(`rejects ${duration}`, () => {
        expect(schema.safeParse({ id: "s1", duration }).success).toBe(false);
      });
    }

    it("accepts omitted duration", () => {
      expect(schema.safeParse({ id: "s1" }).success).toBe(true);
    });
  });

  describe("protect_test_siren_sound volume (1-100 int)", () => {
    const schema = parseInputSchema(configs, "protect_test_siren_sound");

    it("accepts bounds 1 and 100", () => {
      expect(schema.safeParse({ id: "s1", volume: 1 }).success).toBe(true);
      expect(schema.safeParse({ id: "s1", volume: 100 }).success).toBe(true);
    });

    it("rejects 0, 101, and non-integers", () => {
      expect(schema.safeParse({ id: "s1", volume: 0 }).success).toBe(false);
      expect(schema.safeParse({ id: "s1", volume: 101 }).success).toBe(false);
      expect(schema.safeParse({ id: "s1", volume: 50.5 }).success).toBe(false);
    });
  });

  describe("protect_test_speaker_sound volume (0-100 int)", () => {
    const schema = parseInputSchema(configs, "protect_test_speaker_sound");

    it("accepts bounds 0 and 100", () => {
      expect(schema.safeParse({ id: "sp1", volume: 0 }).success).toBe(true);
      expect(schema.safeParse({ id: "sp1", volume: 100 }).success).toBe(true);
    });

    it("rejects -1, 101, and non-integers", () => {
      expect(schema.safeParse({ id: "sp1", volume: -1 }).success).toBe(false);
      expect(schema.safeParse({ id: "sp1", volume: 101 }).success).toBe(false);
      expect(schema.safeParse({ id: "sp1", volume: 1.5 }).success).toBe(false);
    });
  });

  describe("protect_activate_relay_output", () => {
    const schema = parseInputSchema(configs, "protect_activate_relay_output");

    it("accepts outputId 0 and pulseDuration 0", () => {
      expect(schema.safeParse({ id: "r1", outputId: 0, state: "on", pulseDuration: 0, confirm: true }).success).toBe(true);
    });

    it("requires outputId", () => {
      expect(schema.safeParse({ id: "r1" }).success).toBe(false);
    });

    it("rejects negative outputId", () => {
      expect(schema.safeParse({ id: "r1", outputId: -1 }).success).toBe(false);
    });

    it("rejects negative pulseDuration", () => {
      expect(schema.safeParse({ id: "r1", outputId: 0, pulseDuration: -1 }).success).toBe(false);
    });

    it("rejects non-integer outputId", () => {
      expect(schema.safeParse({ id: "r1", outputId: 0.5 }).success).toBe(false);
    });

    // A toggle is not idempotent: a retried call would flip the output back.
    it("requires an explicit state instead of toggling", () => {
      expect(schema.safeParse({ id: "r1", outputId: 0, confirm: true }).success).toBe(false);
    });

    it("rejects invalid state", () => {
      expect(schema.safeParse({ id: "r1", outputId: 0, state: "toggle" }).success).toBe(false);
    });
  });

  describe("protect_trigger_alarm_hub_output", () => {
    const schema = parseInputSchema(configs, "protect_trigger_alarm_hub_output");

    it("accepts zero values", () => {
      expect(
        schema.safeParse({ id: "h1", outputId: 0, enable: true, delay: 0, duration: 0, confirm: true }).success
      ).toBe(true);
    });

    // A toggle is not idempotent: a retried call would flip the output back.
    it("requires an explicit enable instead of toggling", () => {
      expect(schema.safeParse({ id: "h1", outputId: 0, confirm: true }).success).toBe(false);
    });

    it("requires outputId", () => {
      expect(schema.safeParse({ id: "h1" }).success).toBe(false);
    });

    it("rejects negative outputId", () => {
      expect(schema.safeParse({ id: "h1", outputId: -1 }).success).toBe(false);
    });

    it("rejects negative delay and duration", () => {
      expect(schema.safeParse({ id: "h1", outputId: 0, delay: -1 }).success).toBe(false);
      expect(schema.safeParse({ id: "h1", outputId: 0, duration: -1 }).success).toBe(false);
    });
  });
});

describe("device action tools - read-only mode", () => {
  const { server, handlers } = createMockServer();
  const client = createMockClient();
  registerDeviceActionTools(server, client, true);

  it("registers no tools in read-only mode", () => {
    expect(handlers.size).toBe(0);
  });
});
