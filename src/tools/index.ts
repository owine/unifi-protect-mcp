import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProtectClient } from "../client.js";
import { instrumentTools } from "./registrar.js";
import { registerSystemTools } from "./system.js";
import { registerCameraTools } from "./cameras.js";
import { registerDeviceTools } from "./devices.js";
import { registerDeviceActionTools } from "./device-actions.js";
import { registerLiveviewTools } from "./liveviews.js";
import { registerFileTools } from "./files.js";
import { registerAlarmManagerTools } from "./alarm-manager.js";
import { registerSubscriptionTools } from "./subscriptions.js";
import { registerArmProfileTools } from "./arm-profiles.js";
import { registerUserTools } from "./users.js";
import { registerPosTools } from "./pos.js";

export function registerAllTools(
  server: McpServer,
  client: ProtectClient,
  readOnly: boolean
) {
  // Modules register through instrumentTools only; see registrar.ts.
  const tools = instrumentTools(server);
  registerSystemTools(tools, client);
  registerSubscriptionTools(tools, client);
  registerCameraTools(tools, client, readOnly);
  registerDeviceTools(tools, client, readOnly);
  registerDeviceActionTools(tools, client, readOnly);
  registerLiveviewTools(tools, client, readOnly);
  registerFileTools(tools, client, readOnly);
  registerAlarmManagerTools(tools, client, readOnly);
  registerArmProfileTools(tools, client, readOnly);
  registerUserTools(tools, client);
  registerPosTools(tools, client, readOnly);
}
