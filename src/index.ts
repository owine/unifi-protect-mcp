#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { ProtectClient } from "./client.js";
import { registerAllTools } from "./tools/index.js";
import { SERVER_VERSION } from "./version.js";
import { SERVER_READ_BUFFER_BYTES } from "./utils/limits.js";

async function main() {
  const config = loadConfig();
  const client = new ProtectClient(config);

  const server = new McpServer({
    name: "unifi-protect",
    version: SERVER_VERSION,
  });

  registerAllTools(server, client, config.readOnly);

  // A larger read buffer than the SDK default: an oversized request (a big
  // upload) then reaches input validation and is refused, instead of closing
  // the transport, which ends this process.
  const transport = new StdioServerTransport(undefined, undefined, {
    maxBufferSize: SERVER_READ_BUFFER_BYTES,
  });
  await server.connect(transport);
  console.error("UniFi Protect MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
