import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { DESTRUCTIVE, formatDryRun, requireConfirmation } from "../utils/safety.js";
import { safePath } from "../utils/url.js";

export function registerAlarmManagerTools(
  server: McpServer,
  client: ProtectClient,
  readOnly: boolean
) {
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
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ id, confirm, dryRun }) => {
      const denied = requireConfirmation(confirm, "trigger the alarm webhook");
      if (denied) return denied;
      try {
        if (dryRun) {
          return formatDryRun("POST", safePath`/alarm-manager/webhook/${id}`);
        }
        await client.post(safePath`/alarm-manager/webhook/${id}`);
        return formatSuccess({ triggered: true, webhookId: id });
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
