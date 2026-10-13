import { z } from "zod";
import type { ToolRegistrar } from "./registrar.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { DESTRUCTIVE, formatDryRun, requireConfirmation, confirmInput } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
import { webhookId } from "../utils/params.js";

export function registerAlarmManagerTools(
  server: ToolRegistrar,
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
        id: webhookId()
          .describe("User-defined webhook ID matching an alarm manager configuration"),
        confirm: confirmInput("trigger the alarm webhook"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ id, confirm, dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun("POST", safePath`/alarm-manager/webhook/${id}`);
        }
        const denied = requireConfirmation(confirm, "trigger the alarm webhook");
        if (denied) return denied;
        await client.post(safePath`/alarm-manager/webhook/${id}`);
        return formatSuccess({ triggered: true, webhookId: id });
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
