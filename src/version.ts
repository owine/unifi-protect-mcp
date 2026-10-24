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
