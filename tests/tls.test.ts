import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createSecureServer } from "node:http2";
import { createServer, type Server } from "node:https";
import { connect as netConnect, type AddressInfo } from "node:net";
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

describe("TLS with a pinned CA", () => {
  let caServer: Server;
  let caCert: string;
  let wrongNameHost: string;
  let rightNameHost: string;

  /** A leaf certificate signed by the test CA, optionally valid for 127.0.0.1. */
  function issued(name: string, ipSan: boolean): { cert: string; key: string } {
    const ext = join(dir, `${name}.ext`);
    execFileSync("sh", ["-c", `printf '${ipSan ? "subjectAltName=IP:127.0.0.1" : "subjectAltName=DNS:unifi.local"}\n' > ${ext}`]);
    execFileSync("openssl", ["req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=unifi.local",
      "-keyout", join(dir, `${name}.key`), "-out", join(dir, `${name}.csr`)], { stdio: "ignore" });
    execFileSync("openssl", ["x509", "-req", "-in", join(dir, `${name}.csr`), "-CA", join(dir, "ca.pem"),
      "-CAkey", join(dir, "ca.key"), "-CAcreateserial", "-days", "1", "-extfile", ext,
      "-out", join(dir, `${name}.pem`)], { stdio: "ignore" });
    return { cert: readFileSync(join(dir, `${name}.pem`), "utf8"), key: readFileSync(join(dir, `${name}.key`), "utf8") };
  }

  async function serve(leaf: { cert: string; key: string }): Promise<{ server: Server; host: string }> {
    const server = createServer({ cert: leaf.cert, key: leaf.key }, (_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end('{"ok":true}');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { server, host: `127.0.0.1:${(server.address() as AddressInfo).port.toString()}` };
  }

  let rightServer: Server;
  let wrongNameLeaf: string;

  beforeAll(async () => {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=Protect test CA",
      "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign",
      "-keyout", join(dir, "ca.key"), "-out", join(dir, "ca.pem")], { stdio: "ignore" });
    caCert = readFileSync(join(dir, "ca.pem"), "utf8");
    const wrongLeaf = issued("wrong-name", false);
    wrongNameLeaf = wrongLeaf.cert;
    const wrong = await serve(wrongLeaf);
    caServer = wrong.server;
    wrongNameHost = wrong.host;
    const right = await serve(issued("right-name", true));
    rightServer = right.server;
    rightNameHost = right.host;
  });

  afterAll(async () => {
    await new Promise((resolve) => caServer.close(resolve));
    await new Promise((resolve) => rightServer.close(resolve));
  });

  // Only an exactly pinned certificate skips the hostname check; one merely
  // issued by a pinned CA must still match the host it was reached at.
  it("rejects a certificate issued by the pinned CA for another name", async () => {
    const protect = new ProtectClient({ host: wrongNameHost, apiKey: "k", verifySsl: true, readOnly: true, caCert });
    await expect(protect.get("/meta/info")).rejects.toThrow("fetch failed");
  });

  // A console with a certificate from the owner's own CA, reached by IP: the
  // README's openssl command saves only the leaf, and pinning it must work
  // without the CA. `ca` replaces the public roots, so this needs the chain
  // to be allowed to end at the pinned leaf.
  it("accepts a CA-issued certificate pinned on its own, though its name does not match the IP", async () => {
    const protect = new ProtectClient({ host: wrongNameHost, apiKey: "k", verifySsl: true, readOnly: true, caCert: wrongNameLeaf });
    await expect(protect.get("/meta/info")).resolves.toEqual({ ok: true });
  });

  it("accepts a certificate issued by the pinned CA for the host reached", async () => {
    const protect = new ProtectClient({ host: rightNameHost, apiKey: "k", verifySsl: true, readOnly: true, caCert });
    await expect(protect.get("/meta/info")).resolves.toEqual({ ok: true });
  });
});

describe("TLS settings stay with the client", () => {
  // A client with verification off must not loosen TLS for the rest of the
  // process, e.g. through a global dispatcher.
  it("leaves other requests verifying certificates", async () => {
    await client({ verifySsl: false }).get("/meta/info");
    await expect(fetch(`https://${host}/meta/info`)).rejects.toThrow("fetch failed");
  });
});

describe("HTTP version", () => {
  // undici offers HTTP/2 by default; Node's built-in fetch, which 2.x used,
  // spoke only HTTP/1.1. A console that offers h2 must still get HTTP/1.1.
  it("speaks HTTP/1.1 to a server that also offers HTTP/2", async () => {
    const { cert, key } = selfSigned("h2");
    const h2 = createSecureServer({ cert, key, allowHTTP1: true }, (req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ httpVersion: req.httpVersion }));
    });
    await new Promise<void>((resolve) => h2.listen(0, "127.0.0.1", resolve));
    const h2Host = `127.0.0.1:${(h2.address() as AddressInfo).port.toString()}`;
    try {
      const protect = new ProtectClient({ host: h2Host, apiKey: "k", verifySsl: false, readOnly: true });
      await expect(protect.get("/meta/info")).resolves.toEqual({ httpVersion: "1.1" });
    } finally {
      await new Promise((resolve) => h2.close(resolve));
    }
  });
});

describe("HTTP proxy", () => {
  // Node's built-in fetch uses HTTPS_PROXY only when NODE_USE_ENV_PROXY=1
  // (or --use-env-proxy) is set; the client must do the same, no more.
  const PROXY_ENV = ["NODE_USE_ENV_PROXY", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy"];
  let saved: Record<string, string | undefined>;
  let proxy: ReturnType<typeof createHttpServer>;
  let tunnelled: string[];

  beforeAll(async () => {
    tunnelled = [];
    // A CONNECT proxy: records the target and splices the two sockets.
    proxy = createHttpServer();
    proxy.on("connect", (req: { url?: string }, socket: NodeJS.ReadWriteStream & { end(): void; write(s: string): void }, head: Buffer) => {
      tunnelled.push(req.url ?? "");
      const [targetHost, targetPort] = (req.url ?? "").split(":");
      const upstream = netConnect(Number(targetPort), targetHost, () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        upstream.write(head);
        upstream.pipe(socket as never);
        socket.pipe(upstream);
      });
      upstream.on("error", () => { socket.end(); });
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  });

  afterAll(async () => {
    await new Promise((resolve) => proxy.close(resolve));
  });

  function withEnv(env: Record<string, string>, fn: () => Promise<void>): Promise<void> {
    saved = Object.fromEntries(PROXY_ENV.map((name) => [name, process.env[name]]));
    for (const name of PROXY_ENV) Reflect.deleteProperty(process.env, name);
    Object.assign(process.env, env);
    return fn().finally(() => {
      for (const name of PROXY_ENV) {
        const value = saved[name];
        if (value === undefined) Reflect.deleteProperty(process.env, name);
        else process.env[name] = value;
      }
    });
  }

  const proxyUrl = () => `http://127.0.0.1:${(proxy.address() as AddressInfo).port.toString()}`;

  it("goes through HTTPS_PROXY when NODE_USE_ENV_PROXY=1", async () => {
    tunnelled = [];
    await withEnv({ NODE_USE_ENV_PROXY: "1", HTTPS_PROXY: proxyUrl() }, async () => {
      await expect(client({ verifySsl: false }).get("/meta/info")).resolves.toEqual({ ok: true });
    });
    expect(tunnelled).toEqual([host]);
  });

  it("ignores HTTPS_PROXY without NODE_USE_ENV_PROXY", async () => {
    tunnelled = [];
    await withEnv({ HTTPS_PROXY: proxyUrl() }, async () => {
      await expect(client({ verifySsl: false }).get("/meta/info")).resolves.toEqual({ ok: true });
    });
    expect(tunnelled).toEqual([]);
  });

  it("keeps the pinned certificate through the proxy", async () => {
    tunnelled = [];
    await withEnv({ NODE_USE_ENV_PROXY: "1", HTTPS_PROXY: proxyUrl() }, async () => {
      await expect(client({ caCert: consoleCert }).get("/meta/info")).resolves.toEqual({ ok: true });
      await expect(client({ caCert: otherCert }).get("/meta/info")).rejects.toThrow("fetch failed");
    });
    expect(tunnelled.length).toBe(2);
  });
});
