import { AsyncLocalStorage } from "node:async_hooks";
import WebSocket from "ws";
import type { Agent } from "undici";
import { Config, isCloudConnectorHost } from "./config.js";
import { consoleDispatcher, consoleTlsOptions } from "./tls.js";
import {
  BINARY_TIMEOUT_MS,
  MAX_ERROR_BODY_BYTES,
  MAX_JSON_BYTES,
  MAX_SNAPSHOT_BYTES,
  REQUEST_TIMEOUT_MS,
} from "./utils/limits.js";

/**
 * The abort signal of the MCP tool call a request is made for. Without it a
 * cancelled (or abandoned) call keeps its request running, and a write such as
 * a relay or siren lands after the host has already reported the call as
 * cancelled.
 */
const callSignal = new AsyncLocalStorage<AbortSignal>();

/** Run fn so that every request it makes is aborted when signal is. */
export function withCallSignal<T>(signal: AbortSignal | undefined, fn: () => T): T {
  return signal ? callSignal.run(signal, fn) : fn();
}

/** The abort signal of the tool call in progress, if any. */
export function currentCallSignal(): AbortSignal | undefined {
  return callSignal.getStore();
}

function requestSignal(timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  const caller = callSignal.getStore();
  return caller ? AbortSignal.any([caller, timeout]) : timeout;
}

const MS_PER_SECOND = 1000;
/** Error text is forwarded to the MCP client, so keep it context-sized. */
const MAX_ERROR_BODY_CHARS = 2_000;

/**
 * Read a response body, stopping at limit bytes. content-length is checked
 * first, but it is optional (a chunked body has none), so the limit is also
 * enforced while reading; either way at most limit bytes are buffered. With
 * `truncate`, an over-limit body yields its first limit bytes instead of an
 * error.
 */
async function readBounded(
  response: Response,
  limit: number,
  what: string,
  truncate = false
): Promise<{ data: Buffer; truncated: boolean }> {
  const declared = Number(response.headers.get("content-length"));
  if (!truncate && Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel();
    throw new Error(`${what} is ${declared.toString()} bytes, which exceeds the ${limit.toString()}-byte limit`);
  }
  if (response.body === null) return { data: Buffer.alloc(0), truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return { data: Buffer.concat(chunks), truncated: false };
      if (bytes + value.byteLength > limit) {
        await reader.cancel();
        if (!truncate) {
          throw new Error(`${what} exceeds the ${limit.toString()}-byte limit`);
        }
        chunks.push(value.subarray(0, limit - bytes));
        return { data: Buffer.concat(chunks), truncated: true };
      }
      bytes += value.byteLength;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Read an error body for inclusion in a thrown message: only its start, both
 * in memory and in the text that reaches the MCP client's context window.
 */
async function readErrorBody(response: Response): Promise<string> {
  const { data, truncated } = await readBounded(response, MAX_ERROR_BODY_BYTES, "Error body", true);
  const text = data.toString("utf8");
  return truncated || text.length > MAX_ERROR_BODY_CHARS
    ? `${text.slice(0, MAX_ERROR_BODY_CHARS)}… (truncated)`
    : text;
}

/** Node TLS error codes for a certificate the client could not verify. */
const CERT_ERROR_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

/**
 * fetch reports every transport failure as a bare "fetch failed" and keeps the
 * reason (refused, DNS, TLS) on `cause`. Only `message` reaches the MCP client,
 * so fold the cause into it — and name the setting that fixes the most common
 * first-run failure, a console's self-signed certificate.
 */
async function fetchWithCause(url: string, init: RequestInit & { dispatcher: Agent }): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const cause = err instanceof Error ? err.cause : undefined;
    if (!(err instanceof Error) || !(cause instanceof Error)) throw err;
    const code = (cause as NodeJS.ErrnoException).code;
    // Cloud Connector has a publicly trusted certificate, and refuses both a
    // pin and verification-off, so a failure there means something between
    // here and api.ui.com is presenting another certificate.
    const certificateHint = isCloudConnectorHost(new URL(url).host)
      ? ". The certificate for api.ui.com could not be verified; check for a proxy or firewall intercepting TLS"
      : ". The console's TLS certificate could not be verified; for a console with a self-signed certificate, save the certificate and point UNIFI_PROTECT_CA_CERT at it (or, on a trusted network only, set UNIFI_PROTECT_VERIFY_SSL=false)";
    const hint = code !== undefined && CERT_ERROR_CODES.has(code) ? certificateHint : "";
    throw new Error(`${err.message}: ${cause.message}${hint}`, { cause: err });
  }
}

/**
 * Parse a successful response body: JSON when the content type says so,
 * otherwise text.
 */
async function parseBody(
  response: Response,
  method: string,
  path: string
): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const { data } = await readBounded(response, MAX_JSON_BYTES, `${method} ${path} response`);
  const text = data.toString("utf8");
  if (contentType.includes("application/json")) {
    if (text.trim() === "") {
      // A bare JSON.parse would report "Unexpected end of JSON input", which
      // reads as a broken tool rather than an unusable Protect response.
      throw new Error(
        `Protect returned an empty body for ${method} ${path} with a JSON content type`
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (err) {
      throw new Error(
        `Protect returned malformed JSON for ${method} ${path}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }
  }
  return text;
}

/**
 * Run a request so that its timeout reads as what it is, naming the call. A
 * write that timed out may still have reached the console, so retrying it
 * blindly could, say, switch a relay twice. A cancellation (AbortError) is left
 * alone: the caller asked for it.
 */
async function explainTimeout<T>(method: string, path: string, timeoutMs: number, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!(err instanceof DOMException) || err.name !== "TimeoutError") throw err;
    const hint = method === "GET"
      ? "Retry when the console responds."
      : "The change may still have been applied; check before retrying.";
    throw new Error(
      `${method} ${path}: Protect did not respond within ${(timeoutMs / MS_PER_SECOND).toString()} s. ${hint}`,
      { cause: err }
    );
  }
}

export class ProtectClient {
  private baseUrl: string;
  private basePath: string;
  private tls: ReturnType<typeof consoleTlsOptions>;
  private dispatcher: Agent;
  private headers: Record<string, string>;
  private usingConnector: boolean;

  constructor(config: Config) {
    // Cloud Connector only exists behind api.ui.com. A console ID set against
    // a local console is ignored rather than fatal: every tool still works
    // against that console, and refusing to start helps nobody.
    const useConnector =
      config.consoleId !== undefined && isCloudConnectorHost(config.host);
    if (config.consoleId !== undefined && !useConnector) {
      console.error(
        `Ignoring UNIFI_PROTECT_CONSOLE_ID: Cloud Connector requires host api.ui.com, but host is ${config.host}.`
      );
    }
    const consolePath = useConnector
      ? `/v1/connector/consoles/${config.consoleId ?? ""}`
      : "";
    this.usingConnector = useConnector;
    this.baseUrl = `https://${config.host}${consolePath}/proxy/protect/integration/v1`;
    this.basePath = new URL(this.baseUrl).pathname;
    this.headers = {
      "X-API-KEY": config.apiKey,
      "Content-Type": "application/json",
    };

    this.tls = consoleTlsOptions(config);
    this.dispatcher = consoleDispatcher(config);
  }

  /**
   * Model-supplied IDs become path segments. safePath encodes `/ ? # % \`, but
   * a bare `.` or `..` survives encoding and URL parsing then folds it out of
   * the path, so the request would reach a different endpoint than the tool
   * built. Refuse any path that parsing would rewrite. The ID schemas reject
   * these first; this is the backstop for a tool that forgets one.
   */
  private resolve(path: string): string {
    const url = `${this.baseUrl}${path}`;
    const parsed = new URL(url);
    const pathname = path.split("?", 1)[0];
    if (!path.startsWith("/") || parsed.hash !== "" || parsed.pathname !== `${this.basePath}${pathname}`) {
      throw new Error(`Refusing a request path outside the Integration API: ${pathname}`);
    }
    return url;
  }

  /**
   * The one place a request is sent: every path builds its URL, applies
   * `redirect: "error"` (so X-API-KEY never follows a redirect) and its
   * timeout, and turns a non-2xx status into an error with a bounded body.
   */
  private async send(
    method: string,
    path: string,
    init: { body?: BodyInit; headers: Record<string, string>; timeoutMs: number }
  ): Promise<Response> {
    const response = await fetchWithCause(this.resolve(path), {
      method,
      headers: init.headers,
      ...(init.body !== undefined ? { body: init.body } : {}),
      redirect: "error",
      signal: requestSignal(init.timeoutMs),
      dispatcher: this.dispatcher,
    });
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${await readErrorBody(response)}`
      );
    }
    return response;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    return explainTimeout(method, path, REQUEST_TIMEOUT_MS, () => this.sendJson(method, path, body));
  }

  private async sendJson(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await this.send(method, path, {
      headers: this.headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      timeoutMs: REQUEST_TIMEOUT_MS,
    });

    // 204 No Content (action endpoints: siren/relay/speaker triggers, arm
    // profile enable/disable, PTZ, …) has no body by definition — don't let a
    // stray JSON content-type turn a success into an "empty body" error.
    if (response.status === 204) {
      return "";
    }

    return parseBody(response, method, path);
  }

  async get(path: string): Promise<unknown> {
    return this.request("GET", path);
  }

  async post(path: string, body?: unknown): Promise<unknown> {
    return this.request("POST", path, body);
  }

  async patch(path: string, body: unknown): Promise<unknown> {
    return this.request("PATCH", path, body);
  }

  async delete(path: string): Promise<unknown> {
    return this.request("DELETE", path);
  }

  async getBinary(
    path: string,
    maxBytes: number = MAX_SNAPSHOT_BYTES
  ): Promise<{ data: Buffer; mimeType: string }> {
    return explainTimeout("GET", path, BINARY_TIMEOUT_MS, () => this.download(path, maxBytes));
  }

  private async download(path: string, maxBytes: number): Promise<{ data: Buffer; mimeType: string }> {
    const response = await this.send("GET", path, {
      headers: { "X-API-KEY": this.headers["X-API-KEY"] },
      timeoutMs: BINARY_TIMEOUT_MS,
    });

    const mimeType =
      response.headers.get("content-type") ?? "application/octet-stream";
    const { data } = await readBounded(response, maxBytes, `GET ${path} response`);
    return { data, mimeType };
  }

  /**
   * Upload a file as multipart/form-data (the documented encoding for
   * POST /files/{fileType}). fetch sets the Content-Type with its boundary, so
   * none is set here. The part name `file` is not in the published docs but
   * was verified against a live 7.3.70 console.
   */
  async postFile(
    path: string,
    data: Buffer,
    contentType: string,
    fileName: string
  ): Promise<unknown> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(data)], { type: contentType }), fileName);
    return explainTimeout("POST", path, BINARY_TIMEOUT_MS, async () => {
      const response = await this.send("POST", path, {
        headers: { "X-API-KEY": this.headers["X-API-KEY"] },
        body: form,
        timeoutMs: BINARY_TIMEOUT_MS,
      });
      return parseBody(response, "POST", path);
    });
  }

  connectWebSocket(path: string, options: { maxPayload?: number } = {}): WebSocket {
    if (this.usingConnector) {
      // Verified against a live console: the connector proxies REST calls but
      // answers 404 to a WebSocket upgrade on the same path. Say so plainly
      // rather than letting an opaque 404 reach the MCP client.
      throw new Error(
        "WebSocket subscriptions are not available over Cloud Connector; connect directly to the console host instead"
      );
    }
    const url = `wss://${this.baseUrl.replace(/^https?:\/\//, "")}${path}`;
    return new WebSocket(url, {
      headers: { "X-API-KEY": this.headers["X-API-KEY"] },
      ...this.tls,
      ...options,
    });
  }
}
