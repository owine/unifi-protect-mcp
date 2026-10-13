import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The published package version, reported to MCP clients during initialize.
 * Read at runtime so release-please's package.json bump is the only edit a
 * release needs. Resolves to the package root from both src/ and dist/.
 */
export const SERVER_VERSION = (
  JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as {
    version: string;
  }
).version;
