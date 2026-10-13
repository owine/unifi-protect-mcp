import { z } from "zod";
import type { ToolRegistrar } from "./registrar.js";
import { ProtectClient } from "../client.js";
import { formatSuccess } from "../utils/responses.js";
import { READ_ONLY, WRITE, DESTRUCTIVE, formatDryRun, requireConfirmationForFields, dryRunInput, confirmGate, confirmInput } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
import { armProfileId } from "../utils/params.js";
import {
  armProfileListOutputSchema,
  armProfileOutputSchema,
} from "../schemas/misc.js";

const activationDelay = z
  .union([z.literal(0), z.literal(60000), z.literal(300000), z.literal(600000)])
  .describe("Activation delay in milliseconds. Allowed: 0 (none), 60000 (1m), 300000 (5m), 600000 (10m).");

const armProfileFields = {
  name: z.string().min(1).max(255).describe("Name of the arm profile"),
  automations: z.array(z.string()).describe("List of automation IDs associated with this arm profile"),
  schedules: z
    .array(z.record(z.string(), z.unknown()))
    .describe('List of arm schedules, e.g. [{ start: "0 22 * * *", end: "0 6 * * *" }] (cron strings)'),
  recordEverything: z.boolean().describe("Whether to record everything when this arm profile is active"),
  activationDelay,
};

/** Arm profile settings that change what the alarm protects, and when. */
const ARM_PROFILE_CONFIRM_FIELDS = ["schedules", "automations"] as const;

// Each gate's confirm input and handler check share one action text.
const DELETE_PROFILE = confirmGate("delete the arm profile");
const SET_CURRENT_PROFILE = confirmGate("change which arm profile the alarm uses");
const DISARM = confirmGate("disarm the alarm");

export function registerArmProfileTools(
  server: ToolRegistrar,
  client: ProtectClient,
  readOnly: boolean
) {
  server.registerTool(
    "protect_list_arm_profiles",
    {
      description:
        "List all arm profiles (only available when using the local alarm manager — the standalone NVR alarm system, not Protect cloud alerts). Returns array; each profile (7.3.70 docs): id, name, automations[], creator, schedules[], recordEverything, activationDelay (0 | 60000 | 300000 | 600000), createdAt, updatedAt.",
      outputSchema: armProfileListOutputSchema,
      annotations: READ_ONLY,
    },
    async () => {
      const data = await client.get("/arm-profiles");
      return formatSuccess(data);
    }
  );

  if (readOnly) return;

  server.registerTool(
    "protect_create_arm_profile",
    {
      description: "Create a new arm profile. Only available when using local alarm manager.",
      inputSchema: {
        ...armProfileFields,
        dryRun: dryRunInput(),
      },
      outputSchema: armProfileOutputSchema,
      annotations: WRITE,
    },
    async ({ name, automations, schedules, recordEverything, activationDelay, dryRun }) => {
      const body = { name, automations, schedules, recordEverything, activationDelay };
      if (dryRun) {
        return formatDryRun("POST", "/arm-profiles", body);
      }
      const data = await client.post("/arm-profiles", body);
      return formatSuccess(data);
    }
  );

  server.registerTool(
    "protect_set_current_arm_profile",
    {
      description: "Set the current arm profile to be used when enabling the arm alarm. Only available when using local alarm manager. Requires confirm: true: it changes what the alarm protects when armed.",
      inputSchema: {
        armProfileId: armProfileId().describe("The arm profile ID to set as current"),
        confirm: SET_CURRENT_PROFILE.input,
        dryRun: dryRunInput(),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ armProfileId, confirm, dryRun }) => {
      const body = { armProfileId };
      if (dryRun) {
        return formatDryRun("PATCH", "/arm-profiles/settings", body);
      }
      const denied = SET_CURRENT_PROFILE.check(confirm);
      if (denied) return denied;
      const data = await client.patch("/arm-profiles/settings", body);
      return formatSuccess(data);
    }
  );

  server.registerTool(
    "protect_update_arm_profile",
    {
      description: "Update an existing arm profile (partial update via PATCH). Changing schedules or automations affects alarm coverage and requires confirm: true. Only available when using local alarm manager.",
      inputSchema: {
        id: armProfileId().describe("Arm profile ID"),
        settings: z
          .object(armProfileFields)
          .partial()
          .loose()
          .refine((o) => Object.keys(o).length > 0, "settings must include at least one field")
          .describe("Partial arm profile settings to update"),
        confirm: confirmInput("change schedules or automations"),
        dryRun: dryRunInput(),
      },
      outputSchema: armProfileOutputSchema,
      annotations: DESTRUCTIVE,
    },
    async ({ id, settings, confirm, dryRun }) => {
      if (dryRun) {
        return formatDryRun("PATCH", safePath`/arm-profiles/${id}`, settings);
      }
      const denied = requireConfirmationForFields(settings, ARM_PROFILE_CONFIRM_FIELDS, confirm);
      if (denied) return denied;
      const data = await client.patch(safePath`/arm-profiles/${id}`, settings);
      return formatSuccess(data);
    }
  );

  server.registerTool(
    "protect_delete_arm_profile",
    {
      description: "Delete an arm profile by ID. Only available when using local alarm manager. Requires confirm: true.",
      inputSchema: {
        id: armProfileId().describe("Arm profile ID"),
        confirm: DELETE_PROFILE.input,
        dryRun: dryRunInput(),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ id, confirm, dryRun }) => {
      if (dryRun) {
        return formatDryRun("DELETE", safePath`/arm-profiles/${id}`);
      }
      const denied = DELETE_PROFILE.check(confirm);
      if (denied) return denied;
      const data = await client.delete(safePath`/arm-profiles/${id}`);
      return formatSuccess(data);
    }
  );

  server.registerTool(
    "protect_enable_arm_alarm",
    {
      description: "Enable the arm alarm using the currently selected arm profile. Only available when using local alarm manager.",
      inputSchema: {
        dryRun: dryRunInput(),
      },
      annotations: WRITE,
    },
    async ({ dryRun }) => {
      if (dryRun) {
        return formatDryRun("POST", "/arm-profiles/enable");
      }
      const data = await client.post("/arm-profiles/enable");
      return formatSuccess(data);
    }
  );

  server.registerTool(
    "protect_disable_arm_alarm",
    {
      description: "Disable (disarm) the arm alarm, leaving the site unprotected until it is re-armed; requires confirm: true. Only available when using local alarm manager.",
      inputSchema: {
        confirm: DISARM.input,
        dryRun: dryRunInput(),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ confirm, dryRun }) => {
      if (dryRun) {
        return formatDryRun("POST", "/arm-profiles/disable");
      }
      const denied = DISARM.check(confirm);
      if (denied) return denied;
      const data = await client.post("/arm-profiles/disable");
      return formatSuccess(data);
    }
  );
}
