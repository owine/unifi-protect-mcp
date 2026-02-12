import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProtectClient } from "../src/client.js";
import type { Config } from "../src/config.js";

function mockFetch(body: unknown, options?: { status?: number; contentType?: string }) {
  const status = options?.status ?? 200;
  const contentType = options?.contentType ?? "application/json";
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
    arrayBuffer: async () => {
      const buf = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
    headers: new Headers({ "content-type": contentType }),
  } as unknown as Response);
}

const baseConfig: Config = {
  host: "192.168.1.1",
  apiKey: "test-key",
  verifySsl: true,
};

describe("ProtectClient", () => {
  let client: ProtectClient;

  beforeEach(() => {
    client = new ProtectClient(baseConfig);
  });

  describe("get", () => {
    it("makes GET request and returns JSON", async () => {
      const data = { id: "nvr1" };
      vi.stubGlobal("fetch", mockFetch(data));
      const result = await client.get("/nvrs");
      expect(result).toEqual(data);
      expect(fetch).toHaveBeenCalledWith(
        "https://192.168.1.1/proxy/protect/integration/v1/nvrs",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("returns text for non-JSON responses", async () => {
      vi.stubGlobal("fetch", mockFetch("plain text", { contentType: "text/plain" }));
      const result = await client.get("/status");
      expect(result).toBe("plain text");
    });

    it("throws on HTTP errors", async () => {
      vi.stubGlobal("fetch", mockFetch("Not Found", { status: 404, contentType: "text/plain" }));
      await expect(client.get("/missing")).rejects.toThrow("HTTP 404: Not Found");
    });
  });

  describe("post", () => {
    it("makes POST request with JSON body", async () => {
      const data = { created: true };
      vi.stubGlobal("fetch", mockFetch(data));
      const result = await client.post("/cameras/1/rtsps-stream");
      expect(result).toEqual(data);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/cameras/1/rtsps-stream"),
        expect.objectContaining({ method: "POST" })
      );
    });

    it("sends body when provided", async () => {
      vi.stubGlobal("fetch", mockFetch({ ok: true }));
      await client.post("/liveviews", { name: "test" });
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "test" }),
        })
      );
    });
  });

  describe("patch", () => {
    it("makes PATCH request with body", async () => {
      vi.stubGlobal("fetch", mockFetch({ updated: true }));
      const result = await client.patch("/cameras/1", { name: "new" });
      expect(result).toEqual({ updated: true });
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "new" }),
        })
      );
    });
  });

  describe("delete", () => {
    it("makes DELETE request", async () => {
      vi.stubGlobal("fetch", mockFetch({ deleted: true }));
      const result = await client.delete("/cameras/1/rtsps-stream");
      expect(result).toEqual({ deleted: true });
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("getBinary", () => {
    it("returns Buffer and mimeType", async () => {
      const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers({ "content-type": "image/jpeg" }),
          arrayBuffer: async () =>
            imageBytes.buffer.slice(
              imageBytes.byteOffset,
              imageBytes.byteOffset + imageBytes.byteLength
            ),
        })
      );
      const result = await client.getBinary("/cameras/1/snapshot");
      expect(result.mimeType).toBe("image/jpeg");
      expect(Buffer.isBuffer(result.data)).toBe(true);
    });

    it("defaults mimeType when content-type is missing", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers(),
          arrayBuffer: async () => new ArrayBuffer(0),
        })
      );
      const result = await client.getBinary("/cameras/1/snapshot");
      expect(result.mimeType).toBe("application/octet-stream");
    });

    it("throws on HTTP errors", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => "Server Error",
        })
      );
      await expect(client.getBinary("/cameras/1/snapshot")).rejects.toThrow(
        "HTTP 500: Server Error"
      );
    });
  });

  describe("postBinary", () => {
    it("sends binary data with correct content type", async () => {
      vi.stubGlobal("fetch", mockFetch({ uploaded: true }));
      const buf = Buffer.from("file-data");
      const result = await client.postBinary("/files/video", buf, "video/mp4");
      expect(result).toEqual({ uploaded: true });
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/files/video"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "video/mp4" }),
        })
      );
    });

    it("returns text for non-JSON responses", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch("upload ok", { contentType: "text/plain" })
      );
      const result = await client.postBinary(
        "/files/video",
        Buffer.from("data"),
        "video/mp4"
      );
      expect(result).toBe("upload ok");
    });

    it("throws on HTTP errors", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch("Bad Request", { status: 400, contentType: "text/plain" })
      );
      await expect(
        client.postBinary("/files/video", Buffer.from("data"), "video/mp4")
      ).rejects.toThrow("HTTP 400: Bad Request");
    });
  });

  describe("constructor", () => {
    it("disables TLS verification when verifySsl is false", () => {
      new ProtectClient({ ...baseConfig, verifySsl: false });
      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe("0");
    });
  });

  describe("network failures", () => {
    it("propagates fetch TypeError on network failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
      await expect(client.get("/nvrs")).rejects.toThrow("fetch failed");
    });

    it("propagates fetch TypeError for getBinary", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
      await expect(client.getBinary("/cameras/1/snapshot")).rejects.toThrow("fetch failed");
    });

    it("propagates fetch TypeError for postBinary", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
      await expect(
        client.postBinary("/files/video", Buffer.from("data"), "video/mp4")
      ).rejects.toThrow("fetch failed");
    });
  });

  describe("edge cases", () => {
    it("handles empty response body as text", async () => {
      vi.stubGlobal("fetch", mockFetch("", { contentType: "text/plain" }));
      const result = await client.get("/status");
      expect(result).toBe("");
    });

    it("does not set body key when post body is undefined", async () => {
      vi.stubGlobal("fetch", mockFetch({ ok: true }));
      await client.post("/cameras/1/rtsps-stream");
      const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty("body");
    });
  });
});
