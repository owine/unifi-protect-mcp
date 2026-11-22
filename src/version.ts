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
 * Whether Protect version `version` is older than `than`, by semver
 * precedence: major.minor.patch compared numerically, then a prerelease
 * (`7.4.99-beta.2`) before its release, since it may lack endpoints the
 * release has. Build metadata (`+…`) is ignored, and two prereleases of one
 * release are not ranked. A version that does not start with major.minor.patch
 * is never called older, so an odd string never raises a false warning.
 */
export function isOlderVersion(version: string, than: string): boolean {
  const parse = (v: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(-[^+]*)?/.exec(v.trim());
    // The core is digits and dots, so a "-" in the match is the prerelease.
    return match ? { core: match.slice(1, 4).map(Number), prerelease: match[0].includes("-") } : undefined;
  };
  const a = parse(version);
  const b = parse(than);
  if (a === undefined || b === undefined) return false;
  for (let i = 0; i < a.core.length; i++) {
    if (a.core[i] !== b.core[i]) return (a.core[i] ?? 0) < (b.core[i] ?? 0);
  }
  return a.prerelease && !b.prerelease;
}
