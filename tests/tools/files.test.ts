import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerFileTools } from "../../src/tools/files.js";

describe("file tools", () => {
  const { server, handlers } = createMockServer();
  const client = createMockClient();
  registerFileTools(server, client);

  describe("protect_trigger_alarm_webhook", () => {
    it("triggers webhook by ID", async () => {
      mockFn(client, "post").mockResolvedValue({ triggered: true });
      const result = await handlers.get("protect_trigger_alarm_webhook")!({
        id: "wh1",
      });
      expect(result.content[0].text).toContain("triggered");
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/alarm-manager/webhook/wh1"
      );
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("not found"));
      const result = await handlers.get("protect_trigger_alarm_webhook")!({
        id: "x",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("protect_list_files", () => {
    it("lists files by type", async () => {
      mockFn(client, "get").mockResolvedValue([{ id: "f1", type: "video" }]);
      const result = await handlers.get("protect_list_files")!({
        fileType: "video",
      });
      expect(result.content[0].text).toContain("video");
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/files/video");
    });

    it("returns error on failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_list_files")!({
        fileType: "video",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("protect_upload_file", () => {
    it("uploads base64-encoded file", async () => {
      mockFn(client, "postBinary").mockResolvedValue({ id: "f2" });
      const base64 = Buffer.from("hello").toString("base64");
      const result = await handlers.get("protect_upload_file")!({
        fileType: "video",
        base64Data: base64,
        contentType: "video/mp4",
      });
      expect(result.content[0].text).toContain("f2");
      expect(mockFn(client, "postBinary")).toHaveBeenCalledWith(
        "/files/video",
        expect.any(Buffer),
        "video/mp4"
      );
    });

    it("returns error on failure", async () => {
      mockFn(client, "postBinary").mockRejectedValue(new Error("too large"));
      const result = await handlers.get("protect_upload_file")!({
        fileType: "video",
        base64Data: "abc",
        contentType: "video/mp4",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("too large");
    });
  });
});
