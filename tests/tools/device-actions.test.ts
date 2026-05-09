import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient, mockFn, expectSuccess, expectError } from "./_helpers.js";
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
      expect(configs.get("protect_play_siren")!.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
      });
    });
  });

  describe("protect_stop_siren", () => {
    it("stops siren", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      const result = await handlers.get("protect_stop_siren")!({ id: "s1" });
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
    it("activates with state and pulseDuration", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      await handlers.get("protect_activate_relay_output")!({
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

    it("toggles when state omitted", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      await handlers.get("protect_activate_relay_output")!({ id: "r1", outputId: 1 });
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/relays/r1/outputs/1/activate",
        undefined
      );
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("offline"));
      const result = await handlers.get("protect_activate_relay_output")!({
        id: "r1",
        outputId: 0,
      });
      expectError(result);
    });

    it("dry-run does not call client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_activate_relay_output")!({
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
    it("triggers with all options", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      await handlers.get("protect_trigger_alarm_hub_output")!({
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

    it("toggles when no body params", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      await handlers.get("protect_trigger_alarm_hub_output")!({ id: "h1", outputId: 1 });
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/alarm-hubs/h1/outputs/1/trigger",
        undefined
      );
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("offline"));
      const result = await handlers.get("protect_trigger_alarm_hub_output")!({
        id: "h1",
        outputId: 0,
      });
      expectError(result);
    });

    it("dry-run does not call client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_trigger_alarm_hub_output")!({
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

describe("device action tools - read-only mode", () => {
  const { server, handlers } = createMockServer();
  const client = createMockClient();
  registerDeviceActionTools(server, client, true);

  it("registers no tools in read-only mode", () => {
    expect(handlers.size).toBe(0);
  });
});
