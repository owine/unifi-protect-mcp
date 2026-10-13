import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns config when all env vars are set", () => {
    process.env.UNIFI_PROTECT_HOST = "192.168.1.1";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    const config = loadConfig();
    expect(config).toEqual({
      host: "192.168.1.1",
      apiKey: "test-api-key",
      verifySsl: true,
      readOnly: true,
    });
  });

  it("parses verifySsl=false when env var is 'false'", () => {
    process.env.UNIFI_PROTECT_HOST = "192.168.1.1";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    process.env.UNIFI_PROTECT_VERIFY_SSL = "false";
    const config = loadConfig();
    expect(config.verifySsl).toBe(false);
  });

  it("defaults verifySsl to true when env var is absent", () => {
    process.env.UNIFI_PROTECT_HOST = "192.168.1.1";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    delete process.env.UNIFI_PROTECT_VERIFY_SSL;
    const config = loadConfig();
    expect(config.verifySsl).toBe(true);
  });

  it("defaults verifySsl to true for non-'false' values", () => {
    process.env.UNIFI_PROTECT_HOST = "192.168.1.1";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    process.env.UNIFI_PROTECT_VERIFY_SSL = "true";
    const config = loadConfig();
    expect(config.verifySsl).toBe(true);
  });

  it("parses readOnly=true when env var is 'true'", () => {
    process.env.UNIFI_PROTECT_HOST = "192.168.1.1";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    process.env.UNIFI_PROTECT_READ_ONLY = "true";
    const config = loadConfig();
    expect(config.readOnly).toBe(true);
  });

  it("defaults readOnly to true when env var is absent", () => {
    process.env.UNIFI_PROTECT_HOST = "192.168.1.1";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    delete process.env.UNIFI_PROTECT_READ_ONLY;
    const config = loadConfig();
    expect(config.readOnly).toBe(true);
  });

  it("parses readOnly=false when env var is 'false'", () => {
    process.env.UNIFI_PROTECT_HOST = "192.168.1.1";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    process.env.UNIFI_PROTECT_READ_ONLY = "false";
    const config = loadConfig();
    expect(config.readOnly).toBe(false);
  });

  it("calls process.exit(1) when UNIFI_PROTECT_HOST is missing", () => {
    delete process.env.UNIFI_PROTECT_HOST;
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    loadConfig();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("calls process.exit(1) when UNIFI_PROTECT_API_KEY is missing", () => {
    process.env.UNIFI_PROTECT_HOST = "192.168.1.1";
    delete process.env.UNIFI_PROTECT_API_KEY;
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    loadConfig();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
  it("strips a scheme and trailing slash from the host", () => {
    process.env.UNIFI_PROTECT_HOST = "https://192.168.1.1/";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    expect(loadConfig().host).toBe("192.168.1.1");
  });

  it("keeps a port on the host", () => {
    process.env.UNIFI_PROTECT_HOST = "nvr.local:7443";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    expect(loadConfig().host).toBe("nvr.local:7443");
  });

  it("calls process.exit(1) when the host includes a path", () => {
    process.env.UNIFI_PROTECT_HOST = "192.168.1.1/protect";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    loadConfig();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it.each(["nvr.local:notaport", "nvr.local:99999", "2001:db8::1", "admin@nvr.local"])(
    "calls process.exit(1) for the malformed host %j",
    (host) => {
      process.env.UNIFI_PROTECT_HOST = host;
      process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);
      loadConfig();
      expect(exitSpy).toHaveBeenCalledWith(1);
    }
  );

  it("accepts a bracketed IPv6 host with a port", () => {
    process.env.UNIFI_PROTECT_HOST = "[2001:db8::1]:7443";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    expect(loadConfig().host).toBe("[2001:db8::1]:7443");
  });

  it("drops the default https port so api.ui.com:443 still selects Cloud Connector", () => {
    process.env.UNIFI_PROTECT_HOST = "api.ui.com:443";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    expect(loadConfig().host).toBe("api.ui.com");
  });

  it.each(["FALSE", "0", "no", "off", " false "])(
    "parses verifySsl=false for %j",
    (value) => {
      process.env.UNIFI_PROTECT_HOST = "192.168.1.1";
      process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
      process.env.UNIFI_PROTECT_VERIFY_SSL = value;
      expect(loadConfig().verifySsl).toBe(false);
    }
  );

  it("parses readOnly=false for '0'", () => {
    process.env.UNIFI_PROTECT_HOST = "192.168.1.1";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    process.env.UNIFI_PROTECT_READ_ONLY = "0";
    expect(loadConfig().readOnly).toBe(false);
  });

  it("keeps readOnly on for an unrecognized value", () => {
    process.env.UNIFI_PROTECT_HOST = "192.168.1.1";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    process.env.UNIFI_PROTECT_READ_ONLY = "disabled";
    expect(loadConfig().readOnly).toBe(true);
  });

  it("accepts a Cloud Connector console ID", () => {
    process.env.UNIFI_PROTECT_HOST = "api.ui.com";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    process.env.UNIFI_PROTECT_CONSOLE_ID = "ABC123:DEF456";
    const config = loadConfig();
    expect(config.consoleId).toBe("ABC123:DEF456");
  });

  it("calls process.exit(1) when the console ID has invalid characters", () => {
    process.env.UNIFI_PROTECT_HOST = "api.ui.com";
    process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    process.env.UNIFI_PROTECT_CONSOLE_ID = "bad/../path";
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    loadConfig();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // A Site Manager key reaches every console on the account and crosses the
  // internet; it never goes out over unverified TLS.
  it.each(["api.ui.com", "https://API.UI.COM/", "api.ui.com.", "api.ui.com:8443"])(
    "calls process.exit(1) for Cloud Connector host %j with VERIFY_SSL=false",
    (host) => {
      process.env.UNIFI_PROTECT_HOST = host;
      process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
      process.env.UNIFI_PROTECT_VERIFY_SSL = "false";
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      loadConfig();
      expect(exitSpy).toHaveBeenCalledWith(1);
    }
  );

  // A key pasted with its trailing newline used to be sent as-is: fetch
  // rejects the header and the error, echoed into every tool result,
  // carried the whole key.
  it("trims whitespace around the API key", () => {
    process.env.UNIFI_PROTECT_HOST = "192.168.1.1";
    process.env.UNIFI_PROTECT_API_KEY = "  test-api-key\n";
    expect(loadConfig().apiKey).toBe("test-api-key");
  });

  it.each(["key\r\nX-Injected: 1", "key\u0000rest"])("calls process.exit(1) for an API key with control characters (%j)", (key) => {
    process.env.UNIFI_PROTECT_HOST = "192.168.1.1";
    process.env.UNIFI_PROTECT_API_KEY = key;
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((msg: string) => { errors.push(msg); });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    loadConfig();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errors.join(" ")).not.toContain("X-Injected");
  });

  describe("configuration error output", () => {
    function errorOutput(): string {
      const lines: string[] = [];
      vi.spyOn(console, "error").mockImplementation((msg: string) => { lines.push(msg); });
      vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      loadConfig();
      return lines.join("\n");
    }

    it("names the missing variable", () => {
      delete process.env.UNIFI_PROTECT_HOST;
      process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
      expect(errorOutput()).toMatch(/UNIFI_PROTECT_HOST/);
    });

    // The old trailer listed the two required variables after every error,
    // pointing at the wrong fix when the problem was elsewhere.
    it("does not blame the required variables for an unrelated error", () => {
      process.env.UNIFI_PROTECT_HOST = "api.ui.com";
      process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
      process.env.UNIFI_PROTECT_VERIFY_SSL = "false";
      const output = errorOutput();
      expect(output).toMatch(/api\.ui\.com/);
      expect(output).not.toMatch(/Required env vars/);
    });
  });

  describe("UNIFI_PROTECT_CA_CERT", () => {
    let dir: string;
    let certPath: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "protect-ca-"));
      certPath = join(dir, "console.pem");
      execFileSync("openssl", [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=unifi.local",
        "-keyout", join(dir, "console.key"), "-out", certPath,
      ], { stdio: "ignore" });
      process.env.UNIFI_PROTECT_HOST = "192.168.1.1";
      process.env.UNIFI_PROTECT_API_KEY = "test-api-key";
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    function expectExit() {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      loadConfig();
      expect(exitSpy).toHaveBeenCalledWith(1);
    }

    it("loads the certificate the variable names", () => {
      process.env.UNIFI_PROTECT_CA_CERT = certPath;
      expect(loadConfig().caCert).toBe(readFileSync(certPath, "utf8"));
    });

    it("calls process.exit(1) when the file cannot be read", () => {
      process.env.UNIFI_PROTECT_CA_CERT = join(dir, "missing.pem");
      expectExit();
    });

    it("calls process.exit(1) when the file holds no certificate", () => {
      const notACert = join(dir, "notes.txt");
      writeFileSync(notACert, "not a certificate");
      process.env.UNIFI_PROTECT_CA_CERT = notACert;
      expectExit();
    });

    // Node's `ca` option replaces the public roots, so a pin can only break the
    // connection to Ubiquiti's properly certified cloud.
    it("calls process.exit(1) when combined with the Cloud Connector host", () => {
      process.env.UNIFI_PROTECT_HOST = "api.ui.com";
      process.env.UNIFI_PROTECT_CA_CERT = certPath;
      expectExit();
    });

    it("calls process.exit(1) when combined with VERIFY_SSL=false", () => {
      process.env.UNIFI_PROTECT_CA_CERT = certPath;
      process.env.UNIFI_PROTECT_VERIFY_SSL = "false";
      expectExit();
    });
  });
});
