import https from "node:https";
import { Config } from "./config.js";

export class ProtectClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private agent: https.Agent;

  constructor(config: Config) {
    this.baseUrl = `https://${config.host}/proxy/protect/integration/v1`;
    this.headers = {
      "X-API-KEY": config.apiKey,
      "Content-Type": "application/json",
    };
    this.agent = new https.Agent({
      rejectUnauthorized: config.verifySsl,
    });
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
      // @ts-expect-error Node fetch supports agent via dispatcher
      dispatcher: this.agent,
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
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
      // @ts-expect-error Node fetch supports agent via dispatcher
      dispatcher: this.agent,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

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
      // @ts-expect-error Node fetch supports dispatcher for custom agents
      dispatcher: this.agent,
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
}
