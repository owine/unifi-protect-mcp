#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { ProtectClient } from "./client.js";
import { registerAllTools } from "./tools/index.js";
import { SERVER_VERSION } from "./version.js";

async function main() {
  const config = loadConfig();
  const client = new ProtectClient(config);

  const server = new McpServer({
    name: "unifi-protect",
    version: SERVER_VERSION,
  });

  registerAllTools(server, client, config.readOnly);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("UniFi Protect MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
