import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { File } from "node:buffer";
import { FormData, type RequestInit } from "undici";
import { ProtectClient } from "../src/client.js";
import type { Config } from "../src/config.js";
import { MAX_ERROR_BODY_BYTES, MAX_JSON_BYTES } from "../src/utils/limits.js";

// The client calls undici's fetch rather than the global one, so mock that;
// the real Agent and FormData stay, since the client still builds them.
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("undici", async (importOriginal) => ({ ...await importOriginal<typeof import("undici")>(), fetch: fetchMock }));

const { wsUrls, wsOptions } = vi.hoisted(() => ({
  wsUrls: [] as string[],
  wsOptions: [] as Record<string, unknown>[],
}));
vi.mock("ws", () => ({
  // A function expression, not an arrow: connectWebSocket calls it with `new`.
  default: vi.fn(function (url: string, options: Record<string, unknown>) {
    wsUrls.push(url);
    wsOptions.push(options);
  }),
}));

function mockFetch(body: unknown, options?: { status?: number; contentType?: string }) {
  const status = options?.status ?? 200;
  const contentType = options?.contentType ?? "application/json";
  // A fresh real Response per call: a body can be read only once.
  fetchMock.mockImplementation(() => Promise.resolve(new Response(
    status === 204 ? null : typeof body === "string" ? body : JSON.stringify(body),
    { status, headers: { "content-type": contentType } }
  )));
}

const MiB = 1024 * 1024;

/**
 * A body that arrives in 1 MiB chunks with no content-length, as a chunked
 * response does. `pulled()` says how many chunks the reader consumed.
 */
function chunkedResponse(totalBytes: number, init: ResponseInit = {}, fill = "x") {
  const chunk = new TextEncoder().encode(fill.padEnd(MiB, " "));
  const chunks = Math.ceil(totalBytes / MiB);
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent < chunks) { sent++; controller.enqueue(chunk); } else controller.close();
    },
  });
  return { response: new Response(stream, init), pulled: () => sent, chunks };
}

const baseConfig: Config = {
  host: "192.168.1.1",
  apiKey: "test-key",
  verifySsl: true,
  readOnly: true,
};

describe("ProtectClient", () => {
  let client: ProtectClient;
  let savedTlsEnv: string | undefined;

  beforeEach(() => {
    savedTlsEnv = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    fetchMock.mockReset();
    client = new ProtectClient(baseConfig);
  });

  afterEach(() => {
    if (savedTlsEnv === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = savedTlsEnv;
    }
  });

  describe("get", () => {
    it("makes GET request and returns JSON", async () => {
      const data = { id: "nvr1" };
      mockFetch(data);
      const result = await client.get("/nvrs");
      expect(result).toEqual(data);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://192.168.1.1/proxy/protect/integration/v1/nvrs",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("returns text for non-JSON responses", async () => {
      mockFetch("plain text", { contentType: "text/plain" });
      const result = await client.get("/status");
      expect(result).toBe("plain text");
    });

    it("throws on HTTP errors", async () => {
      mockFetch("Not Found", { status: 404, contentType: "text/plain" });
      await expect(client.get("/missing")).rejects.toThrow("HTTP 404: Not Found");
    });
  });

  describe("post", () => {
    it("makes POST request with JSON body", async () => {
      const data = { created: true };
      mockFetch(data);
      const result = await client.post("/cameras/1/rtsps-stream");
      expect(result).toEqual(data);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/cameras/1/rtsps-stream"),
        expect.objectContaining({ method: "POST" })
      );
    });

    it("sends body when provided", async () => {
      mockFetch({ ok: true });
      await client.post("/liveviews", { name: "test" });
      expect(fetchMock).toHaveBeenCalledWith(
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
      mockFetch({ updated: true });
      const result = await client.patch("/cameras/1", { name: "new" });
      expect(result).toEqual({ updated: true });
      expect(fetchMock).toHaveBeenCalledWith(
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
      mockFetch({ deleted: true });
      const result = await client.delete("/cameras/1/rtsps-stream");
      expect(result).toEqual({ deleted: true });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("getBinary", () => {
    it("returns Buffer and mimeType", async () => {
      const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      fetchMock.mockResolvedValue(
        new Response(imageBytes, { headers: { "content-type": "image/jpeg" } })
      );
      const result = await client.getBinary("/cameras/1/snapshot");
      expect(result.mimeType).toBe("image/jpeg");
      expect(Buffer.isBuffer(result.data)).toBe(true);
      expect(result.data).toEqual(imageBytes);
    });

    it("defaults mimeType when content-type is missing", async () => {
      const response = new Response(new Uint8Array(0));
      response.headers.delete("content-type");
      fetchMock.mockResolvedValue(response);
      const result = await client.getBinary("/cameras/1/snapshot");
      expect(result.mimeType).toBe("application/octet-stream");
    });

    it("throws on HTTP errors", async () => {
      fetchMock.mockResolvedValue(new Response("Server Error", { status: 500 }));
      await expect(client.getBinary("/cameras/1/snapshot")).rejects.toThrow(
        "HTTP 500: Server Error"
      );
    });
  });

  describe("postFile", () => {
    function lastInit() {
      return fetchMock.mock.calls[0][1] as RequestInit;
    }

    it("sends the file as multipart/form-data under the 'file' part", async () => {
      mockFetch({ name: "abc", type: "animations" });
      const buf = Buffer.from("GIF89a-bytes");
      const result = await client.postFile(
        "/files/animations",
        buf,
        "image/gif",
        "welcome.gif"
      );
      expect(result).toEqual({ name: "abc", type: "animations" });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://192.168.1.1/proxy/protect/integration/v1/files/animations",
        expect.objectContaining({ method: "POST" })
      );

      const body = lastInit().body;
      expect(body).toBeInstanceOf(FormData);
      const part = (body as FormData).get("file");
      expect(part).toBeInstanceOf(Blob);
      const file = part as File;
      expect(file.type).toBe("image/gif");
      expect(file.name).toBe("welcome.gif");
      expect(Buffer.from(await file.arrayBuffer()).toString()).toBe("GIF89a-bytes");
    });

    it("sends only the API key header and lets fetch set the multipart Content-Type", async () => {
      mockFetch({ ok: true });
      await client.postFile("/files/animations", Buffer.from("x"), "audio/mpeg", "a.mp3");
      const headers = lastInit().headers as Record<string, string>;
      expect(headers["X-API-KEY"]).toBe("test-key");
      expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("content-type");
    });

    it("returns text for non-JSON responses", async () => {
      mockFetch("upload ok", { contentType: "text/plain" });
      const result = await client.postFile(
        "/files/animations",
        Buffer.from("data"),
        "image/gif",
        "upload.gif"
      );
      expect(result).toBe("upload ok");
    });

    it("throws on HTTP errors", async () => {
      mockFetch("Bad Request", { status: 400, contentType: "text/plain" });
      await expect(
        client.postFile("/files/animations", Buffer.from("data"), "image/gif", "upload.gif")
      ).rejects.toThrow("HTTP 400: Bad Request");
    });

    it("reports an empty JSON body distinctly from a parse failure", async () => {
      mockFetch("", { contentType: "application/json" });
      await expect(
        client.postFile("/files/animations", Buffer.from("data"), "image/gif", "upload.gif")
      ).rejects.toThrow(/empty body/i);
    });

    it("rejects a response whose content-length exceeds the JSON limit", async () => {
      fetchMock.mockResolvedValue(new Response("{}", {
          headers: { "content-type": "application/json", "content-length": "99999999" },
        }));
      await expect(
        client.postFile("/files/animations", Buffer.from("data"), "image/gif", "upload.gif")
      ).rejects.toThrow(/exceeds/i);
    });
  });

  describe("bounded body reads", () => {
    // content-length is optional: a chunked body has none, so the size limit
    // has to be enforced while reading, not only from the header.
    it("stops reading a chunked JSON body at the limit", async () => {
      const body = chunkedResponse(MAX_JSON_BYTES + 4 * MiB, { headers: { "content-type": "application/json" } });
      fetchMock.mockResolvedValue(body.response);
      await expect(client.get("/nvrs")).rejects.toThrow(/exceeds the .*-byte limit/);
      expect(body.pulled()).toBeLessThan(body.chunks);
    });

    it("stops reading a chunked binary body at the caller's limit", async () => {
      const body = chunkedResponse(6 * MiB, { headers: { "content-type": "image/jpeg" } });
      fetchMock.mockResolvedValue(body.response);
      await expect(client.getBinary("/cameras/1/snapshot", 2 * MiB)).rejects.toThrow(/exceeds the .*-byte limit/);
      expect(body.pulled()).toBeLessThan(body.chunks);
    });

    it("reads only the start of a chunked error body", async () => {
      const body = chunkedResponse(MAX_ERROR_BODY_BYTES + 4 * MiB, { status: 502 }, "<html>gateway error</html>");
      fetchMock.mockResolvedValue(body.response);
      await expect(client.get("/nvrs")).rejects.toThrow(/^HTTP 502: <html>gateway error<\/html>/);
      expect(body.pulled()).toBeLessThan(body.chunks);
    });
  });

  describe("error messages name the call", () => {
    const timeout = () => fetchMock.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));

    it("says a timed-out read can be retried", async () => {
      timeout();
      await expect(client.get("/nvrs")).rejects.toThrow(/^GET \/nvrs: Protect did not respond within \d+ s\. Retry/);
    });

    // A write that timed out may have reached the console; retrying blindly
    // could, say, fire a relay twice.
    it("says a timed-out write may still have been applied", async () => {
      timeout();
      await expect(client.patch("/cameras/c1", { name: "x" })).rejects.toThrow(
        /^PATCH \/cameras\/c1: Protect did not respond within \d+ s\. The change may still have been applied/
      );
    });

    it("leaves a cancellation's error alone", async () => {
      fetchMock.mockRejectedValue(new DOMException("This operation was aborted", "AbortError"));
      await expect(client.get("/nvrs")).rejects.toThrow("This operation was aborted");
    });

    it("names the call when Protect returns malformed JSON", async () => {
      mockFetch("{not json", { contentType: "application/json" });
      await expect(client.get("/nvrs")).rejects.toThrow(/^Protect returned malformed JSON for GET \/nvrs/);
    });
  });

  describe("path guard", () => {
    // A bare `.` or `..` survives safePath and URL parsing folds it out of the
    // path, so the request would reach a different endpoint.
    // URL parsing treats %2E%2E as `..` too. safePath double-encodes `%`, so
    // only a hand-built path could carry it.
    it.each(["/cameras/..", "/cameras/.", "/cameras/a/../nvrs", "/cameras/%2E%2E", "/cameras/x#y", "cameras"])(
      "refuses %s without sending it",
      async (path) => {
        mockFetch({});
        await expect(client.get(path)).rejects.toThrow(/outside the Integration API/);
        expect(fetchMock).not.toHaveBeenCalled();
      }
    );

    it.each(["/cameras/abc/snapshot?highQuality=true", "/alarm-manager/webhook/Front%20door", "/cameras/%252E%252E"])(
      "sends %s",
      async (path) => {
        mockFetch({});
        await client.get(path);
        expect(fetchMock).toHaveBeenCalledOnce();
      }
    );
  });

  describe("network failures", () => {
    it("propagates fetch TypeError on network failure", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      await expect(client.get("/nvrs")).rejects.toThrow("fetch failed");
    });

    it("propagates fetch TypeError for getBinary", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      await expect(client.getBinary("/cameras/1/snapshot")).rejects.toThrow("fetch failed");
    });

    it("propagates fetch TypeError for postFile", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      await expect(
        client.postFile("/files/animations", Buffer.from("data"), "image/gif", "upload.gif")
      ).rejects.toThrow("fetch failed");
    });

    // undici reports every transport failure as "fetch failed" and puts the
    // actual reason (refused, DNS, TLS) on `cause`.
    function failWith(message: string, code: string) {
      const cause = Object.assign(new Error(message), { code });
      fetchMock.mockRejectedValue(new TypeError("fetch failed", { cause }));
    }

    it("includes the underlying cause in the error message", async () => {
      failWith("connect ECONNREFUSED 192.168.1.1:443", "ECONNREFUSED");
      await expect(client.get("/nvrs")).rejects.toThrow(
        "fetch failed: connect ECONNREFUSED 192.168.1.1:443"
      );
    });

    // Cloud Connector refuses a pin and verification-off, so its hint must not
    // suggest them.
    it("points at interception, not a pin, for a Cloud Connector certificate error", async () => {
      failWith("unable to verify the first certificate", "UNABLE_TO_VERIFY_LEAF_SIGNATURE");
      const cloud = new ProtectClient({ ...baseConfig, host: "api.ui.com", consoleId: "abc" });
      const error = (await cloud.get("/nvrs").catch((err: unknown) => err)) as Error;
      expect(error.message).toMatch(/intercepting TLS/);
      expect(error.message).not.toMatch(/UNIFI_PROTECT_CA_CERT|VERIFY_SSL/);
    });

    it("points to UNIFI_PROTECT_VERIFY_SSL on a certificate error", async () => {
      failWith("self-signed certificate", "DEPTH_ZERO_SELF_SIGNED_CERT");
      await expect(client.get("/nvrs")).rejects.toThrow(/UNIFI_PROTECT_VERIFY_SSL=false/);
    });

    it("includes the cause for getBinary", async () => {
      failWith("self-signed certificate", "DEPTH_ZERO_SELF_SIGNED_CERT");
      await expect(client.getBinary("/cameras/1/snapshot")).rejects.toThrow(
        /self-signed certificate.*UNIFI_PROTECT_VERIFY_SSL=false/
      );
    });

    it("includes the cause for postFile", async () => {
      failWith("getaddrinfo ENOTFOUND nvr.local", "ENOTFOUND");
      await expect(
        client.postFile("/files/animations", Buffer.from("data"), "image/gif", "upload.gif")
      ).rejects.toThrow("fetch failed: getaddrinfo ENOTFOUND nvr.local");
    });

    it("does not add the TLS hint to non-certificate failures", async () => {
      failWith("connect ECONNREFUSED 192.168.1.1:443", "ECONNREFUSED");
      await expect(client.get("/nvrs")).rejects.not.toThrow(/VERIFY_SSL/);
    });
  });

  describe("edge cases", () => {
    it("handles empty response body as text", async () => {
      mockFetch("", { contentType: "text/plain" });
      const result = await client.get("/status");
      expect(result).toBe("");
    });

    it("does not set body key when post body is undefined", async () => {
      mockFetch({ ok: true });
      await client.post("/cameras/1/rtsps-stream");
      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty("body");
    });
  });

  describe("transport hardening", () => {
    function rawFetch(headers: Record<string, string>, body: BodyInit = "{}") {
      return vi.fn().mockImplementation(() => Promise.resolve(new Response(body, { headers })));
    }

    it("rejects redirects on JSON requests", async () => {
      mockFetch({ id: "nvr1" });
      await client.get("/nvrs");
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ redirect: "error" })
      );
    });

    it("applies an abort signal to JSON requests", async () => {
      mockFetch({ id: "nvr1" });
      await client.get("/nvrs");
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it("rejects a JSON response whose content-length exceeds the limit", async () => {
      fetchMock.mockImplementation(rawFetch({ "content-type": "application/json", "content-length": "99999999" }));
      await expect(client.get("/nvrs")).rejects.toThrow(/exceeds/i);
    });

    it("reports an empty JSON body distinctly from a parse failure", async () => {
      mockFetch("", { contentType: "application/json" });
      await expect(client.get("/nvrs")).rejects.toThrow(/empty body/i);
    });

    it("treats 204 No Content as an empty success even with a JSON content-type", async () => {
      mockFetch("", { status: 204, contentType: "application/json" });
      await expect(client.post("/sirens/s1/play")).resolves.toBe("");
    });

    it("does not read the body of a 204 response", async () => {
      const response = new Response(null, { status: 204, headers: { "content-type": "application/json" } });
      fetchMock.mockResolvedValue(response);
      await expect(client.post("/relays/r1/activate")).resolves.toBe("");
      expect(response.bodyUsed).toBe(false);
    });

    it("rejects redirects on binary downloads", async () => {
      fetchMock.mockImplementation(rawFetch({ "content-type": "image/jpeg" }, new Uint8Array(4)));
      await client.getBinary("/cameras/1/snapshot");
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ redirect: "error" })
      );
    });

    it("applies an abort signal to binary downloads", async () => {
      fetchMock.mockImplementation(rawFetch({ "content-type": "image/jpeg" }, new Uint8Array(4)));
      await client.getBinary("/cameras/1/snapshot");
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it("rejects a binary download whose content-length exceeds the limit", async () => {
      fetchMock.mockImplementation(rawFetch({ "content-type": "video/mp4", "content-length": "999999999" }, new Uint8Array(4)));
      await expect(client.getBinary("/cameras/1/snapshot")).rejects.toThrow(/exceeds/i);
    });

    it.each([
      ["JSON request", () => client.get("/nvrs")],
      ["binary download", () => client.getBinary("/cameras/1/snapshot")],
      ["binary upload", () => client.postFile("/files/animations", Buffer.from("data"), "image/gif", "upload.gif")],
    ])("reports only the start of a huge error body on a %s", async (_label, call) => {
      const body = chunkedResponse(MAX_ERROR_BODY_BYTES + 4 * MiB, {
        status: 500,
        headers: { "content-length": "999999999" },
      }, "upstream failure");
      fetchMock.mockResolvedValue(body.response);
      await expect(call()).rejects.toThrow(/^HTTP 500: upstream failure.*\(truncated\)$/s);
      expect(body.pulled()).toBeLessThan(body.chunks);
    });

    it("truncates a long error body in the thrown message", async () => {
      const long = "x".repeat(50_000);
      fetchMock.mockImplementation(() => Promise.resolve(new Response(long, { status: 500 })));
      await expect(client.get("/nvrs")).rejects.toThrow(/truncated/);
      const err = (await client.get("/nvrs").catch((e: unknown) => e)) as Error;
      expect(err.message.length).toBeLessThan(3000);
    });

    it("rejects redirects on binary uploads", async () => {
      mockFetch({ ok: true });
      await client.postFile("/files/animations", Buffer.from("data"), "image/gif", "upload.gif");
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ redirect: "error" })
      );
    });

    it("applies an abort signal to binary uploads", async () => {
      mockFetch({ ok: true });
      await client.postFile("/files/animations", Buffer.from("data"), "image/gif", "upload.gif");
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe("Cloud Connector", () => {
    const connectorConfig: Config = {
      ...baseConfig,
      host: "api.ui.com",
      consoleId: "CONSOLE1",
    };
    const connectorBase =
      "https://api.ui.com/v1/connector/consoles/CONSOLE1/proxy/protect/integration/v1";

    it("prefixes JSON requests with the console path", async () => {
      mockFetch({ id: "nvr1" });
      await new ProtectClient(connectorConfig).get("/nvrs");
      expect(fetchMock).toHaveBeenCalledWith(`${connectorBase}/nvrs`, expect.anything());
    });

    it("prefixes binary downloads with the console path", async () => {
      fetchMock.mockResolvedValue(new Response(new Uint8Array(4), { headers: { "content-type": "image/jpeg" } }));
      await new ProtectClient(connectorConfig).getBinary("/cameras/1/snapshot");
      expect(fetchMock).toHaveBeenCalledWith(
        `${connectorBase}/cameras/1/snapshot`,
        expect.anything()
      );
    });

    // Verified live 2026-09-22: REST proxies fine through the connector, but
    // the same path returns HTTP 404 on WebSocket upgrade. Fail with a usable
    // message instead of surfacing an opaque 404 to the MCP client.
    it("refuses WebSocket subscriptions over Cloud Connector", () => {
      expect(() =>
        new ProtectClient(connectorConfig).connectWebSocket("/subscribe/events")
      ).toThrow(/Cloud Connector/);
    });

    it("still opens WebSockets against a direct host", () => {
      new ProtectClient(baseConfig).connectWebSocket("/subscribe/events");
      expect(wsUrls.at(-1)).toBe(
        "wss://192.168.1.1/proxy/protect/integration/v1/subscribe/events"
      );
    });

    it("ignores the console ID when the host is not api.ui.com", async () => {
      const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockFetch({ id: "nvr1" });
      await new ProtectClient({ ...baseConfig, consoleId: "CONSOLE1" }).get("/nvrs");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://192.168.1.1/proxy/protect/integration/v1/nvrs",
        expect.anything()
      );
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe("connectWebSocket", () => {
    it("authenticates with the API key and passes the caller's frame cap to ws", () => {
      client.connectWebSocket("/subscribe/events", { maxPayload: 1234 });
      const options = wsOptions.at(-1) as { headers: Record<string, string>; maxPayload: number };
      expect(options.headers["X-API-KEY"]).toBe("test-key");
      expect(options.maxPayload).toBe(1234);
    });
  });

  describe("binary requests", () => {
    it("authenticate snapshots with the API key", async () => {
      fetchMock.mockResolvedValue(new Response(new Uint8Array(4), { headers: { "content-type": "image/jpeg" } }));
      await client.getBinary("/cameras/1/snapshot");
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>)["X-API-KEY"]).toBe("test-key");
    });
  });
});
