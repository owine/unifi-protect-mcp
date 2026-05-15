import { z } from "zod";
import {
  idField,
  listResultSchema,
  nullableString,
  passthroughObject,
  unknownField,
} from "./common.js";

/**
 * Schemas below are verified against live UniFi Protect Integration API 7.1.60
 * responses (Melrose NVR Pro console, 2026-05-15). The Integration API surface
 * is much thinner than the internal Protect app API — only the fields observed
 * in real responses are typed; `.passthrough()` still allows anything extra a
 * different firmware/hardware mix might add.
 */

// --- System ---

export const infoOutputSchema = {
  applicationVersion: nullableString("Current Protect application version"),
};

// GET /nvrs returns a SINGLE nvr object (not an array, despite the tool name).
const armModeSchema = passthroughObject({
  status: nullableString("disabled | armed | ..."),
  armedAt: unknownField("Unix epoch ms when armed, or null (number|null)"),
  willBeArmedAt: unknownField("Scheduled arm time, or null (number|null)"),
  breachDetectedAt: unknownField("Unix epoch ms of last breach, or null"),
  breachEventCount: unknownField("Count of breach events (number)"),
  breachTriggerEventId: unknownField("Triggering event ID, or null (string|null)"),
  breachEventId: unknownField("Breach event ID, or null (string|null)"),
});

const doorbellSettingsSchema = passthroughObject({
  defaultMessageText: nullableString("Default doorbell LCD message"),
  defaultMessageResetTimeoutMs: unknownField("Reset timeout in ms (number)"),
  customMessages: unknownField("Configured custom LCD messages (array of strings)"),
  customImages: unknownField("Configured custom LCD images (array)"),
});

export const nvrSchema = passthroughObject({
  id: idField("NVR ID"),
  modelKey: nullableString('Always "nvr"'),
  name: nullableString("NVR name"),
  doorbellSettings: doorbellSettingsSchema.optional(),
  armMode: armModeSchema.optional(),
});

// Single object — use the shape directly, NOT a list wrapper.
export const nvrOutputSchema = { ...nvrSchema.shape };

// --- Users ---

export const userSchema = passthroughObject({
  id: idField("User ID"),
  modelKey: nullableString('Always "user"'),
  name: nullableString("Display name"),
  firstName: nullableString("First name"),
  lastName: nullableString("Last name"),
  email: nullableString("Email address"),
  ucoreUserId: nullableString("UniFi Core user UUID"),
});

export const userOutputSchema = { ...userSchema.shape };
export const userListOutputSchema = listResultSchema(userSchema);

export const ulpUserSchema = passthroughObject({
  id: idField("ULP user UUID"),
  modelKey: nullableString('Always "ulpUser"'),
  firstName: nullableString("First name"),
  lastName: nullableString("Last name"),
  fullName: nullableString("Full name"),
  status: nullableString("Account status, e.g. ACTIVE"),
});

export const ulpUserOutputSchema = { ...ulpUserSchema.shape };
export const ulpUserListOutputSchema = listResultSchema(ulpUserSchema);

// --- Liveviews ---

const liveviewSlotSchema = passthroughObject({
  cameras: unknownField("Camera IDs shown in this slot (array of strings)"),
  cycleMode: nullableString('Slot cycle mode, e.g. "time"'),
  cycleInterval: unknownField("Cycle interval in seconds (number)"),
});

export const liveviewSchema = passthroughObject({
  id: idField("Liveview ID"),
  modelKey: nullableString('Always "liveview"'),
  name: nullableString("Liveview name"),
  isDefault: unknownField("Whether this is the default liveview (boolean)"),
  isGlobal: unknownField("Whether shared across all users (boolean)"),
  layout: unknownField("Grid layout / slot count (number)"),
  owner: nullableString("Owning user ID"),
  slots: z.array(liveviewSlotSchema).optional().describe("Camera slots"),
});

export const liveviewOutputSchema = { ...liveviewSchema.shape };
export const liveviewListOutputSchema = listResultSchema(liveviewSchema);

// --- Arm profiles ---
// No instances on the verification console — fields unverified. Kept minimal:
// only the identity field is typed; everything else flows via passthrough.

export const armProfileSchema = passthroughObject({
  id: idField("Arm profile ID"),
  modelKey: nullableString("Resource kind"),
  name: nullableString("Arm profile name"),
});

export const armProfileListOutputSchema = listResultSchema(armProfileSchema);
export const armProfileOutputSchema = { ...armProfileSchema.shape };

// --- Files ---
// `protect_list_files` (only fileType=animations supported) — unverified shape.

export const fileSchema = passthroughObject({
  id: idField("File ID"),
  modelKey: nullableString("Resource kind"),
  name: nullableString("File name"),
});

export const fileListOutputSchema = listResultSchema(fileSchema);

// --- Subscriptions ---

export const subscriptionOutputSchema = {
  messages: z
    .array(z.unknown())
    .optional()
    .describe("Captured WebSocket messages (add/update/remove or event envelopes)"),
  duration: unknownField("Actual listen duration in seconds (number)"),
  error: nullableString("Connection error, if any"),
};
