import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Startup as an MCP host sees it. A host only learns whether a server works
 * from the stdio handshake, so a console that cannot be used must stop the
 * process before the transport connects; otherwise the server is listed as
 * connected and every tool call fails.
 */

const ENV_KEYS = ["UNIFI_PROTECT_HOST", "UNIFI_PROTECT_API_KEY", "UNIFI_PROTECT_READ_ONLY", "UNIFI_PROTECT_STARTUP_CHECK"] as const;

describe("startup", () => {
  let saved: Partial<Record<string, string>>;
  let connect: MockInstance;
  let checkConnection: MockInstance;
  let exit: MockInstance;
  let stderr: string[];

  beforeEach(async () => {
    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    process.env.UNIFI_PROTECT_HOST = "192.0.2.1";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    delete process.env.UNIFI_PROTECT_READ_ONLY;
    delete process.env.UNIFI_PROTECT_STARTUP_CHECK;
    stderr = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { stderr.push(args.join(" ")); });
    // The failure line is written straight to stderr, exiting once it is out.
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown, done?: unknown) => {
      stderr.push(String(chunk));
      if (typeof done === "function") (done as () => void)();
      return true;
    });
    exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    connect = vi.spyOn(McpServer.prototype, "connect").mockResolvedValue(undefined);
    vi.resetModules();
    // Spied on the module instance index.js is about to import, after the reset.
    const { ProtectClient } = await import("../src/client.js");
    checkConnection = vi.spyOn(ProtectClient.prototype, "checkConnection").mockResolvedValue(undefined);
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = saved[key];
    }
    vi.restoreAllMocks();
  });

  async function start() {
    await import("../src/index.js");
    await vi.waitFor(() => { expect(connect.mock.calls.length + exit.mock.calls.length).toBeGreaterThan(0); });
  }

  it("checks the console before the transport connects", async () => {
    await start();
    expect(checkConnection).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledOnce();
    expect(checkConnection.mock.invocationCallOrder[0]).toBeLessThan(connect.mock.invocationCallOrder[0] ?? 0);
    expect(exit).not.toHaveBeenCalled();
  });

  it("exits with the reason, never connecting, when the console cannot be used", async () => {
    checkConnection.mockRejectedValue(new Error(
      "fetch failed: self-signed certificate. The console's TLS certificate could not be verified; save the certificate and point UNIFI_PROTECT_CA_CERT at it."
    ));
    await start();
    expect(exit).toHaveBeenCalledWith(1);
    expect(connect).not.toHaveBeenCalled();
    const line = stderr.find((text) => text.startsWith("Cannot connect"));
    expect(line).toContain("Cannot connect to UniFi Protect at 192.0.2.1: fetch failed: self-signed certificate.");
    expect(line).toContain("UNIFI_PROTECT_CA_CERT");
    expect(line).toContain("UNIFI_PROTECT_STARTUP_CHECK=false");
    // One sentence break, not the error's own full stop doubled.
    expect(line).not.toContain("..");
    expect(line?.endsWith("\n")).toBe(true);
  });

  it("skips the check when UNIFI_PROTECT_STARTUP_CHECK is false", async () => {
    process.env.UNIFI_PROTECT_STARTUP_CHECK = "false";
    await start();
    expect(checkConnection).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledOnce();
  });
});
