import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SERVER_VERSION } from "../src/version.js";

describe("SERVER_VERSION", () => {
  it("matches the package.json version", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});
