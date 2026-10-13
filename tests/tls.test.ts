import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { ProtectClient } from "../src/client.js";
import type { Config } from "../src/config.js";

/**
 * TLS against a real loopback HTTPS + WSS server with a console-style
 * self-signed certificate: issued to unifi.local, reached by IP. The
 * certificates are generated per run, so no private key lives in the repo.
 */

let dir: string;
let consoleCert: string;
let otherCert: string;
let server: Server;
let wss: WebSocketServer;
let host: string;

function selfSigned(name: string): { cert: string; key: string } {
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=unifi.local",
    "-keyout", join(dir, `${name}.key`), "-out", join(dir, `${name}.pem`),
  ], { stdio: "ignore" });
  return { cert: readFileSync(join(dir, `${name}.pem`), "utf8"), key: readFileSync(join(dir, `${name}.key`), "utf8") };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "protect-tls-"));
  const console = selfSigned("console");
  consoleCert = console.cert;
  otherCert = selfSigned("other").cert;
  server = createServer({ cert: console.cert, key: console.key }, (_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end('{"ok":true}');
  });
  wss = new WebSocketServer({ server });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  host = `127.0.0.1:${(server.address() as AddressInfo).port.toString()}`;
});

afterAll(async () => {
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  wss.close();
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

const client = (overrides: Partial<Config>) =>
  new ProtectClient({ host, apiKey: "k", verifySsl: true, readOnly: true, ...overrides });

/** Resolves "open" or the connection error's message. */
function wsOutcome(protect: ProtectClient): Promise<string> {
  const ws = protect.connectWebSocket("/subscribe/events");
  return new Promise((resolve) => {
    ws.on("open", () => { ws.terminate(); resolve("open"); });
    ws.on("error", (err) => { resolve(err.message); });
  });
}

describe("TLS for requests", () => {
  it("rejects a self-signed console by default", async () => {
    await expect(client({}).get("/meta/info")).rejects.toThrow("fetch failed");
  });

  it("names UNIFI_PROTECT_CA_CERT in the certificate error", async () => {
    await expect(client({}).get("/meta/info")).rejects.toThrow(/UNIFI_PROTECT_CA_CERT/);
  });

  it("accepts the console with verification off", async () => {
    await expect(client({ verifySsl: false }).get("/meta/info")).resolves.toEqual({ ok: true });
  });

  it("accepts the console's own pinned certificate, though its name does not match the IP", async () => {
    await expect(client({ caCert: consoleCert }).get("/meta/info")).resolves.toEqual({ ok: true });
  });

  it("rejects the console when a different certificate is pinned", async () => {
    await expect(client({ caCert: otherCert }).get("/meta/info")).rejects.toThrow("fetch failed");
  });

  it("leaves TLS verification for the rest of the process alone", () => {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    client({ verifySsl: false });
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
  });
});

describe("TLS for the subscription WebSocket", () => {
  it("rejects a self-signed console by default", async () => {
    expect(await wsOutcome(client({}))).toMatch(/self-signed|certificate/i);
  });

  it("connects with verification off", async () => {
    expect(await wsOutcome(client({ verifySsl: false }))).toBe("open");
  });

  it("connects to the console's own pinned certificate", async () => {
    expect(await wsOutcome(client({ caCert: consoleCert }))).toBe("open");
  });

  it("rejects the console when a different certificate is pinned", async () => {
    expect(await wsOutcome(client({ caCert: otherCert }))).not.toBe("open");
  });
});
