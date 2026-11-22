#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { ProtectClient } from "./client.js";
import { registerAllTools } from "./tools/index.js";
import { isOlderVersion, PROTECT_API_VERSION, SERVER_VERSION } from "./version.js";
import { serverInstructions } from "./instructions.js";
import { SERVER_READ_BUFFER_BYTES } from "./utils/limits.js";

/** The most of the console's reported version that is logged. */
const MAX_VERSION_CHARS = 64;

/**
 * Exit with one line on stderr. On macOS a pipe is written asynchronously, so
 * exit only once the line is out: an MCP host shows it as the reason.
 */
function exitWithError(message: string): void {
  process.stderr.write(`${message}\n`, () => process.exit(1));
}

async function main() {
  const config = loadConfig();
  const client = new ProtectClient(config);

  // Before the transport connects: an MCP host only sees the stdio
  // handshake, so exiting now makes it report the server as failed, with
  // this line in its log, rather than connected with every call failing.
  // The version as reported, compared whole; protectVersion is its bounded,
  // printable copy for the log.
  let reportedVersion: string | undefined;
  let protectVersion: string | undefined;
  if (config.skipStartupCheck !== true) {
    try {
      // The console sends this string; keep it to one printable line in the
      // host's log.
      reportedVersion = await client.checkConnection();
      protectVersion = reportedVersion.replace(/[^\x20-\x7e]/g, "?").slice(0, MAX_VERSION_CHARS);
    } catch (err) {
      const reason = (err instanceof Error ? err.message : String(err)).replace(/\.$/, "");
      exitWithError(
        `Cannot connect to UniFi Protect at ${config.host}: ${reason}. ` +
        "Fix the setting the error names and restart, or set UNIFI_PROTECT_STARTUP_CHECK=false to start without this check."
      );
      return;
    }
  }

  const server = new McpServer(
    { name: "unifi-protect", title: "UniFi Protect", version: SERVER_VERSION },
    { instructions: serverInstructions(config.readOnly) }
  );

  registerAllTools(server, client, config.readOnly);

  // A larger read buffer than the SDK default: an oversized request (a big
  // upload) then reaches input validation and is refused, instead of closing
  // the transport, which ends this process.
  const transport = new StdioServerTransport(undefined, undefined, {
    maxBufferSize: SERVER_READ_BUFFER_BYTES,
  });
  await server.connect(transport);
  // UNIFI_PROTECT_READ_ONLY accepts several spellings, so say which mode won,
  // and name the console's version: the first thing to compare when a tool
  // fails with HTTP 404.
  const consoleNote = protectVersion === undefined ? "" : `, console on Protect ${protectVersion}`;
  console.error(
    config.readOnly
      ? `UniFi Protect MCP server running on stdio${consoleNote} (read-only: write tools are not registered)`
      : `UniFi Protect MCP server running on stdio${consoleNote} (read-write: write tools are registered)`
  );
  if (reportedVersion !== undefined && isOlderVersion(reportedVersion, PROTECT_API_VERSION)) {
    console.error(
      `Protect ${protectVersion} is older than ${PROTECT_API_VERSION}, the API version these tools follow; a tool for a newer endpoint may fail with HTTP 404. Update Protect on the console to use every tool.`
    );
  }
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
