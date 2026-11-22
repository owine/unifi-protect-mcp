import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isOlderVersion, SERVER_VERSION } from "../src/version.js";

describe("SERVER_VERSION", () => {
  it("matches the package.json version", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});

describe("isOlderVersion", () => {
  it.each([
    ["7.3.70", "7.4.99", true],
    ["6.9.200", "7.4.99", true],
    ["7.4.98", "7.4.99", true],
    // Numeric, not lexical: 7.10.0 is newer than 7.4.99.
    ["7.10.0", "7.4.99", false],
    ["7.4.99", "7.4.99", false],
    ["7.5.0", "7.4.99", false],
    ["8.0.0", "7.4.99", false],
    // Only the leading triple counts, so a build suffix changes nothing.
    ["7.4.99-beta.2", "7.4.99", false],
    ["7.3.70-rc.1", "7.4.99", true],
    // Unreadable versions never raise a warning.
    ["unknown", "7.4.99", false],
    ["7.4", "7.4.99", false],
    ["", "7.4.99", false],
  ])("%j older than %j: %s", (version, than, expected) => {
    expect(isOlderVersion(version, than)).toBe(expected);
  });
});
