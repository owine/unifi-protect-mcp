import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient, mockFn, expectSuccess, expectError } from "./_helpers.js";
import { registerFileTools } from "../../src/tools/files.js";

describe("file tools", () => {
  const { server, handlers, configs } = createMockServer();
  const client = createMockClient();
  registerFileTools(server, client, false);

  describe("protect_trigger_alarm_webhook", () => {
    it("triggers webhook by ID when confirm is true", async () => {
      mockFn(client, "post").mockResolvedValue("");
      const result = await handlers.get("protect_trigger_alarm_webhook")!({
        id: "wh1",
        confirm: true,
      });
      expectSuccess(result, "triggered");
      expectSuccess(result, "wh1");
      expect(mockFn(client, "post")).toHaveBeenCalledWith(
        "/alarm-manager/webhook/wh1"
      );
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("not found"));
      const result = await handlers.get("protect_trigger_alarm_webhook")!({
        id: "x",
        confirm: true,
      });
      expectError(result);
    });

    it("has destructive annotations", () => {
      expect(configs.get("protect_trigger_alarm_webhook")!.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
      });
    });

    it("has alarm description", () => {
      expect(configs.get("protect_trigger_alarm_webhook")!.description).toContain(
        "external alarm"
      );
    });
  });

  describe("protect_list_files", () => {
    it("lists files by type", async () => {
      mockFn(client, "get").mockResolvedValue([{ id: "f1", type: "video" }]);
      const result = await handlers.get("protect_list_files")!({
        fileType: "video",
      });
      expectSuccess(result, "video");
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/files/video");
    });

    it("returns error on failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_list_files")!({
        fileType: "video",
      });
      expectError(result);
    });

    it("has read-only annotations", () => {
      expect(configs.get("protect_list_files")!.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
      });
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
      expectSuccess(result, "f2");
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
      expectError(result);
      expect(result.content[0].text).toContain("too large");
    });

    it("returns dry-run preview without calling client", async () => {
      mockFn(client, "postBinary").mockClear();
      const base64 = Buffer.from("hello").toString("base64");
      const result = await handlers.get("protect_upload_file")!({
        fileType: "video",
        base64Data: base64,
        contentType: "video/mp4",
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("POST");
      expect(data.path).toBe("/files/video");
      expect(mockFn(client, "postBinary")).not.toHaveBeenCalled();
    });
  });
});

describe("file tools - read-only mode", () => {
  const { server, handlers } = createMockServer();
  const client = createMockClient();
  registerFileTools(server, client, true);

  it("registers read-only tools", () => {
    expect(handlers.has("protect_list_files")).toBe(true);
  });

  it("does not register write tools", () => {
    expect(handlers.has("protect_trigger_alarm_webhook")).toBe(false);
    expect(handlers.has("protect_upload_file")).toBe(false);
  });
});
