import WebSocket from "ws";
import { Config } from "./config.js";

/** Protect answers JSON calls quickly; a longer wait means something is wrong. */
const REQUEST_TIMEOUT_MS = 25_000;
/** Snapshots and file uploads are larger, so they get a longer budget. */
const BINARY_TIMEOUT_MS = 60_000;
const MAX_JSON_BYTES = 10_000_000;
const MAX_BINARY_BYTES = 100_000_000;

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

export class ProtectClient {
  private baseUrl: string;
  private headers: Record<string, string>;

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
    this.baseUrl = `https://${config.host}${consolePath}/proxy/protect/integration/v1`;
    this.headers = {
      "X-API-KEY": config.apiKey,
      "Content-Type": "application/json",
    };

    if (!config.verifySsl) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
  }

  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: this.headers,
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    options.redirect = "error";
    options.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

    const response = await fetch(url, options);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

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
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "X-API-KEY": this.headers["X-API-KEY"] },
      redirect: "error",
      signal: AbortSignal.timeout(BINARY_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    enforceSizeLimit(response, MAX_BINARY_BYTES);

    const mimeType =
      response.headers.get("content-type") ?? "application/octet-stream";
    const arrayBuffer = await response.arrayBuffer();
    return { data: Buffer.from(arrayBuffer), mimeType };
  }

  async postBinary(
    path: string,
    data: Buffer,
    contentType: string
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-KEY": this.headers["X-API-KEY"],
        "Content-Type": contentType,
      },
      body: new Uint8Array(data),
      redirect: "error",
      signal: AbortSignal.timeout(BINARY_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const ct = response.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  connectWebSocket(path: string): WebSocket {
    const url = `wss://${this.baseUrl.replace(/^https?:\/\//, "")}${path}`;
    return new WebSocket(url, {
      headers: { "X-API-KEY": this.headers["X-API-KEY"] },
      rejectUnauthorized:
        process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0",
    });
  }
}
