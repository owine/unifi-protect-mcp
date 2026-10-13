// Smoke-test an installed server binary over stdio:
// - it starts through its shebang and reports this package's version;
// - read-only mode serves only read-only tools, read-write mode adds writes;
// - an upload too large for one MCP message is refused with an error, and the
//   server is still there afterwards (its transport used to close, ending the
//   process).
// Only dry runs are called, so nothing contacts a console.
//
// Usage: node scripts/smoke-stdio.mjs <path to the unifi-protect-mcp binary>
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { STDIO_DEFAULT_MAX_BUFFER_SIZE } from "@modelcontextprotocol/sdk/shared/stdio.js";

const [bin] = process.argv.slice(2);
if (!bin) {
  console.error("usage: node scripts/smoke-stdio.mjs <server binary>");
  process.exit(2);
}
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
// The installed package's own limits, so this script states no numbers.
const limits = await import(pathToFileURL(join(dirname(realpathSync(bin)), "utils", "limits.js")).href);
// Larger than the SDK's default stdio buffer, so the request exercises the
// server's own read buffer, not just its input validation.
const oversizedChars = STDIO_DEFAULT_MAX_BUFFER_SIZE + 1;
if (oversizedChars <= limits.MAX_UPLOAD_BASE64_CHARS) throw new Error("oversized upload must exceed the upload ceiling");

async function connect(readOnly) {
  const client = new Client({ name: "smoke", version: "0.0.0" });
  await client.connect(new StdioClientTransport({
    command: bin,
    stderr: "inherit",
    env: {
      ...process.env,
      UNIFI_PROTECT_HOST: "127.0.0.1",
      UNIFI_PROTECT_API_KEY: "smoke-test",
      UNIFI_PROTECT_READ_ONLY: String(readOnly),
    },
  }));
  const served = client.getServerVersion()?.version;
  if (served !== version) throw new Error(`server reports version ${served}, package.json says ${version}`);
  return client;
}

const readOnlyClient = await connect(true);
const readOnlyTools = (await readOnlyClient.listTools()).tools;
await readOnlyClient.close();
if (readOnlyTools.length === 0 || readOnlyTools.some((tool) => tool.annotations?.readOnlyHint !== true)) {
  throw new Error("read-only mode must serve only read-only tools");
}

const client = await connect(false);
const allTools = (await client.listTools()).tools;
if (allTools.length <= readOnlyTools.length) {
  throw new Error("read-write mode must add write tools");
}
const oversized = await client.callTool({
  name: "protect_upload_file",
  arguments: { fileType: "animations", base64Data: "A".repeat(oversizedChars), dryRun: true },
});
if (!oversized.isError) throw new Error("an upload over the message limit must be refused");
// Still serving: the oversized request did not close the transport.
await client.listTools();
await client.close();

console.error(`smoke ok: ${version} serves ${readOnlyTools.length} read-only / ${allTools.length} tools over stdio, and refuses an oversized upload`);
