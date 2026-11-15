// Smoke-test an installed server binary over stdio:
// - it starts through its shebang, reports this package's version and sends
//   instructions;
// - read-only mode serves only read-only tools, read-write mode adds writes;
// - an upload too large for one MCP message is refused with an error, and the
//   server is still there afterwards (its transport used to close, ending the
//   process);
// - it refuses to start when the console cannot be used, so an MCP host lists
//   it as failed rather than connected.
// The serving runs skip the startup check and call only dry runs, and the
// failing run points at a local listener, so nothing contacts a console.
//
// Usage: node scripts/smoke-stdio.mjs <path to the unifi-protect-mcp binary>
import { realpathSync } from "node:fs";
import { createServer } from "node:net";
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
      UNIFI_PROTECT_STARTUP_CHECK: "false",
    },
  }));
  const served = client.getServerVersion()?.version;
  if (served !== version) throw new Error(`server reports version ${served}, package.json says ${version}`);
  if (!client.getInstructions()) throw new Error("server sent no instructions");
  return client;
}

// A local listener that drops every connection stands in for a console that
// cannot be used: the startup check fails, and the server must exit with its
// reason rather than complete the MCP handshake.
async function expectStartupFailure() {
  const dropper = createServer((socket) => socket.destroy());
  await new Promise((resolve) => dropper.listen(0, "127.0.0.1", resolve));
  const client = new Client({ name: "smoke", version: "0.0.0" });
  const failing = new StdioClientTransport({
    command: bin,
    stderr: "pipe",
    env: {
      ...process.env,
      UNIFI_PROTECT_HOST: `127.0.0.1:${dropper.address().port}`,
      UNIFI_PROTECT_API_KEY: "smoke-test",
    },
  });
  let log = "";
  failing.stderr?.on("data", (chunk) => { log += chunk; });
  try {
    await client.connect(failing);
  } catch {
    if (!log.includes("Cannot connect to UniFi Protect")) {
      throw new Error(`server exited without the connection error; stderr was: ${log}`);
    }
    return;
  } finally {
    await client.close();
    dropper.close();
  }
  throw new Error("server completed the MCP handshake although the console cannot be used");
}

await expectStartupFailure();

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

console.error(`smoke ok: ${version} refuses to start without a console, serves ${readOnlyTools.length} read-only / ${allTools.length} tools over stdio, and refuses an oversized upload`);
