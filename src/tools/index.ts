import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { dryRunPreviewFields, looseOutput } from "../schemas/common.js";
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
  server = instrumentTools(server);
  registerSystemTools(server, client);
  registerSubscriptionTools(server, client);
  registerCameraTools(server, client, readOnly);
  registerDeviceTools(server, client, readOnly);
  registerDeviceActionTools(server, client, readOnly);
  registerLiveviewTools(server, client, readOnly);
  registerFileTools(server, client, readOnly);
  registerAlarmManagerTools(server, client, readOnly);
  registerArmProfileTools(server, client, readOnly);
  registerUserTools(server, client);
  registerPosTools(server, client, readOnly);
}

interface ToolConfig {
  inputSchema?: z.ZodRawShape;
  outputSchema?: z.ZodRawShape | z.ZodObject;
}

/**
 * A view of server that applies these rules to every tool it registers, so no
 * tool module can forget them:
 *
 * - The outputSchema is published as a loose object (see looseOutput): a raw
 *   shape would publish `additionalProperties: false`, and SDK clients would
 *   reject any field Protect adds.
 * - A write tool that takes `dryRun` also declares the preview fields in its
 *   outputSchema, so its dry-run result validates and is documented.
 */
function instrumentTools(server: McpServer): McpServer {
  const registerTool = (name: string, config: ToolConfig, handler: unknown) => {
    const { outputSchema, inputSchema } = config;
    const published = outputSchema === undefined
      ? {}
      : { outputSchema: looseOutput(withPreview(outputSchema, inputSchema)) };
    return server.registerTool(name, { ...config, ...published } as never, handler as never);
  };
  return new Proxy(server, {
    get: (target, prop, receiver) =>
      prop === "registerTool" ? registerTool : (Reflect.get(target, prop, receiver) as unknown),
  });
}

function withPreview(
  outputSchema: z.ZodRawShape | z.ZodObject,
  inputSchema: z.ZodRawShape | undefined
): z.ZodRawShape | z.ZodObject {
  if (inputSchema?.dryRun === undefined) return outputSchema;
  const shape = outputSchema instanceof z.ZodObject ? outputSchema.shape : outputSchema;
  return { ...dryRunPreviewFields, ...shape };
}
