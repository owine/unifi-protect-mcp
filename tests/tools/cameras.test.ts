import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerCameraTools } from "../../src/tools/cameras.js";

describe("camera tools", () => {
  const { server, handlers, configs } = createMockServer();
  const client = createMockClient();
  registerCameraTools(server, client, false);

  describe("protect_list_cameras", () => {
    it("returns camera list", async () => {
      mockFn(client, "get").mockResolvedValue([{ id: "cam1" }]);
      const result = await handlers.get("protect_list_cameras")!({});
      expect(result.content[0].text).toContain("cam1");
    });

    it("returns error on failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_list_cameras")!({});
      expect(result.isError).toBe(true);
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
      expect(result.content[0].text).toContain("Front");
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/cameras/cam1");
    });

    it("returns error on failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("not found"));
      const result = await handlers.get("protect_get_camera")!({ id: "x" });
      expect(result.isError).toBe(true);
    });
  });

  describe("protect_update_camera", () => {
    it("patches camera settings", async () => {
      mockFn(client, "patch").mockResolvedValue({ id: "cam1", name: "Updated" });
      const result = await handlers.get("protect_update_camera")!({
        id: "cam1",
        settings: { name: "Updated" },
      });
      expect(result.content[0].text).toContain("Updated");
      expect(mockFn(client, "patch")).toHaveBeenCalledWith("/cameras/cam1", {
        name: "Updated",
      });
    });

    it("returns error on failure", async () => {
      mockFn(client, "patch").mockRejectedValue(new Error("forbidden"));
      const result = await handlers.get("protect_update_camera")!({
        id: "cam1",
        settings: {},
      });
      expect(result.isError).toBe(true);
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
      expect(result.isError).toBe(true);
    });
  });

  describe("protect_create_rtsp_stream", () => {
    it("creates stream session", async () => {
      mockFn(client, "post").mockResolvedValue({ streamUrl: "rtsps://..." });
      const result = await handlers.get("protect_create_rtsp_stream")!({ id: "cam1" });
      expect(result.content[0].text).toContain("rtsps://");
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/cameras/cam1/rtsps-stream");
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_create_rtsp_stream")!({ id: "cam1" });
      expect(result.isError).toBe(true);
    });

    it("supports dry-run", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_create_rtsp_stream")!({
        id: "cam1",
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("POST");
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });
  });

  describe("protect_get_rtsp_streams", () => {
    it("returns active streams", async () => {
      mockFn(client, "get").mockResolvedValue([{ id: "s1" }]);
      const result = await handlers.get("protect_get_rtsp_streams")!({ id: "cam1" });
      expect(result.content[0].text).toContain("s1");
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/cameras/cam1/rtsps-stream");
    });
  });

  describe("protect_delete_rtsp_stream", () => {
    it("deletes stream session", async () => {
      mockFn(client, "delete").mockResolvedValue({ deleted: true });
      const result = await handlers.get("protect_delete_rtsp_stream")!({ id: "cam1" });
      expect(result.content[0].text).toContain("deleted");
      expect(mockFn(client, "delete")).toHaveBeenCalledWith("/cameras/cam1/rtsps-stream");
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
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("DELETE");
      expect(mockFn(client, "delete")).not.toHaveBeenCalled();
    });
  });

  describe("protect_create_talkback", () => {
    it("creates talkback session", async () => {
      mockFn(client, "post").mockResolvedValue({ sessionId: "tb1" });
      const result = await handlers.get("protect_create_talkback")!({ id: "cam1" });
      expect(result.content[0].text).toContain("tb1");
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
  });

  describe("protect_disable_mic", () => {
    it("disables microphone when confirm is true", async () => {
      mockFn(client, "post").mockResolvedValue({ micDisabled: true });
      const result = await handlers.get("protect_disable_mic")!({
        id: "cam1",
        confirm: true,
      });
      expect(result.content[0].text).toContain("micDisabled");
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
  });

  describe("protect_start_ptz_patrol", () => {
    it("starts patrol at slot", async () => {
      mockFn(client, "post").mockResolvedValue({ started: true });
      const result = await handlers.get("protect_start_ptz_patrol")!({
        id: "cam1",
        slot: 2,
      });
      expect(result.content[0].text).toContain("started");
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
  });

  describe("protect_stop_ptz_patrol", () => {
    it("stops patrol", async () => {
      mockFn(client, "post").mockResolvedValue({ stopped: true });
      const result = await handlers.get("protect_stop_ptz_patrol")!({ id: "cam1" });
      expect(result.content[0].text).toContain("stopped");
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
  });

  describe("protect_goto_ptz_preset", () => {
    it("moves to preset position", async () => {
      mockFn(client, "post").mockResolvedValue({ moved: true });
      const result = await handlers.get("protect_goto_ptz_preset")!({
        id: "cam1",
        slot: 3,
      });
      expect(result.content[0].text).toContain("moved");
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
