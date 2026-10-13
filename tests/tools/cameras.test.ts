import { describe, it, expect } from "vitest";
import {
  createMockServer,
  createMockClient,
  mockFn,
  expectSuccess,
  expectError,
  parseInputSchema,
} from "./_helpers.js";
import { registerCameraTools } from "../../src/tools/cameras.js";

describe("camera tools", () => {
  const { server, handlers, configs } = createMockServer();
  const client = createMockClient();
  registerCameraTools(server, client, false);

  describe("protect_list_cameras", () => {
    it("returns camera list", async () => {
      mockFn(client, "get").mockResolvedValue([{ id: "cam1" }]);
      const result = await handlers.get("protect_list_cameras")!({});
      expectSuccess(result, "cam1");
    });

    it("returns error on failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_list_cameras")!({});
      expectError(result);
    });

    it("has read-only annotations", () => {
      expect(configs.get("protect_list_cameras")!.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
      });
    });
  });

  describe("protect_get_camera", () => {
    it("fetches camera by ID", async () => {
      mockFn(client, "get").mockResolvedValue({ id: "cam1", name: "Front" });
      const result = await handlers.get("protect_get_camera")!({ id: "cam1" });
      expectSuccess(result, "Front");
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/cameras/cam1");
    });

    it("returns error on failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("not found"));
      const result = await handlers.get("protect_get_camera")!({ id: "x" });
      expectError(result);
    });
  });

  describe("protect_update_camera", () => {
    it("patches camera settings", async () => {
      mockFn(client, "patch").mockResolvedValue({ id: "cam1", name: "Updated" });
      const result = await handlers.get("protect_update_camera")!({
        id: "cam1",
        settings: { name: "Updated" },
      });
      expectSuccess(result, "Updated");
      expect(mockFn(client, "patch")).toHaveBeenCalledWith("/cameras/cam1", {
        name: "Updated",
      });
    });

    it("returns error on failure", async () => {
      mockFn(client, "patch").mockRejectedValue(new Error("forbidden"));
      const result = await handlers.get("protect_update_camera")!({
        id: "cam1",
        settings: { name: "x" },
      });
      expectError(result);
    });

    it("passes unknown extra settings keys through to client.patch unchanged", async () => {
      mockFn(client, "patch").mockResolvedValue({ id: "cam1" });
      const settings = {
        name: "Front",
        hdrType: "on",
        futureField: { nested: [1, 2] },
      };
      const parsed = parseInputSchema(configs, "protect_update_camera").parse({
        id: "cam1",
        settings,
      });
      expect(parsed.settings).toEqual(settings);
      await handlers.get("protect_update_camera")!(parsed);
      expect(mockFn(client, "patch")).toHaveBeenCalledWith("/cameras/cam1", settings);
    });

    describe("input validation", () => {
      const schema = parseInputSchema(configs, "protect_update_camera");

      it("accepts known typed fields", () => {
        expect(
          schema.safeParse({
            id: "cam1",
            settings: { videoMode: "highFps", hdrType: "auto", micVolume: 50 },
          }).success
        ).toBe(true);
      });

      it("rejects an unknown videoMode", () => {
        expect(
          schema.safeParse({ id: "cam1", settings: { videoMode: "bogus" } }).success
        ).toBe(false);
      });

      it("rejects an unknown hdrType", () => {
        expect(
          schema.safeParse({ id: "cam1", settings: { hdrType: "bogus" } }).success
        ).toBe(false);
      });

      it("rejects micVolume outside 0-100", () => {
        expect(
          schema.safeParse({ id: "cam1", settings: { micVolume: 101 } }).success
        ).toBe(false);
        expect(
          schema.safeParse({ id: "cam1", settings: { micVolume: -1 } }).success
        ).toBe(false);
      });

      it("rejects empty settings", () => {
        expect(schema.safeParse({ id: "cam1", settings: {} }).success).toBe(false);
      });
    });

    it("returns dry-run preview without calling client", async () => {
      mockFn(client, "patch").mockClear();
      const result = await handlers.get("protect_update_camera")!({
        id: "cam1",
        settings: { name: "Test" },
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("PATCH");
      expect(data.path).toBe("/cameras/cam1");
      expect(mockFn(client, "patch")).not.toHaveBeenCalled();
    });

    it("has write annotations", () => {
      expect(configs.get("protect_update_camera")!.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
      });
    });
  });

  describe("protect_get_snapshot", () => {
    it("returns image content with base64 data", async () => {
      const imageBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      mockFn(client, "getBinary").mockResolvedValue({
        data: imageBuffer,
        mimeType: "image/jpeg",
      });
      const result = await handlers.get("protect_get_snapshot")!({ id: "cam1" });
      expect(result.content[0].type).toBe("image");
      expect(result.content[0].data).toBe(imageBuffer.toString("base64"));
      expect(result.content[0].mimeType).toBe("image/jpeg");
    });

    it("returns error on failure", async () => {
      mockFn(client, "getBinary").mockRejectedValue(new Error("HTTP 500"));
      const result = await handlers.get("protect_get_snapshot")!({ id: "cam1" });
      expectError(result);
    });

    it("appends highQuality parameter when true", async () => {
      const imageBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      mockFn(client, "getBinary").mockResolvedValue({
        data: imageBuffer,
        mimeType: "image/jpeg",
      });
      const result = await handlers.get("protect_get_snapshot")!({
        id: "cam1",
        highQuality: true,
      });
      expect(result.content[0].type).toBe("image");
      expect(mockFn(client, "getBinary")).toHaveBeenCalledWith(
        "/cameras/cam1/snapshot?highQuality=true"
      );
    });

    it("appends channel=package parameter", async () => {
      mockFn(client, "getBinary").mockResolvedValue({
        data: Buffer.from([0xff, 0xd8]),
        mimeType: "image/jpeg",
      });
      await handlers.get("protect_get_snapshot")!({ id: "cam1", channel: "package" });
      expect(mockFn(client, "getBinary")).toHaveBeenCalledWith(
        "/cameras/cam1/snapshot?channel=package"
      );
    });

    it("combines highQuality and channel parameters", async () => {
      mockFn(client, "getBinary").mockResolvedValue({
        data: Buffer.from([0xff, 0xd8]),
        mimeType: "image/jpeg",
      });
      await handlers.get("protect_get_snapshot")!({
        id: "cam1",
        highQuality: true,
        channel: "package",
      });
      expect(mockFn(client, "getBinary")).toHaveBeenCalledWith(
        "/cameras/cam1/snapshot?highQuality=true&channel=package"
      );
    });
  });

  describe("protect_create_rtsp_stream", () => {
    it("creates stream session", async () => {
      mockFn(client, "post").mockResolvedValue({ streamUrl: "rtsps://..." });
      const result = await handlers.get("protect_create_rtsp_stream")!({ confirm: true,
        id: "cam1",
        qualities: ["high"],
      });
      expectSuccess(result, "rtsps://");
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/cameras/cam1/rtsps-stream",
        { qualities: ["high"] }
      );
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_create_rtsp_stream")!({
        id: "cam1",
        qualities: ["high"],
      });
      expectError(result);
    });

    it("supports dry-run", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_create_rtsp_stream")!({
        id: "cam1",
        qualities: ["high"],
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("POST");
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("rejects an empty qualities array", () => {
      const schema = parseInputSchema(configs, "protect_create_rtsp_stream");
      expect(schema.safeParse({ id: "cam1", qualities: [] }).success).toBe(false);
      expect(schema.safeParse({ id: "cam1", qualities: ["high"] }).success).toBe(true);
    });
  });

  describe("protect_get_rtsp_streams", () => {
    it("returns active streams", async () => {
      mockFn(client, "get").mockResolvedValue([{ id: "s1" }]);
      const result = await handlers.get("protect_get_rtsp_streams")!({ id: "cam1" });
      expectSuccess(result, "s1");
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/cameras/cam1/rtsps-stream");
    });

    it("returns error on failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_get_rtsp_streams")!({ id: "cam1" });
      expectError(result);
    });
  });

  describe("protect_delete_rtsp_stream", () => {
    it("deletes stream session", async () => {
      mockFn(client, "delete").mockResolvedValue({ deleted: true });
      const result = await handlers.get("protect_delete_rtsp_stream")!({
        id: "cam1",
        qualities: ["high"],
      });
      expectSuccess(result, "deleted");
      expect(mockFn(client, "delete")).toHaveBeenCalledWith(
        "/cameras/cam1/rtsps-stream?qualities=high"
      );
    });

    it("has destructive annotations", () => {
      expect(configs.get("protect_delete_rtsp_stream")!.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
      });
    });

    it("supports dry-run", async () => {
      mockFn(client, "delete").mockClear();
      const result = await handlers.get("protect_delete_rtsp_stream")!({
        id: "cam1",
        qualities: ["high"],
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("DELETE");
      expect(data.path).toBe("/cameras/cam1/rtsps-stream?qualities=high");
      expect(mockFn(client, "delete")).not.toHaveBeenCalled();
    });

    it("sends multiple qualities as repeated query keys", async () => {
      mockFn(client, "delete").mockResolvedValue({ deleted: true });
      const result = await handlers.get("protect_delete_rtsp_stream")!({
        id: "cam1",
        qualities: ["high", "medium", "package"],
      });
      expectSuccess(result, "deleted");
      expect(mockFn(client, "delete")).toHaveBeenCalledWith(
        "/cameras/cam1/rtsps-stream?qualities=high&qualities=medium&qualities=package"
      );
    });

    it("dry-run preview uses repeated query keys for multiple qualities", async () => {
      mockFn(client, "delete").mockClear();
      const result = await handlers.get("protect_delete_rtsp_stream")!({
        id: "cam1",
        qualities: ["high", "medium"],
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.path).toBe(
        "/cameras/cam1/rtsps-stream?qualities=high&qualities=medium"
      );
      expect(mockFn(client, "delete")).not.toHaveBeenCalled();
    });

    it("encodes the camera ID in the path", async () => {
      mockFn(client, "delete").mockResolvedValue({ deleted: true });
      await handlers.get("protect_delete_rtsp_stream")!({
        id: "cam/1?x",
        qualities: ["low"],
      });
      expect(mockFn(client, "delete")).toHaveBeenCalledWith(
        "/cameras/cam%2F1%3Fx/rtsps-stream?qualities=low"
      );
    });

    it("returns error on failure", async () => {
      mockFn(client, "delete").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_delete_rtsp_stream")!({
        id: "cam1",
        qualities: ["high"],
      });
      expectError(result);
    });

    it("rejects an empty qualities array", () => {
      const schema = parseInputSchema(configs, "protect_delete_rtsp_stream");
      expect(schema.safeParse({ id: "cam1", qualities: [] }).success).toBe(false);
      expect(schema.safeParse({ id: "cam1", qualities: ["high"] }).success).toBe(true);
    });
  });

  describe("protect_create_talkback", () => {
    it("creates talkback session", async () => {
      mockFn(client, "post").mockResolvedValue({ sessionId: "tb1" });
      const result = await handlers.get("protect_create_talkback")!({ confirm: true, id: "cam1" });
      expectSuccess(result, "tb1");
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/cameras/cam1/talkback-session"
      );
    });

    it("supports dry-run", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_create_talkback")!({
        id: "cam1",
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("POST");
      expect(data.path).toBe("/cameras/cam1/talkback-session");
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_create_talkback")!({ id: "cam1" });
      expectError(result);
    });

    it("has write annotations", () => {
      expect(configs.get("protect_create_talkback")!.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
      });
    });
  });

  describe("protect_disable_mic", () => {
    it("disables microphone when confirm is true", async () => {
      mockFn(client, "post").mockResolvedValue({ micDisabled: true });
      const result = await handlers.get("protect_disable_mic")!({
        id: "cam1",
        confirm: true,
      });
      expectSuccess(result, "micDisabled");
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/cameras/cam1/disable-mic-permanently"
      );
    });

    it("has destructive annotations", () => {
      expect(configs.get("protect_disable_mic")!.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
      });
    });

    it("has IRREVERSIBLE in description", () => {
      expect(configs.get("protect_disable_mic")!.description).toContain(
        "IRREVERSIBLE"
      );
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_disable_mic")!({
        id: "cam1",
        confirm: true,
      });
      expectError(result);
    });

    it("refuses without confirm and does not call client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_disable_mic")!({
        id: "cam1",
        confirm: false,
      });
      expectError(result);
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("returns dry-run preview without calling client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_disable_mic")!({
        id: "cam1",
        confirm: true,
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("POST");
      expect(data.path).toBe("/cameras/cam1/disable-mic-permanently");
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("previews a dry run without confirm", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_disable_mic")!({ id: "cam1", dryRun: true });
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text).dryRun).toBe(true);
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("refuses the real call without confirm", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_disable_mic")!({ id: "cam1", confirm: false });
      expectError(result);
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("accepts only a boolean confirm in the input schema", () => {
      const schema = parseInputSchema(configs, "protect_disable_mic");
      expect(schema.safeParse({ id: "cam1", dryRun: true }).success).toBe(true);
      expect(schema.safeParse({ id: "cam1", confirm: true }).success).toBe(true);
      expect(schema.safeParse({ id: "cam1", confirm: "true" }).success).toBe(false);
    });

    it("declares an outputSchema", () => {
      const config = configs.get("protect_disable_mic") as Record<string, unknown>;
      expect(config.outputSchema).toBeDefined();
    });
  });

  describe("protect_start_ptz_patrol", () => {
    it("starts patrol at slot", async () => {
      mockFn(client, "post").mockResolvedValue({ started: true });
      const result = await handlers.get("protect_start_ptz_patrol")!({
        id: "cam1",
        slot: 2,
      });
      expectSuccess(result, "started");
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/cameras/cam1/ptz/patrol/start/2"
      );
    });

    it("supports dry-run", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_start_ptz_patrol")!({
        id: "cam1",
        slot: 2,
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("POST");
      expect(data.path).toBe("/cameras/cam1/ptz/patrol/start/2");
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_start_ptz_patrol")!({
        id: "cam1",
        slot: 2,
      });
      expectError(result);
    });

    it("has write annotations", () => {
      expect(configs.get("protect_start_ptz_patrol")!.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
      });
    });

    it("accepts slots 0-4 and rejects slots outside that range", () => {
      const schema = parseInputSchema(configs, "protect_start_ptz_patrol");
      expect(schema.safeParse({ id: "cam1", slot: 0 }).success).toBe(true);
      expect(schema.safeParse({ id: "cam1", slot: 4 }).success).toBe(true);
      expect(schema.safeParse({ id: "cam1", slot: 5 }).success).toBe(false);
      expect(schema.safeParse({ id: "cam1", slot: -1 }).success).toBe(false);
    });
  });

  describe("protect_stop_ptz_patrol", () => {
    it("stops patrol", async () => {
      mockFn(client, "post").mockResolvedValue({ stopped: true });
      const result = await handlers.get("protect_stop_ptz_patrol")!({ id: "cam1" });
      expectSuccess(result, "stopped");
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/cameras/cam1/ptz/patrol/stop"
      );
    });

    it("supports dry-run", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_stop_ptz_patrol")!({
        id: "cam1",
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("POST");
      expect(data.path).toBe("/cameras/cam1/ptz/patrol/stop");
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_stop_ptz_patrol")!({ id: "cam1" });
      expectError(result);
    });

    it("has write annotations", () => {
      expect(configs.get("protect_stop_ptz_patrol")!.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
      });
    });
  });

  describe("protect_goto_ptz_preset", () => {
    it("moves to preset position", async () => {
      mockFn(client, "post").mockResolvedValue({ moved: true });
      const result = await handlers.get("protect_goto_ptz_preset")!({
        id: "cam1",
        slot: 3,
      });
      expectSuccess(result, "moved");
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/cameras/cam1/ptz/goto/3"
      );
    });

    it("supports dry-run", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_goto_ptz_preset")!({
        id: "cam1",
        slot: 3,
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("POST");
      expect(data.path).toBe("/cameras/cam1/ptz/goto/3");
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("moves to the home position with slot -1", async () => {
      mockFn(client, "post").mockResolvedValue({ moved: true });
      await handlers.get("protect_goto_ptz_preset")!({ id: "cam1", slot: -1 });
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/cameras/cam1/ptz/goto/-1");
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_goto_ptz_preset")!({
        id: "cam1",
        slot: 3,
      });
      expectError(result);
    });

    it("has write annotations", () => {
      expect(configs.get("protect_goto_ptz_preset")!.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
      });
    });

    it("accepts -1 and slots above 4, rejects below -1 and non-integers", () => {
      const schema = parseInputSchema(configs, "protect_goto_ptz_preset");
      expect(schema.safeParse({ id: "cam1", slot: -1 }).success).toBe(true);
      expect(schema.safeParse({ id: "cam1", slot: 8 }).success).toBe(true);
      expect(schema.safeParse({ id: "cam1", slot: -2 }).success).toBe(false);
      expect(schema.safeParse({ id: "cam1", slot: 1.5 }).success).toBe(false);
    });
  });
});

describe("camera tools - read-only mode", () => {
  const { server, handlers } = createMockServer();
  const client = createMockClient();
  registerCameraTools(server, client, true);

  it("registers read-only tools", () => {
    expect(handlers.has("protect_list_cameras")).toBe(true);
    expect(handlers.has("protect_get_camera")).toBe(true);
    expect(handlers.has("protect_get_snapshot")).toBe(true);
    expect(handlers.has("protect_get_rtsp_streams")).toBe(true);
  });

  it("does not register write tools", () => {
    expect(handlers.has("protect_update_camera")).toBe(false);
    expect(handlers.has("protect_create_rtsp_stream")).toBe(false);
    expect(handlers.has("protect_delete_rtsp_stream")).toBe(false);
    expect(handlers.has("protect_create_talkback")).toBe(false);
    expect(handlers.has("protect_disable_mic")).toBe(false);
    expect(handlers.has("protect_start_ptz_patrol")).toBe(false);
    expect(handlers.has("protect_stop_ptz_patrol")).toBe(false);
    expect(handlers.has("protect_goto_ptz_preset")).toBe(false);
  });
});
