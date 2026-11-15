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
  let written: { message: string; done: (() => void) | undefined }[];

  beforeEach(async () => {
    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    process.env.UNIFI_PROTECT_HOST = "192.0.2.1";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    delete process.env.UNIFI_PROTECT_READ_ONLY;
    // An opt-out inherited from the shell would skip the check under test.
    delete process.env.UNIFI_PROTECT_STARTUP_CHECK;
    written = [];
    vi.spyOn(console, "error").mockImplementation(vi.fn());
    // Held, not completed: a test drains a write by calling its done().
    vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string, done?: () => void) => {
      written.push({ message: chunk, done });
      return true;
    }) as typeof process.stderr.write);
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
    await vi.waitFor(() => { expect(connect.mock.calls.length + written.length).toBeGreaterThan(0); });
  }

  it("checks the console before the transport connects", async () => {
    await start();
    expect(checkConnection).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledOnce();
    expect(checkConnection.mock.invocationCallOrder[0]).toBeLessThan(connect.mock.invocationCallOrder[0] ?? 0);
    expect(exit).not.toHaveBeenCalled();
  });

  it("exits with the reason once it is written, never connecting, when the console cannot be used", async () => {
    checkConnection.mockRejectedValue(new Error(
      "fetch failed: self-signed certificate. The console's TLS certificate could not be verified; save the certificate and point UNIFI_PROTECT_CA_CERT at it."
    ));
    await start();
    expect(written).toHaveLength(1);
    const [{ message, done }] = written as [{ message: string; done: (() => void) | undefined }];
    expect(message).toContain("Cannot connect to UniFi Protect at 192.0.2.1: fetch failed: self-signed certificate.");
    expect(message).toContain("UNIFI_PROTECT_CA_CERT");
    expect(message).toContain("UNIFI_PROTECT_STARTUP_CHECK=false");
    // One sentence break, not the error's own full stop doubled.
    expect(message).not.toContain("..");
    expect(message.endsWith("\n")).toBe(true);
    // Not before the line has drained: on macOS a pipe is written
    // asynchronously, and exiting first could drop the host's only reason.
    expect(exit).not.toHaveBeenCalled();
    done?.();
    expect(exit).toHaveBeenCalledWith(1);
    expect(connect).not.toHaveBeenCalled();
  });

  it("skips the check when UNIFI_PROTECT_STARTUP_CHECK is false", async () => {
    process.env.UNIFI_PROTECT_STARTUP_CHECK = "false";
    await start();
    expect(checkConnection).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledOnce();
  });
});
