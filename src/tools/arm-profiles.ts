import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY, WRITE, DESTRUCTIVE, formatDryRun } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
import {
  armProfileListOutputSchema,
  armProfileOutputSchema,
} from "../schemas/misc.js";

const ACTIVATION_DELAY_VALUES = [0, 60000, 300000, 600000] as const;

export function registerArmProfileTools(
  server: McpServer,
  client: ProtectClient,
  readOnly: boolean
) {
  server.registerTool(
    "protect_list_arm_profiles",
    {
      description:
        "List all arm profiles (only available when using the local alarm manager — the standalone NVR alarm system, not Protect cloud alerts). Returns array. Response shape is NOT verified against Protect 7.1.60 (no arm profiles on the reference console); expect at least id, modelKey, name plus profile configuration fields — inspect a live response to confirm.",
      outputSchema: armProfileListOutputSchema,
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const data = await client.get("/arm-profiles");
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.registerTool(
    "protect_create_arm_profile",
    {
      description: "Create a new arm profile. Only available when using local alarm manager.",
      inputSchema: {
        name: z.string().min(1).max(255).describe("Name of the arm profile"),
        automations: z.array(z.string()).describe("List of automation IDs associated with this arm profile"),
        schedules: z.array(z.record(z.string(), z.unknown())).describe("List of arm schedules"),
        recordEverything: z.boolean().describe("Whether to record everything when this arm profile is active"),
        activationDelay: z
          .union([z.literal(0), z.literal(60000), z.literal(300000), z.literal(600000)])
          .describe("Activation delay in milliseconds. Allowed: 0 (none), 60000 (1m), 300000 (5m), 600000 (10m)."),
        dryRun: z.boolean().optional().describe("If true, return what would happen without making changes"),
      },
      outputSchema: armProfileOutputSchema,
      annotations: WRITE,
    },
    async ({ name, automations, schedules, recordEverything, activationDelay, dryRun }) => {
      try {
        const body = { name, automations, schedules, recordEverything, activationDelay };
        if (dryRun) {
          return formatDryRun("POST", "/arm-profiles", body);
        }
        const data = await client.post("/arm-profiles", body);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_set_current_arm_profile",
    {
      description: "Set the current arm profile to be used when enabling the arm alarm. Only available when using local alarm manager.",
      inputSchema: {
        armProfileId: z.string().describe("The arm profile ID to set as current"),
        dryRun: z.boolean().optional().describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ armProfileId, dryRun }) => {
      try {
        const body = { armProfileId };
        if (dryRun) {
          return formatDryRun("PATCH", "/arm-profiles/settings", body);
        }
        const data = await client.patch("/arm-profiles/settings", body);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_update_arm_profile",
    {
      description: "Update an existing arm profile (partial update via PATCH). Only available when using local alarm manager.",
      inputSchema: {
        id: z.string().describe("Arm profile ID"),
        settings: z
          .record(z.string(), z.unknown())
          .describe(`Partial arm profile settings. Known fields: name (string 1-255 chars), automations (array of strings), schedules (array of objects), recordEverything (boolean), activationDelay (number, allowed: ${ACTIVATION_DELAY_VALUES.join(", ")})`),
        dryRun: z.boolean().optional().describe("If true, return what would happen without making changes"),
      },
      outputSchema: armProfileOutputSchema,
      annotations: WRITE,
    },
    async ({ id, settings, dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun("PATCH", safePath`/arm-profiles/${id}`, settings);
        }
        const data = await client.patch(safePath`/arm-profiles/${id}`, settings);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_delete_arm_profile",
    {
      description: "Delete an arm profile by ID. Only available when using local alarm manager.",
      inputSchema: {
        id: z.string().describe("Arm profile ID"),
        dryRun: z.boolean().optional().describe("If true, return what would happen without making changes"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ id, dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun("DELETE", safePath`/arm-profiles/${id}`);
        }
        const data = await client.delete(safePath`/arm-profiles/${id}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_enable_arm_alarm",
    {
      description: "Enable the arm alarm using the currently selected arm profile. Only available when using local alarm manager.",
      inputSchema: {
        dryRun: z.boolean().optional().describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun("POST", "/arm-profiles/enable");
        }
        const data = await client.post("/arm-profiles/enable");
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_disable_arm_alarm",
    {
      description: "Disable the arm alarm. Only available when using local alarm manager.",
      inputSchema: {
        dryRun: z.boolean().optional().describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun("POST", "/arm-profiles/disable");
        }
        const data = await client.post("/arm-profiles/disable");
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
