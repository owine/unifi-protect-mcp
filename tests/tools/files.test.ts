import { describe, it, expect } from "vitest";
import {
  createMockServer,
  createMockClient,
  mockFn,
  expectSuccess,
  expectError,
  parseInputSchema,
} from "./_helpers.js";
import { registerFileTools } from "../../src/tools/files.js";

describe("file tools", () => {
  const { server, handlers, configs } = createMockServer();
  const client = createMockClient();
  registerFileTools(server, client, false);

  describe("protect_list_files", () => {
    it("lists files by type", async () => {
      mockFn(client, "get").mockResolvedValue([{ name: "f1", type: "animations" }]);
      const result = await handlers.get("protect_list_files")!({
        fileType: "animations",
      });
      expectSuccess(result, "animations");
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/files/animations");
    });

    it("returns error on failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_list_files")!({
        fileType: "animations",
      });
      expectError(result);
    });

    it("has read-only annotations", () => {
      expect(configs.get("protect_list_files")!.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
      });
    });

    it("accepts fileType 'animations'", () => {
      const schema = parseInputSchema(configs, "protect_list_files");
      expect(schema.safeParse({ fileType: "animations" }).success).toBe(true);
    });

    it("rejects undocumented fileType 'video'", () => {
      const schema = parseInputSchema(configs, "protect_list_files");
      expect(schema.safeParse({ fileType: "video" }).success).toBe(false);
    });
  });

  describe("protect_upload_file", () => {
    it("uploads base64-encoded file as multipart", async () => {
      mockFn(client, "postFile").mockResolvedValue({ name: "f2" });
      const base64 = Buffer.from("hello").toString("base64");
      const result = await handlers.get("protect_upload_file")!({
        fileType: "animations",
        base64Data: base64,
        contentType: "image/gif",
      });
      expectSuccess(result, "f2");
      expect(mockFn(client, "postFile")).toHaveBeenCalledWith(
        "/files/animations",
        expect.any(Buffer),
        "image/gif",
        "upload.gif"
      );
      const buffer = mockFn(client, "postFile").mock.calls.at(-1)![1] as Buffer;
      expect(buffer.toString()).toBe("hello");
    });

    it("derives upload.jpg for image/jpeg", async () => {
      mockFn(client, "postFile").mockClear().mockResolvedValue({ name: "f3" });
      await handlers.get("protect_upload_file")!({
        fileType: "animations",
        base64Data: "abc",
        contentType: "image/jpeg",
      });
      expect(mockFn(client, "postFile").mock.calls[0][3]).toBe("upload.jpg");
    });

    it("derives upload.wav for audio/wave", async () => {
      mockFn(client, "postFile").mockClear().mockResolvedValue({ name: "f4" });
      await handlers.get("protect_upload_file")!({
        fileType: "animations",
        base64Data: "abc",
        contentType: "audio/wave",
      });
      expect(mockFn(client, "postFile").mock.calls[0][3]).toBe("upload.wav");
    });

    it("passes an explicit fileName through", async () => {
      mockFn(client, "postFile").mockClear().mockResolvedValue({ name: "f5" });
      await handlers.get("protect_upload_file")!({
        fileType: "animations",
        base64Data: "abc",
        contentType: "image/png",
        fileName: "doorbell-welcome.png",
      });
      expect(mockFn(client, "postFile")).toHaveBeenCalledWith(
        "/files/animations",
        expect.any(Buffer),
        "image/png",
        "doorbell-welcome.png"
      );
    });

    it("returns error on failure", async () => {
      mockFn(client, "postFile").mockRejectedValue(new Error("too large"));
      const result = await handlers.get("protect_upload_file")!({
        fileType: "animations",
        base64Data: "abc",
        contentType: "image/gif",
      });
      expectError(result);
      expect(result.content[0].text).toContain("too large");
    });

    it("returns dry-run preview without calling client", async () => {
      mockFn(client, "postFile").mockClear();
      const base64 = Buffer.from("hello").toString("base64");
      const result = await handlers.get("protect_upload_file")!({
        fileType: "animations",
        base64Data: base64,
        contentType: "image/gif",
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("POST");
      expect(data.path).toBe("/files/animations");
      expect(data.body.contentType).toBe("image/gif");
      expect(data.body.fileName).toBe("upload.gif");
      expect(data.body.byteLength).toBe(5);
      expect(mockFn(client, "postFile")).not.toHaveBeenCalled();
    });

    it("strips a data URL prefix before decoding", async () => {
      mockFn(client, "postFile").mockClear().mockResolvedValue({ id: "f1" });
      const gif = "R0lGODlhAQABAAAAACw=";
      await handlers.get("protect_upload_file")!({
        fileType: "animations",
        base64Data: `data:image/gif;base64,${gif}`,
        contentType: "image/gif",
      });
      const sent = mockFn(client, "postFile").mock.calls[0][1] as Buffer;
      expect(sent.subarray(0, 6).toString()).toBe("GIF89a");
    });

    it("accepts line-wrapped base64", async () => {
      mockFn(client, "postFile").mockClear().mockResolvedValue({ id: "f1" });
      await handlers.get("protect_upload_file")!({
        fileType: "animations",
        base64Data: "R0lGODlh\nAQABAAAAACw=",
        contentType: "image/gif",
      });
      const sent = mockFn(client, "postFile").mock.calls[0][1] as Buffer;
      expect(sent.subarray(0, 6).toString()).toBe("GIF89a");
    });

    it("rejects data that is not base64 instead of uploading garbage", async () => {
      mockFn(client, "postFile").mockClear();
      const result = await handlers.get("protect_upload_file")!({
        fileType: "animations",
        base64Data: "not base64 at all!!",
        contentType: "image/gif",
      });
      expectError(result);
      expect(result.content[0].text).toMatch(/base64/i);
      expect(mockFn(client, "postFile")).not.toHaveBeenCalled();
    });

    it("rejects invalid base64 in a dry run too", async () => {
      const result = await handlers.get("protect_upload_file")!({
        fileType: "animations",
        base64Data: "%%%",
        contentType: "image/gif",
        dryRun: true,
      });
      expectError(result);
    });

    it("includes an explicit fileName in the dry-run preview", async () => {
      const result = await handlers.get("protect_upload_file")!({
        fileType: "animations",
        base64Data: "abc",
        contentType: "audio/mpeg",
        fileName: "chime.mp3",
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.body.fileName).toBe("chime.mp3");
    });

    it("has write annotations", () => {
      expect(configs.get("protect_upload_file")!.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
      });
    });

    it("declares an outputSchema", () => {
      const config = configs.get("protect_upload_file") as { outputSchema?: unknown };
      expect(config.outputSchema).toBeDefined();
    });

    describe("input schema", () => {
      const schema = parseInputSchema(configs, "protect_upload_file");

      it("accepts a documented upload", () => {
        expect(
          schema.safeParse({ fileType: "animations", base64Data: "abc", contentType: "image/gif" })
            .success
        ).toBe(true);
      });

      it("defaults contentType to image/gif", () => {
        const result = schema.safeParse({ fileType: "animations", base64Data: "abc" });
        expect(result.success).toBe(true);
        expect(result.data?.contentType).toBe("image/gif");
      });

      it.each([
        "image/gif",
        "image/jpeg",
        "image/png",
        "audio/mpeg",
        "audio/mp4",
        "audio/wave",
        "audio/x-caf",
      ])("accepts contentType %s", (contentType) => {
        expect(
          schema.safeParse({ fileType: "animations", base64Data: "abc", contentType }).success
        ).toBe(true);
      });

      it("rejects undocumented contentType video/mp4", () => {
        expect(
          schema.safeParse({ fileType: "animations", base64Data: "abc", contentType: "video/mp4" })
            .success
        ).toBe(false);
      });

      it("rejects undocumented fileType 'video'", () => {
        expect(
          schema.safeParse({ fileType: "video", base64Data: "abc", contentType: "image/gif" })
            .success
        ).toBe(false);
      });

      it("rejects an empty fileName", () => {
        expect(
          schema.safeParse({
            fileType: "animations",
            base64Data: "abc",
            contentType: "image/gif",
            fileName: "",
          }).success
        ).toBe(false);
      });
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
    expect(handlers.has("protect_upload_file")).toBe(false);
  });
});
