import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";

const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false } as const;
const WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false } as const;
const DESTRUCTIVE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: true } as const;

export function registerFileTools(
  server: McpServer,
  client: ProtectClient,
  readOnly: boolean
) {
  server.registerTool(
    "protect_list_files",
    {
      description: "List files of a given type (e.g. 'video', 'timelapse')",
      inputSchema: {
        fileType: z
          .string()
          .describe("File type to list (e.g. 'video', 'timelapse')"),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ fileType }) => {
      try {
        const data = await client.get(`/files/${fileType}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.registerTool(
    "protect_trigger_alarm_webhook",
    {
      description:
        "Trigger an alarm manager webhook by ID. This fires an external alarm action.",
      inputSchema: {
        id: z.string().describe("Webhook ID"),
        confirm: z
          .literal(true)
          .describe("Must be true to confirm triggering the alarm webhook"),
      },
      annotations: DESTRUCTIVE_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        await client.post(`/alarm-manager/webhook/${id}`);
        return formatSuccess({ triggered: true, webhookId: id });
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_upload_file",
    {
      description: "Upload a base64-encoded file to UniFi Protect",
      inputSchema: {
        fileType: z.string().describe("File type category for upload"),
        base64Data: z.string().describe("Base64-encoded file content"),
        contentType: z
          .string()
          .default("application/octet-stream")
          .describe("MIME type of the file"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ fileType, base64Data, contentType, dryRun }) => {
      try {
        if (dryRun) {
          return formatSuccess({
            dryRun: true,
            action: "POST",
            path: `/files/${fileType}`,
            contentType,
            dataLength: base64Data.length,
          });
        }
        const buffer = Buffer.from(base64Data, "base64");
        const data = await client.postBinary(
          `/files/${fileType}`,
          buffer,
          contentType
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
