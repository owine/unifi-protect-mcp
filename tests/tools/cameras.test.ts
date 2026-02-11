import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerCameraTools } from "../../src/tools/cameras.js";

describe("camera tools", () => {
  const { server, handlers } = createMockServer();
  const client = createMockClient();
  registerCameraTools(server, client);

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
  });

  describe("protect_disable_mic", () => {
    it("disables microphone", async () => {
      mockFn(client, "post").mockResolvedValue({ micDisabled: true });
      const result = await handlers.get("protect_disable_mic")!({ id: "cam1" });
      expect(result.content[0].text).toContain("micDisabled");
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/cameras/cam1/disable-mic-permanently"
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
  });
});
