import { AsyncLocalStorage } from "node:async_hooks";
import WebSocket from "ws";
// undici's own fetch and FormData, not the globals: Node's built-in fetch
// bundles an older undici whose handlers the Agent from tls.ts (undici 8)
// rejects, and undici's fetch sends a global FormData as "[object FormData]".
import { fetch, FormData, type BodyInit, type Dispatcher, type RequestInit, type Response } from "undici";
import { Config, isCloudConnectorHost } from "./config.js";
import { consoleDispatcher, consoleTlsOptions } from "./tls.js";
import { SERVER_VERSION } from "./version.js";
import {
  BINARY_TIMEOUT_MS,
  DEFAULT_RETRY_AFTER_MS,
  MAX_ERROR_BODY_BYTES,
  MAX_RATE_LIMIT_RETRIES,
  MAX_RESPONSE_BYTES,
  MAX_RETRY_AFTER_MS,
  MAX_SNAPSHOT_BYTES,
  REQUEST_TIMEOUT_MS,
  STARTUP_CHECK_TIMEOUT_MS,
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

const FORBIDDEN = 403;
const REQUEST_TIMEOUT = 408;
const TOO_MANY_REQUESTS = 429;
const BAD_GATEWAY = 502;
const GATEWAY_TIMEOUT = 504;

/**
 * The wait a 429's Retry-After asks for, in ms: delay-seconds or an HTTP
 * date. Absent or unreadable, the console's limit window.
 */
export function retryAfterMs(header: string | null, now: number = Date.now()): number {
  const value = header?.trim() ?? "";
  // RFC 9110 delay-seconds is a whole number; a fraction ("5.37", as Cloud
  // Connector's 429 body words its wait) is read too, rounded up, so neither
  // the cap check nor the wait comes in under what was asked.
  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.ceil(Number(value) * MS_PER_SECOND);
  // An HTTP date always names its day and month; Date.parse alone would read
  // "-5" as the year 5 BC.
  const date = /[A-Za-z]/.test(value) ? Date.parse(value) : NaN;
  return Number.isNaN(date) ? DEFAULT_RETRY_AFTER_MS : Math.max(0, date - now);
}

/**
 * The note on a 429 the client gives up on: how many retries it made, and how
 * long the last Retry-After asked to wait, so the model waits that long
 * instead of calling again at once. A wait too large to be a number (a
 * digit-only header past Number's range) has no useful figure to repeat.
 */
function rateLimitNote(retries: number, delay: number): string {
  const state = retries > 0
    ? `still rate-limited after ${retries.toString()} ${retries === 1 ? "retry" : "retries"}`
    : "rate-limited";
  const seconds = Math.ceil(delay / MS_PER_SECOND);
  const advice = Number.isFinite(seconds) ? `wait ${seconds.toString()} s before calling again` : "wait before calling again";
  return ` (${state}; ${advice})`;
}

/**
 * Wait ms, unless signal aborts first: then reject with its reason, as fetch
 * does, so a timeout during the wait still reads as the request's timeout.
 */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason as Error);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason as Error);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
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
  // undici types the body as an untyped stream; a fetch body is always bytes.
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
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

/**
 * The reason an error carries, for a message the model reads. A connection
 * that tried several addresses (a name with both IPv4 and IPv6 records) fails
 * with an AggregateError whose own message is empty; its reasons are in
 * `errors`, and its code in `code`.
 */
export function errorReason(err: Error): string {
  if (err.message !== "") return err.message;
  if (err instanceof AggregateError) {
    const reasons = new Set(
      (err.errors as unknown[]).map((inner) => (inner instanceof Error ? errorReason(inner) : String(inner)))
    );
    reasons.delete("");
    if (reasons.size > 0) return [...reasons].join("; ");
  }
  return (err as NodeJS.ErrnoException).code ?? err.name;
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
async function fetchWithCause(url: string, init: RequestInit): Promise<Response> {
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
    throw new Error(`${err.message}: ${errorReason(cause)}${hint}`, { cause: err });
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
  const { data } = await readBounded(response, MAX_RESPONSE_BYTES, `${method} ${path} response`);
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
  private dispatcher: Dispatcher;
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
      // undici's fetch would otherwise announce itself as "undici".
      "User-Agent": `unifi-protect-mcp/${SERVER_VERSION}`,
    };

    this.tls = consoleTlsOptions(config);
    this.dispatcher = consoleDispatcher(config);
  }

  /** Every header but Content-Type, for a request whose body sets its own. */
  private authHeaders(): Record<string, string> {
    return Object.fromEntries(Object.entries(this.headers).filter(([name]) => name !== "Content-Type"));
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
   *
   * A rate-limited request (429) is sent again after its Retry-After, a few
   * times. The timeout covers the retries and their waits, so they never
   * stretch a call past its budget. Bodies here are strings or FormData, which
   * fetch can send again.
   */
  private async send(
    method: string,
    path: string,
    init: { body?: BodyInit; headers: Record<string, string>; timeoutMs: number }
  ): Promise<Response> {
    const url = this.resolve(path);
    const signal = requestSignal(init.timeoutMs);
    for (let retries = 0; ; retries++) {
      const response = await fetchWithCause(url, {
        method,
        headers: init.headers,
        ...(init.body !== undefined ? { body: init.body } : {}),
        redirect: "error",
        signal,
        dispatcher: this.dispatcher,
      });
      if (response.ok) return response;
      if (response.status === TOO_MANY_REQUESTS && retries < MAX_RATE_LIMIT_RETRIES) {
        const delay = retryAfterMs(response.headers.get("retry-after"));
        if (delay <= MAX_RETRY_AFTER_MS) {
          await response.body?.cancel();
          await wait(delay, signal);
          continue;
        }
        // A wait longer than this server holds a call for is a real throttle
        // (Cloud Connector limits each console per minute).
        throw new Error(`HTTP ${response.status.toString()}: ${await readErrorBody(response)}${rateLimitNote(retries, delay)}`);
      }
      const retried = response.status === TOO_MANY_REQUESTS && retries > 0
        ? rateLimitNote(retries, retryAfterMs(response.headers.get("retry-after")))
        : "";
      throw new Error(`HTTP ${response.status.toString()}: ${await readErrorBody(response)}${retried}${this.statusNote(method, response.status)}`);
    }
  }

  /**
   * What a failure status means when the body alone would not say. A 408 or
   * 504 is a timeout on the way to Protect (Cloud Connector answers 408 once a
   * console takes too long), so a write may have landed, exactly as when this
   * server's own timeout fires. Cloud Connector's 403 and 502 are about the
   * route to the console, not the request.
   */
  private statusNote(method: string, status: number): string {
    if (status === REQUEST_TIMEOUT || status === GATEWAY_TIMEOUT) {
      return method === "GET"
        ? " (the request timed out before Protect answered; retry when the console responds)"
        : " (the request timed out before Protect answered; the change may still have been applied, so check before retrying)";
    }
    if (!this.usingConnector) return "";
    if (status === FORBIDDEN) {
      return " (through Cloud Connector this can also mean the key cannot reach this console: a personal Site Manager key reaches only the consoles its owner owns)";
    }
    if (status === BAD_GATEWAY) {
      return " (Cloud Connector could not reach the console; check that it is online)";
    }
    return "";
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<unknown> {
    return explainTimeout(method, path, timeoutMs, () => this.sendJson(method, path, body, timeoutMs));
  }

  private async sendJson(method: string, path: string, body: unknown, timeoutMs: number): Promise<unknown> {
    const response = await this.send(method, path, {
      headers: this.headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      timeoutMs,
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

  /**
   * Read /meta/info once, so a console that cannot be reached, fails TLS
   * verification or rejects the key stops the server at startup, where the
   * MCP host reports it, instead of the server looking connected and every
   * tool call failing.
   */
  async checkConnection(): Promise<void> {
    const path = "/meta/info";
    const info = await this.request("GET", path, undefined, STARTUP_CHECK_TIMEOUT_MS);
    // Any 2xx passes send(), so a proxy or another web server at the host
    // (an HTML page, or JSON such as {} or {"status":"ok"}) would pass too.
    // applicationVersion is the one field this endpoint exists to return.
    if (
      typeof info !== "object" || info === null ||
      !("applicationVersion" in info) || typeof info.applicationVersion !== "string"
    ) {
      throw new Error(`GET ${path} did not answer as UniFi Protect (expected its application info); check UNIFI_PROTECT_HOST names the console`);
    }
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
      headers: this.authHeaders(),
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
        headers: this.authHeaders(),
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
      headers: this.authHeaders(),
      ...this.tls,
      ...options,
    });
  }
}
