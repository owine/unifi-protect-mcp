import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The published package version, reported to MCP clients during initialize.
 * Read at runtime from package.json, which reads 0.0.0-development in the
 * repo; the release workflow stamps the tag's version into it before packing,
 * so a published tarball reports its own version. Resolves to the package
 * root from both src/ and dist/.
 */
export const SERVER_VERSION = (
  JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as {
    version: string;
  }
).version;

/**
 * The UniFi Protect API version the tools follow. The README and CLAUDE.md
 * state it too; tests/docs-drift.test.ts keeps them equal to this.
 */
export const PROTECT_API_VERSION = "7.4.99";

/**
 * Whether Protect version `version` is older than `than`. Both are compared
 * by their leading major.minor.patch; a version that does not start with one
 * is never called older, so an odd string never raises a false warning.
 */
export function isOlderVersion(version: string, than: string): boolean {
  const parse = (v: string) => /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim())?.slice(1).map(Number);
  const a = parse(version);
  const b = parse(than);
  if (a === undefined || b === undefined) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}
