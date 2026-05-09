import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { registerSystemTools } from "./system.js";
import { registerCameraTools } from "./cameras.js";
import { registerDeviceTools } from "./devices.js";
import { registerDeviceActionTools } from "./device-actions.js";
import { registerLiveviewTools } from "./liveviews.js";
import { registerFileTools } from "./files.js";
import { registerSubscriptionTools } from "./subscriptions.js";
import { registerArmProfileTools } from "./arm-profiles.js";
import { registerUserTools } from "./users.js";

export function registerAllTools(
  server: McpServer,
  client: ProtectClient,
  readOnly: boolean
) {
  registerSystemTools(server, client);
  registerSubscriptionTools(server, client);
  registerCameraTools(server, client, readOnly);
  registerDeviceTools(server, client, readOnly);
  registerDeviceActionTools(server, client, readOnly);
  registerLiveviewTools(server, client, readOnly);
  registerFileTools(server, client, readOnly);
  registerArmProfileTools(server, client, readOnly);
  registerUserTools(server, client);
}
