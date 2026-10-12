import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY, WRITE, DESTRUCTIVE, formatDryRun, requireConfirmation } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
import { fileListOutputSchema } from "../schemas/misc.js";

// The only asset file type the API accepts (path param `assetFileType`).
const FILE_TYPE = z
  .literal("animations")
  .describe("Asset file type (only 'animations' is supported)");

const UPLOAD_CONTENT_TYPES = [
  "image/gif",
  "image/jpeg",
  "image/png",
  "audio/mpeg",
  "audio/mp4",
  "audio/wave",
  "audio/x-caf",
] as const;

export function registerFileTools(
  server: McpServer,
  client: ProtectClient,
  readOnly: boolean
) {
  server.registerTool(
    "protect_list_files",
    {
      description:
        "List files of a given type (only 'animations' is currently supported — clips uploadable to G4 Doorbell screens). Returns array; each record (7.1.83 docs): name (server-generated), type, originalName, path.",
      inputSchema: { fileType: FILE_TYPE },
      outputSchema: fileListOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ fileType }) => {
      try {
        const data = await client.get(safePath`/files/${fileType}`);
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
        id: z
          .string()
          .min(1)
          .describe("User-defined webhook ID matching an alarm manager configuration"),
        confirm: z
          .literal(true)
          .describe("Must be true to confirm triggering the alarm webhook"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ id, confirm }) => {
      const denied = requireConfirmation(confirm, "trigger the alarm webhook");
      if (denied) return denied;
      try {
        await client.post(safePath`/alarm-manager/webhook/${id}`);
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
        fileType: FILE_TYPE,
        base64Data: z.string().describe("Base64-encoded file content"),
        contentType: z
          .enum(UPLOAD_CONTENT_TYPES)
          .default("image/gif")
          .describe("MIME type of the file"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ fileType, base64Data, contentType, dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun("POST", safePath`/files/${fileType}`, {
            contentType,
            dataLength: base64Data.length,
          });
        }
        const buffer = Buffer.from(base64Data, "base64");
        const data = await client.postBinary(
          safePath`/files/${fileType}`,
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
