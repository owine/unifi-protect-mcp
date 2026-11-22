import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { File } from "node:buffer";
import { FormData, type RequestInit } from "undici";
import { ProtectClient, retryAfterMs, withCallSignal } from "../src/client.js";
import type { Config } from "../src/config.js";
import {
  DEFAULT_RETRY_AFTER_MS,
  MAX_ERROR_BODY_BYTES,
  MAX_RATE_LIMIT_RETRIES,
  MAX_RESPONSE_BYTES,
  MAX_RETRY_AFTER_MS,
  REQUEST_TIMEOUT_MS,
  STARTUP_CHECK_TIMEOUT_MS,
} from "../src/utils/limits.js";

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
      const body = chunkedResponse(MAX_RESPONSE_BYTES + 4 * MiB, { headers: { "content-type": "application/json" } });
      fetchMock.mockResolvedValue(body.response);
      await expect(client.get("/nvrs")).rejects.toThrow(/exceeds the .*-byte limit/);
      expect(body.pulled()).toBeLessThan(body.chunks);
    });

    // A list tool pages what it reads, so a site whose whole list is larger
    // than one result must still be readable (2.x read up to one message).
    it("reads a JSON body larger than one MCP message, for a list tool to page", async () => {
      const items = Array.from({ length: 12_000 }, (_, i) => ({ id: `cam${i.toString()}`, notes: "x".repeat(1_000) }));
      mockFetch(items);
      const data = (await client.get("/cameras")) as unknown[];
      expect(data).toHaveLength(items.length);
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

  describe("rate limiting", () => {
    /** The console's 429 (live 7.4.99): the rate limiter's body and Retry-After. */
    const limited = (retryAfter: string | null = "0") =>
      new Response(JSON.stringify({ error: "Too many requests", name: "TOO_MANY_REQUESTS_ERROR", windowMs: 1000, limit: 10 }), {
        status: 429,
        headers: { "content-type": "application/json", ...(retryAfter === null ? {} : { "retry-after": retryAfter }) },
      });
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("retries a rate-limited read and returns its result", async () => {
      fetchMock.mockResolvedValueOnce(limited()).mockResolvedValueOnce(limited()).mockResolvedValueOnce(ok({ applicationVersion: "7.4.99" }));
      await expect(client.get("/meta/info")).resolves.toEqual({ applicationVersion: "7.4.99" });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    // The limiter answers before the request reaches Protect, so a 429'd
    // write was not applied and is sent again, with the same body.
    it("retries a rate-limited write with the same body", async () => {
      fetchMock.mockResolvedValueOnce(limited()).mockResolvedValueOnce(ok({ id: "c1" }));
      await client.patch("/cameras/c1", { name: "x" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const bodies = fetchMock.mock.calls.map((call) => (call[1] as RequestInit).body);
      expect(bodies).toEqual([JSON.stringify({ name: "x" }), JSON.stringify({ name: "x" })]);
    });

    it("gives up after the retry budget and says so", async () => {
      fetchMock.mockImplementation(() => Promise.resolve(limited()));
      await expect(client.get("/nvrs")).rejects.toThrow(
        new RegExp(`^HTTP 429: .*TOO_MANY_REQUESTS_ERROR.*still rate-limited after ${MAX_RATE_LIMIT_RETRIES.toString()} retries`)
      );
      expect(fetchMock).toHaveBeenCalledTimes(MAX_RATE_LIMIT_RETRIES + 1);
    });

    // The last 429 of an exhausted budget still says how long to wait.
    it("names the last Retry-After once the retry budget is spent", async () => {
      const seconds = MAX_RETRY_AFTER_MS / 1000 + 1;
      for (let i = 0; i < MAX_RATE_LIMIT_RETRIES; i++) fetchMock.mockResolvedValueOnce(limited());
      fetchMock.mockResolvedValueOnce(limited(String(seconds)));
      await expect(client.get("/nvrs")).rejects.toThrow(
        new RegExp(`still rate-limited after ${MAX_RATE_LIMIT_RETRIES.toString()} retries; wait ${seconds.toString()} s before calling again\\)$`)
      );
      expect(fetchMock).toHaveBeenCalledTimes(MAX_RATE_LIMIT_RETRIES + 1);
    });

    // Cloud Connector's per-minute limit asks for longer waits than this
    // server holds a call for; the model must learn how long to wait.
    it("returns a 429 whose Retry-After is too long to wait out at once, saying how long to wait", async () => {
      const seconds = MAX_RETRY_AFTER_MS / 1000 + 1;
      fetchMock.mockResolvedValueOnce(limited(String(seconds)));
      await expect(client.get("/nvrs")).rejects.toThrow(
        new RegExp(`^HTTP 429: .*\\(rate-limited; wait ${seconds.toString()} s before calling again\\)$`)
      );
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("rounds a fractional long wait up to whole seconds", async () => {
      fetchMock.mockResolvedValueOnce(limited(`${(MAX_RETRY_AFTER_MS / 1000).toString()}.37`));
      await expect(client.get("/nvrs")).rejects.toThrow(
        `wait ${(MAX_RETRY_AFTER_MS / 1000 + 1).toString()} s before calling again`
      );
    });

    // After a retry, a long wait keeps both the retry count and the wait.
    it("reports the retries and the wait when a later 429 asks for a long wait", async () => {
      const seconds = MAX_RETRY_AFTER_MS / 1000 + 1;
      fetchMock.mockResolvedValueOnce(limited()).mockResolvedValueOnce(limited(String(seconds)));
      await expect(client.get("/nvrs")).rejects.toThrow(
        new RegExp(`still rate-limited after 1 retry; wait ${seconds.toString()} s before calling again\\)$`)
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // A digit-only Retry-After past Number's range parses as Infinity.
    it("names no figure for a Retry-After too large to be a number", async () => {
      fetchMock.mockResolvedValueOnce(limited("9".repeat(400)));
      await expect(client.get("/nvrs")).rejects.toThrow(/^HTTP 429: .*\(rate-limited; wait before calling again\)$/);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("waits the Retry-After before sending again", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      fetchMock.mockResolvedValueOnce(limited("1")).mockResolvedValueOnce(ok({}));
      const pending = client.get("/nvrs");
      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("stops waiting when the call is cancelled", async () => {
      fetchMock.mockResolvedValueOnce(limited("1"));
      const controller = new AbortController();
      const pending = withCallSignal(controller.signal, () => client.get("/nvrs"));
      setTimeout(() => { controller.abort(new DOMException("This operation was aborted", "AbortError")); }, 10);
      const started = Date.now();
      await expect(pending).rejects.toThrow("This operation was aborted");
      expect(Date.now() - started).toBeLessThan(DEFAULT_RETRY_AFTER_MS);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("does not retry other errors", async () => {
      mockFetch("Not Found", { status: 404, contentType: "text/plain" });
      await expect(client.get("/nvrs")).rejects.toThrow("HTTP 404");
      expect(fetchMock).toHaveBeenCalledOnce();
    });
  });

  describe("retryAfterMs", () => {
    const now = Date.parse("Sun, 15 Nov 2026 16:21:13 GMT");
    it.each([
      ["delay-seconds", "1", 1000],
      ["fractional delay-seconds", "5.37", 5370],
      // Rounded up, so a wait just over a threshold never reads as under it.
      ["a fraction of a millisecond over", "5.0001", 5001],
      ["zero", "0", 0],
      ["an HTTP date", "Sun, 15 Nov 2026 16:21:15 GMT", 2000],
      ["a past HTTP date", "Sun, 15 Nov 2026 16:21:10 GMT", 0],
      ["no header", null, DEFAULT_RETRY_AFTER_MS],
      ["an unreadable header", "soon", DEFAULT_RETRY_AFTER_MS],
      ["a negative number", "-5", DEFAULT_RETRY_AFTER_MS],
    ])("reads %s", (_label, header, expected) => {
      expect(retryAfterMs(header, now)).toBe(expected);
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

  describe("checkConnection", () => {
    it("reads /meta/info and resolves to the console's Protect version", async () => {
      mockFetch({ applicationVersion: "7.3.70" });
      await expect(client.checkConnection()).resolves.toBe("7.3.70");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://192.168.1.1/proxy/protect/integration/v1/meta/info",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("rejects with the HTTP status when the console refuses the key", async () => {
      mockFetch({ error: "Unauthorized" }, { status: 401 });
      await expect(client.checkConnection()).rejects.toThrow(/^HTTP 401: .*Unauthorized/);
    });

    it("rejects with the network failure and its reason", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed", {
        cause: Object.assign(new Error("getaddrinfo ENOTFOUND nvr.invalid"), { code: "ENOTFOUND" }),
      }));
      await expect(client.checkConnection()).rejects.toThrow("fetch failed: getaddrinfo ENOTFOUND nvr.invalid");
    });

    // Something other than Protect answered: a different web server on that
    // address, or a proxy that answers every path.
    it.each([
      ["an HTML page", "<html>login</html>", "text/html"],
      ["a JSON array", "[]", "application/json"],
      ["JSON without applicationVersion", '{"status":"ok"}', "application/json"],
      ["a non-string applicationVersion", '{"applicationVersion":7}', "application/json"],
    ])("rejects a 200 that is %s", async (_label, body, contentType) => {
      mockFetch(body, { contentType });
      await expect(client.checkConnection()).rejects.toThrow(/did not answer as UniFi Protect/);
    });

    it("waits only the startup budget, not a tool call's", async () => {
      const timeout = vi.spyOn(AbortSignal, "timeout");
      mockFetch({ applicationVersion: "7.3.70" });
      await client.checkConnection();
      expect(timeout).toHaveBeenCalledWith(STARTUP_CHECK_TIMEOUT_MS);
      expect(timeout).not.toHaveBeenCalledWith(REQUEST_TIMEOUT_MS);
      timeout.mockRestore();
    });

    it("says how long it waited when Protect never answers", async () => {
      fetchMock.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
      await expect(client.checkConnection()).rejects.toThrow(
        `GET /meta/info: Protect did not respond within ${(STARTUP_CHECK_TIMEOUT_MS / 1000).toString()} s`
      );
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

    it("identifies itself rather than as undici", async () => {
      mockFetch({});
      await client.get("/nvrs");
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^unifi-protect-mcp\/\d+\.\d+\.\d+/);
    });

    it("includes the underlying cause in the error message", async () => {
      failWith("connect ECONNREFUSED 192.168.1.1:443", "ECONNREFUSED");
      await expect(client.get("/nvrs")).rejects.toThrow(
        "fetch failed: connect ECONNREFUSED 192.168.1.1:443"
      );
    });

    // A host with IPv4 and IPv6 addresses fails on each, and undici's cause is
    // then an AggregateError whose own message is empty.
    it("names the reasons when every address of the host failed", async () => {
      const cause = Object.assign(
        new AggregateError([new Error("connect ECONNREFUSED 192.168.1.1:443"), new Error("connect ECONNREFUSED ::1:443")], ""),
        { code: "ECONNREFUSED" }
      );
      fetchMock.mockRejectedValue(new TypeError("fetch failed", { cause }));
      await expect(client.get("/nvrs")).rejects.toThrow(
        "fetch failed: connect ECONNREFUSED 192.168.1.1:443; connect ECONNREFUSED ::1:443"
      );
    });

    it("falls back to the cause's code when no reason has a message", async () => {
      const cause = Object.assign(new AggregateError([], ""), { code: "ETIMEDOUT" });
      fetchMock.mockRejectedValue(new TypeError("fetch failed", { cause }));
      await expect(client.get("/nvrs")).rejects.toThrow("fetch failed: ETIMEDOUT");
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

  // A 408 or 504 is a timeout on the way to Protect (Cloud Connector sends
  // 408 when a console is slow), so a write may still have landed.
  describe("gateway timeouts", () => {
    it.each([408, 504])("say a timed-out read (HTTP %i) can be retried", async (status) => {
      mockFetch({ code: "timeout" }, { status });
      await expect(client.get("/nvrs")).rejects.toThrow(
        new RegExp(`^HTTP ${status.toString()}: .*timed out before Protect answered; retry when the console responds\\)$`)
      );
    });

    it.each([408, 504])("say a timed-out write (HTTP %i) may still have been applied", async (status) => {
      mockFetch({ code: "timeout" }, { status });
      await expect(client.post("/sirens/s1/play", {})).rejects.toThrow(
        /timed out before Protect answered; the change may still have been applied, so check before retrying\)$/
      );
    });

    it("are not retried", async () => {
      mockFetch({ code: "timeout" }, { status: 408 });
      await expect(client.patch("/cameras/c1", { name: "x" })).rejects.toThrow("HTTP 408");
      expect(fetchMock).toHaveBeenCalledOnce();
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

    // The route to the console, not the request, is what failed; the
    // Site Manager error body alone does not say so.
    it("explains a 403 as a key that may not reach this console", async () => {
      mockFetch({ code: "forbidden", httpStatusCode: 403, message: "forbidden", traceId: "t1" }, { status: 403 });
      await expect(new ProtectClient(connectorConfig).get("/nvrs")).rejects.toThrow(
        /^HTTP 403: .*traceId.*a personal Site Manager key reaches only the consoles its owner owns\)$/
      );
    });

    it("explains a 502 as a console the connector cannot reach", async () => {
      mockFetch({ code: "bad_gateway", httpStatusCode: 502, message: "bad gateway", traceId: "t1" }, { status: 502 });
      await expect(new ProtectClient(connectorConfig).get("/nvrs")).rejects.toThrow(
        /Cloud Connector could not reach the console; check that it is online\)$/
      );
    });

    it("adds no connector hint to a local console's 403 or 502", async () => {
      mockFetch("Forbidden", { status: 403, contentType: "text/plain" });
      await expect(client.get("/nvrs")).rejects.toThrow(/^HTTP 403: Forbidden$/);
      mockFetch("Bad Gateway", { status: 502, contentType: "text/plain" });
      await expect(client.get("/nvrs")).rejects.toThrow(/^HTTP 502: Bad Gateway$/);
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
