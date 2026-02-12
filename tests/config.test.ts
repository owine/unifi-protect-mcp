import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
});
