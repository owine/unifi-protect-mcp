import WebSocket from "ws";
import { Config } from "./config.js";

/** Protect answers JSON calls quickly; a longer wait means something is wrong. */
const REQUEST_TIMEOUT_MS = 25_000;
/** Snapshots and file uploads are larger, so they get a longer budget. */
const BINARY_TIMEOUT_MS = 60_000;
const MAX_JSON_BYTES = 10_000_000;
const MAX_BINARY_BYTES = 100_000_000;
/** Error text is forwarded to the MCP client, so keep it context-sized. */
const MAX_ERROR_BODY_CHARS = 2_000;

/**
 * Best-effort size guard. Protect sets content-length on the responses that
 * can actually get large (snapshots, exports); a chunked response without the
 * header is not caught here.
 */
function enforceSizeLimit(response: Response, limit: number): void {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new Error(
      `Response exceeds the ${limit.toString()}-byte limit (content-length ${declared.toString()})`
    );
  }
}

/**
 * Read an error body for inclusion in a thrown message. Error responses bypass
 * the caller's size check, so bound them here too: an oversized body is left
 * unread, and a merely long one is truncated before it reaches an MCP client's
 * context window.
 */
async function readErrorBody(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel();
    return `<error body exceeds the ${limit.toString()}-byte limit and was not read>`;
  }
  const text = await response.text();
  return text.length > MAX_ERROR_BODY_CHARS
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
async function fetchWithCause(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const cause = err instanceof Error ? err.cause : undefined;
    if (!(err instanceof Error) || !(cause instanceof Error)) throw err;
    const code = (cause as NodeJS.ErrnoException).code;
    const hint =
      code !== undefined && CERT_ERROR_CODES.has(code)
        ? ". The console's TLS certificate could not be verified; set UNIFI_PROTECT_VERIFY_SSL=false if it uses a self-signed certificate"
        : "";
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
  enforceSizeLimit(response, MAX_JSON_BYTES);

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (contentType.includes("application/json")) {
    if (text.trim() === "") {
      // A bare JSON.parse would report "Unexpected end of JSON input", which
      // reads as a broken tool rather than an unusable Protect response.
      throw new Error(
        `Protect returned an empty body for ${method} ${path} with a JSON content type`
      );
    }
    return JSON.parse(text);
  }
  return text;
}

export class ProtectClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private usingConnector: boolean;

  constructor(config: Config) {
    // Cloud Connector only exists behind api.ui.com. A console ID set against
    // a local console is ignored rather than fatal: every tool still works
    // against that console, and refusing to start helps nobody.
    const useConnector =
      config.consoleId !== undefined && config.host === "api.ui.com";
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
    this.headers = {
      "X-API-KEY": config.apiKey,
      "Content-Type": "application/json",
    };

    if (!config.verifySsl) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
  }

  /**
   * The one place a request is sent: every path builds its URL, applies
   * `redirect: "error"` (so X-API-KEY never follows a redirect) and its
   * timeout, and turns a non-2xx status into an error with a bounded body.
   */
  private async send(
    method: string,
    path: string,
    init: { body?: BodyInit; headers: Record<string, string>; timeoutMs: number; errorLimit: number }
  ): Promise<Response> {
    const response = await fetchWithCause(`${this.baseUrl}${path}`, {
      method,
      headers: init.headers,
      ...(init.body !== undefined ? { body: init.body } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(init.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${await readErrorBody(response, init.errorLimit)}`
      );
    }
    return response;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const response = await this.send(method, path, {
      headers: this.headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      timeoutMs: REQUEST_TIMEOUT_MS,
      errorLimit: MAX_JSON_BYTES,
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

  async getBinary(path: string): Promise<{ data: Buffer; mimeType: string }> {
    const response = await this.send("GET", path, {
      headers: { "X-API-KEY": this.headers["X-API-KEY"] },
      timeoutMs: BINARY_TIMEOUT_MS,
      errorLimit: MAX_BINARY_BYTES,
    });

    enforceSizeLimit(response, MAX_BINARY_BYTES);

    const mimeType =
      response.headers.get("content-type") ?? "application/octet-stream";
    const arrayBuffer = await response.arrayBuffer();
    return { data: Buffer.from(arrayBuffer), mimeType };
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
    const response = await this.send("POST", path, {
      headers: { "X-API-KEY": this.headers["X-API-KEY"] },
      body: form,
      timeoutMs: BINARY_TIMEOUT_MS,
      errorLimit: MAX_BINARY_BYTES,
    });
    return parseBody(response, "POST", path);
  }

  connectWebSocket(path: string): WebSocket {
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
      rejectUnauthorized:
        process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0",
    });
  }
}
