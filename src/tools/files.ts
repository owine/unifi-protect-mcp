import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";

export function registerFileTools(
  server: McpServer,
  client: ProtectClient
) {
  server.tool(
    "protect_trigger_alarm_webhook",
    "Trigger an alarm manager webhook by ID",
    { id: z.string().describe("Webhook ID") },
    async ({ id }) => {
      try {
        const data = await client.post(`/alarm-manager/webhook/${id}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "protect_list_files",
    "List files of a given type (e.g. 'video', 'timelapse')",
    {
      fileType: z
        .string()
        .describe("File type to list (e.g. 'video', 'timelapse')"),
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

  server.tool(
    "protect_upload_file",
    "Upload a base64-encoded file to UniFi Protect",
    {
      fileType: z.string().describe("File type category for upload"),
      base64Data: z.string().describe("Base64-encoded file content"),
      contentType: z
        .string()
        .default("application/octet-stream")
        .describe("MIME type of the file"),
    },
    async ({ fileType, base64Data, contentType }) => {
      try {
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
