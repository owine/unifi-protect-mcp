import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { registerSystemTools } from "./system.js";
import { registerCameraTools } from "./cameras.js";
import { registerDeviceTools } from "./devices.js";
import { registerLiveviewTools } from "./liveviews.js";
import { registerFileTools } from "./files.js";

export function registerAllTools(server: McpServer, client: ProtectClient) {
  registerSystemTools(server, client);
  registerCameraTools(server, client);
  registerDeviceTools(server, client);
  registerLiveviewTools(server, client);
  registerFileTools(server, client);
}
