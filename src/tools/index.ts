import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient, withCallSignal } from "../client.js";
import { dryRunPreviewFields, looseOutput } from "../schemas/common.js";
import { formatError } from "../utils/responses.js";
import { MAX_RESULT_BYTES } from "../utils/limits.js";
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
  title?: string;
  inputSchema?: z.ZodRawShape;
  outputSchema?: z.ZodRawShape | z.ZodObject;
  annotations?: Record<string, unknown>;
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
 * - Handlers run with their call's abort signal in scope, so ProtectClient
 *   aborts the Protect request (and subscriptions close their WebSocket) when
 *   the MCP client cancels the call.
 * - A result too large for one stdio message becomes an error, instead of a
 *   message the client cannot read (which ends its session).
 * - Each tool gets a human-readable title derived from its name, and
 *   `openWorldHint: false`: every tool talks to one known console, not to an
 *   open set of external systems.
 */
function instrumentTools(server: McpServer): McpServer {
  const registerTool = (name: string, config: ToolConfig, handler: unknown) => {
    const { outputSchema, inputSchema } = config;
    const published = outputSchema === undefined
      ? {}
      : { outputSchema: looseOutput(withPreview(outputSchema, inputSchema)) };
    const bound = async (...args: unknown[]): Promise<unknown> => {
      // The SDK passes the call's `extra` (with its abort signal) last.
      const extra = args.at(-1) as { signal?: unknown } | undefined;
      const signal = extra?.signal instanceof AbortSignal ? extra.signal : undefined;
      const result = await withCallSignal(signal, () => (handler as (...a: unknown[]) => unknown)(...args));
      return fitsOneMessage(result);
    };
    const described = {
      ...config,
      ...published,
      title: config.title ?? toolTitle(name),
      annotations: { ...config.annotations, openWorldHint: false },
    };
    return server.registerTool(name, described as never, bound as never);
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

// Words in tool names that read wrongly in plain sentence case.
const TITLE_WORDS: Record<string, string> = {
  rtsp: "RTSP",
  ptz: "PTZ",
  nvrs: "NVRs",
  ulp: "ULP",
  pos: "POS",
  goto: "go to",
};

/** "protect_get_rtsp_streams" → "Get RTSP streams". */
export function toolTitle(name: string): string {
  const title = name
    .replace(/^protect_/, "")
    .split("_")
    .map((word) => TITLE_WORDS[word] ?? word)
    .join(" ");
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/**
 * The result itself, or an error when its serialised form would exceed what
 * one stdio message carries. Measured on the final result: escaping makes a
 * payload under the per-kind ceilings in limits.ts larger than it looks.
 */
function fitsOneMessage(result: unknown): unknown {
  // `?? null`: JSON.stringify(undefined) returns undefined, not a string.
  const bytes = Buffer.byteLength(JSON.stringify(result ?? null), "utf8");
  return bytes <= MAX_RESULT_BYTES
    ? result
    : formatError(new Error(
      `Result too large to send in one MCP message (${bytes.toString()} bytes); narrow the request`
    ));
}
