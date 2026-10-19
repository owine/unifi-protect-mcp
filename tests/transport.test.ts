import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProtectClient } from "../src/client.js";

/**
 * Requests as the console receives them, through real undici against a
 * loopback HTTPS server. The handler tests mock fetch, so they see the body
 * the client built, never what undici put on the wire: undici's fetch sends a
 * FormData from another undici (such as Node's global one) as the text
 * "[object FormData]", which no mock notices.
 */

interface Received { contentType: string | undefined; body: Buffer }

let dir: string;
let server: Server;
let client: ProtectClient;
let received: Received | undefined;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "protect-transport-"));
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=unifi.local",
    "-keyout", join(dir, "console.key"), "-out", join(dir, "console.pem"),
  ], { stdio: "ignore" });
  const cert = readFileSync(join(dir, "console.pem"), "utf8");
  server = createServer({ cert, key: readFileSync(join(dir, "console.key"), "utf8") }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      received = { contentType: req.headers["content-type"], body: Buffer.concat(chunks) };
      res.setHeader("content-type", "application/json");
      res.end('{"name":"abc"}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const host = `127.0.0.1:${(server.address() as AddressInfo).port.toString()}`;
  client = new ProtectClient({ host, apiKey: "k", verifySsl: true, caCert: cert, readOnly: false });
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

describe("file upload on the wire", () => {
  it("arrives as multipart/form-data with the file under the 'file' part", async () => {
    await expect(
      client.postFile("/files/animations", Buffer.from("GIF89a-bytes"), "image/gif", "welcome.gif")
    ).resolves.toEqual({ name: "abc" });
    expect(received?.contentType).toMatch(/^multipart\/form-data; boundary=/);
    const body = received?.body.toString("utf8") ?? "";
    expect(body).toContain('Content-Disposition: form-data; name="file"; filename="welcome.gif"');
    expect(body).toContain("Content-Type: image/gif");
    expect(body).toContain("GIF89a-bytes");
  });
});
