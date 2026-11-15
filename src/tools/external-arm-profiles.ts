import { z } from "zod";
import type { ToolRegistrar } from "./registrar.js";
import { ProtectClient } from "../client.js";
import { formatSuccess } from "../utils/responses.js";
import {
  READ_ONLY,
  WRITE,
  DESTRUCTIVE,
  formatDryRun,
  requireConfirmationForFields,
  dryRunInput,
  confirmGate,
  confirmInput,
} from "../utils/safety.js";
import { safePath } from "../utils/url.js";
import { PAGING_NOTE, pageOf, pagingInput } from "../utils/paging.js";
import { resourceId } from "../utils/params.js";
import {
  externalArmProfileListOutputSchema,
  externalArmProfileOutputSchema,
} from "../schemas/misc.js";

/**
 * Arm profiles of the global Alarm Manager, which Protect 7.4 proxies under
 * /external/arm-profiles. They are not the local alarm manager's profiles
 * (arm-profiles.ts): the API passes the alarm manager's snake_case records
 * through, delays are in seconds rather than milliseconds, and arming is per
 * profile instead of through one "current" profile. Verified live on 7.4.99:
 * with the global Alarm Manager on, the local /arm-profiles routes answer 400.
 */

/** The longest activation or deactivation delay the API accepts, in seconds. */
const MAX_DELAY_SECONDS = 3600;

const AVAILABILITY =
  "Only available when the console uses the global Alarm Manager (protect_list_nvrs featureFlags.useExternalAlarmManager is true).";

const delay = (which: string) =>
  z.number().int().min(0).max(MAX_DELAY_SECONDS).describe(`${which} delay in seconds (0-${MAX_DELAY_SECONDS.toString()})`);

const schedule = z
  .record(z.string(), z.unknown())
  .refine((o) => Object.keys(o).length > 0, "schedule must include at least one day")
  .describe(
    'Weekly schedule keyed by day (sun, mon, tue, wed, thu, fri, sat). Each day is { type: "intervals", entries: [{ start: { hour, minute }, end: { hour, minute } }] }, the shape the 7.4.99 docs show; other day types are not documented.'
  );

const alarmIds = z.array(z.string().min(1)).describe("Alarm Manager alarm IDs to associate with the profile");

const pinCode = z.string().describe("PIN code for the profile");

const RETURNS =
  "id, title, state (e.g. disarmed, breached), state_set_at, state_promotion_due_at, alarm_ids[], schedule (sun..sat, each {type, entries[{start, end: {hour, minute}}]}), activation_delay, deactivation_delay (seconds), has_pin (the PIN is not returned), active_breach_id, created_at, updated_at, created_by, updated_by (7.4.99 docs)";

/**
 * Settings that change what the alarm protects, when, or who can disarm it:
 * a longer delay leaves the site unprotected for longer, and clearing the PIN
 * lets anyone disarm the profile.
 */
export const EXTERNAL_ARM_PROFILE_CONFIRM_FIELDS = [
  "schedule",
  "alarm_ids",
  "activation_delay",
  "deactivation_delay",
  "pin_code",
] as const;

// Each gate's confirm input and handler check share one action text.
const DELETE_PROFILE = confirmGate("delete the external arm profile");
const DISARM_PROFILE = confirmGate("disarm the external arm profile");

/** The request body: only the fields the caller set. */
function definedFields(fields: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

export function registerExternalArmProfileTools(
  server: ToolRegistrar,
  client: ProtectClient,
  readOnly: boolean
) {
  server.registerTool(
    "protect_list_external_arm_profiles",
    {
      description: `List the global Alarm Manager's arm profiles. ${AVAILABILITY} Returns array; each profile: ${RETURNS}.${PAGING_NOTE}`,
      inputSchema: pagingInput,
      outputSchema: externalArmProfileListOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ limit, offset }) => {
      const data = await client.get("/external/arm-profiles");
      return formatSuccess(pageOf(data, limit, offset));
    }
  );

  server.registerTool(
    "protect_get_external_arm_profile",
    {
      description: `Get one of the global Alarm Manager's arm profiles by ID. ${AVAILABILITY} Returns: ${RETURNS}.`,
      inputSchema: {
        id: resourceId().describe("External arm profile ID"),
      },
      outputSchema: externalArmProfileOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const data = await client.get(safePath`/external/arm-profiles/${id}`);
      return formatSuccess(data);
    }
  );

  if (readOnly) return;

  server.registerTool(
    "protect_create_external_arm_profile",
    {
      description: `Create an arm profile in the global Alarm Manager. ${AVAILABILITY} Returns the created profile.`,
      inputSchema: {
        title: z.string().min(1).describe("Profile title"),
        activation_delay: delay("Activation").optional(),
        deactivation_delay: delay("Deactivation").optional(),
        schedule: schedule.optional(),
        alarm_ids: alarmIds.optional(),
        pin_code: pinCode.nullable().optional(),
        dryRun: dryRunInput(),
      },
      outputSchema: externalArmProfileOutputSchema,
      annotations: WRITE,
    },
    async ({ dryRun, ...fields }) => {
      const body = definedFields(fields);
      if (dryRun) {
        return formatDryRun("POST", "/external/arm-profiles", body);
      }
      const data = await client.post("/external/arm-profiles", body);
      return formatSuccess(data);
    }
  );

  server.registerTool(
    "protect_update_external_arm_profile",
    {
      description: `Update an arm profile in the global Alarm Manager (partial update via PATCH): omitted fields stay unchanged, and null clears a nullable one. Changing ${EXTERNAL_ARM_PROFILE_CONFIRM_FIELDS.join(", ")} affects alarm coverage and requires confirm: true. ${AVAILABILITY} Returns the updated profile.`,
      inputSchema: {
        id: resourceId().describe("External arm profile ID"),
        settings: z
          .object({
            title: z.string().min(1).describe("Profile title (cannot be cleared)"),
            activation_delay: delay("Activation").nullable(),
            deactivation_delay: delay("Deactivation").nullable(),
            schedule: schedule.nullable(),
            alarm_ids: alarmIds.nullable().describe("Alarm IDs to associate; null or [] clears them"),
            pin_code: pinCode.nullable().describe("PIN code; null clears it"),
          })
          .partial()
          .loose()
          .refine((o) => Object.keys(o).length > 0, "settings must include at least one field")
          .describe("Partial profile settings to update"),
        confirm: confirmInput(`change ${EXTERNAL_ARM_PROFILE_CONFIRM_FIELDS.join(", ")}`),
        dryRun: dryRunInput(),
      },
      outputSchema: externalArmProfileOutputSchema,
      annotations: DESTRUCTIVE,
    },
    async ({ id, settings, confirm, dryRun }) => {
      const path = safePath`/external/arm-profiles/${id}`;
      if (dryRun) {
        return formatDryRun("PATCH", path, settings);
      }
      const denied = requireConfirmationForFields(settings, EXTERNAL_ARM_PROFILE_CONFIRM_FIELDS, confirm);
      if (denied) return denied;
      const data = await client.patch(path, settings);
      return formatSuccess(data);
    }
  );

  server.registerTool(
    "protect_delete_external_arm_profile",
    {
      description: `Delete an arm profile from the global Alarm Manager. ${AVAILABILITY} Requires confirm: true.`,
      inputSchema: {
        id: resourceId().describe("External arm profile ID"),
        confirm: DELETE_PROFILE.input,
        dryRun: dryRunInput(),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ id, confirm, dryRun }) => {
      const path = safePath`/external/arm-profiles/${id}`;
      if (dryRun) {
        return formatDryRun("DELETE", path);
      }
      const denied = DELETE_PROFILE.check(confirm);
      if (denied) return denied;
      const data = await client.delete(path);
      return formatSuccess(data);
    }
  );

  server.registerTool(
    "protect_arm_external_arm_profile",
    {
      description: `Arm one of the global Alarm Manager's arm profiles. ${AVAILABILITY} Returns the profile with its new state.`,
      inputSchema: {
        id: resourceId().describe("External arm profile ID"),
        dryRun: dryRunInput(),
      },
      outputSchema: externalArmProfileOutputSchema,
      annotations: WRITE,
    },
    async ({ id, dryRun }) => {
      const path = safePath`/external/arm-profiles/${id}/actions/arm`;
      if (dryRun) {
        return formatDryRun("POST", path);
      }
      const data = await client.post(path);
      return formatSuccess(data);
    }
  );

  server.registerTool(
    "protect_disarm_external_arm_profile",
    {
      description: `Disarm one of the global Alarm Manager's arm profiles, leaving what it protects unguarded until it is re-armed; requires confirm: true. ${AVAILABILITY} Returns the profile with its new state.`,
      inputSchema: {
        id: resourceId().describe("External arm profile ID"),
        confirm: DISARM_PROFILE.input,
        dryRun: dryRunInput(),
      },
      outputSchema: externalArmProfileOutputSchema,
      annotations: DESTRUCTIVE,
    },
    async ({ id, confirm, dryRun }) => {
      const path = safePath`/external/arm-profiles/${id}/actions/disarm`;
      if (dryRun) {
        return formatDryRun("POST", path);
      }
      const denied = DISARM_PROFILE.check(confirm);
      if (denied) return denied;
      const data = await client.post(path);
      return formatSuccess(data);
    }
  );
}
