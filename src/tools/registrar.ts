import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { CallToolResult, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { withCallSignal } from "../client.js";
import { dryRunPreviewFields, looseOutput } from "../schemas/common.js";
import { formatError } from "../utils/responses.js";
import { MAX_RESULT_BYTES } from "../utils/limits.js";

/**
 * What a tool module may do with the server: register tools, nothing else.
 * Modules get this rather than the McpServer, so they cannot reach the
 * registration paths that would bypass instrumentTools (the experimental
 * task API, RegisteredTool.update(), the deprecated tool()).
 */
export type ToolRegistrar = Pick<McpServer, "registerTool">;

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;
type ToolHandler = (...args: unknown[]) => CallToolResult | Promise<CallToolResult>;

/**
 * A registrar that applies these rules to every tool it registers, so no tool
 * module can forget them:
 *
 * - The outputSchema is published as a loose object (see looseOutput): a raw
 *   shape would publish `additionalProperties: false`, and SDK clients would
 *   reject any field Protect adds.
 * - A write tool that takes `dryRun` also declares the preview fields in its
 *   outputSchema, so its dry-run result validates and is documented.
 * - Handlers run with their call's abort signal in scope, so ProtectClient
 *   aborts the Protect request (and subscriptions close their WebSocket) when
 *   the MCP client cancels the call.
 * - In read-only mode, registering anything but a read-only tool fails at
 *   startup. Modules also return before their write tools; this catches a
 *   write tool placed above that return.
 * - A handler that throws returns an error result (formatError), so tool
 *   modules need no try/catch of their own.
 * - A result too large for one stdio message becomes an error, instead of a
 *   message the client cannot read (which ends its session).
 * - Each tool gets a human-readable title derived from its name, and by
 *   default `openWorldHint: false`: every tool talks to one known console,
 *   not to an open set of external systems.
 */
export function instrumentTools(server: McpServer, readOnly = false): ToolRegistrar {
  const registerTool: McpServer["registerTool"] = (name, config, handler) => {
    if (readOnly && config.annotations?.readOnlyHint !== true) {
      throw new Error(`${name} is a write tool registered in read-only mode`);
    }
    // outputSchema is destructured out so the inner call infers its own
    // output type rather than the caller's generic one. The SDK also accepts
    // Zod 3 schemas; this server uses Zod 4 throughout, so narrow to that.
    const { outputSchema, ...rest } = config;
    const output = outputSchema as z.ZodRawShape | z.ZodType | undefined;
    const input = config.inputSchema as z.ZodRawShape | z.ZodType | undefined;
    const bound = async (...args: unknown[]): Promise<CallToolResult> => {
      // The SDK passes the call's `extra` (with its abort signal) last.
      const extra = args.at(-1) as Partial<ToolExtra> | undefined;
      let result: CallToolResult;
      try {
        result = await withCallSignal(extra?.signal, () => (handler as ToolHandler)(...args));
      } catch (err) {
        return formatError(err);
      }
      return fitsOneMessage(result);
    };
    return server.registerTool(name, {
      ...rest,
      ...(output === undefined ? {} : { outputSchema: looseOutput(withPreview(output, input)) }),
      title: config.title ?? toolTitle(name),
      annotations: { openWorldHint: false, ...config.annotations },
    }, bound as typeof handler); // the one cast: bound has handler's call shape
  };
  return { registerTool };
}

function withPreview(
  outputSchema: z.ZodRawShape | z.ZodType,
  inputSchema: z.ZodRawShape | z.ZodType | undefined
): z.ZodRawShape | z.ZodType {
  const takesDryRun = inputSchema !== undefined && !(inputSchema instanceof z.ZodType) && "dryRun" in inputSchema;
  if (!takesDryRun) return outputSchema;
  if (outputSchema instanceof z.ZodObject) return { ...dryRunPreviewFields, ...outputSchema.shape };
  if (outputSchema instanceof z.ZodType) return outputSchema; // looseOutput rejects it
  return { ...dryRunPreviewFields, ...outputSchema };
}

/**
 * The result itself, or an error when its serialised form would exceed what
 * one stdio message carries. Measured on the final result: escaping makes a
 * payload under the per-kind ceilings in limits.ts larger than it looks.
 */
function fitsOneMessage(result: CallToolResult): CallToolResult {
  const bytes = Buffer.byteLength(JSON.stringify(result), "utf8");
  return bytes <= MAX_RESULT_BYTES
    ? result
    : formatError(new Error(
      `Result too large to send in one MCP message (${bytes.toString()} bytes); narrow the request, or page a list tool with limit and offset`
    ));
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
