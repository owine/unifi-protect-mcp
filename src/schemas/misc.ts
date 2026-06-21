import { z } from "zod";
import {
  idField,
  listResultSchema,
  nullableString,
  passthroughObject,
  unknownField,
} from "./common.js";

/**
 * Schemas below are verified against live UniFi Protect Integration API 7.1.83
 * responses (Melrose NVR Pro console, 2026-06-20) where instances exist, and
 * against the 7.1.83 published docs otherwise (arm profiles, files — no
 * instances on the console). The Integration API surface is much thinner than
 * the internal Protect app API — only observed/documented fields are typed;
 * `.passthrough()` still allows anything extra a firmware/hardware mix adds.
 */

// --- System ---

export const infoOutputSchema = {
  applicationVersion: nullableString("Current Protect application version"),
};

// GET /nvrs returns a SINGLE nvr object (not an array, despite the tool name).
const armModeSchema = passthroughObject({
  status: nullableString("disabled | arming | armed | ..."),
  armProfileId: nullableString("Active arm profile ID (present when arming/armed)"),
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
// Fields from the 7.1.83 docs (no instances on the console to verify live).
// Arm profiles carry no `modelKey`. Nested arrays stay unknownField.

export const armProfileSchema = passthroughObject({
  id: idField("Arm profile ID"),
  name: nullableString("Arm profile name"),
  automations: unknownField("Associated automation IDs (array of strings)"),
  creator: nullableString("ID of the user who created the profile"),
  schedules: unknownField("Arm schedules (array of objects)"),
  recordEverything: unknownField("Record everything while active (boolean)"),
  activationDelay: unknownField("Activation delay in ms: 0 | 60000 | 300000 | 600000 (number)"),
  createdAt: unknownField("Creation timestamp in epoch ms (number)"),
  updatedAt: unknownField("Last update timestamp in epoch ms (number)"),
});

export const armProfileListOutputSchema = listResultSchema(armProfileSchema);
export const armProfileOutputSchema = { ...armProfileSchema.shape };

// --- Files ---
// Device asset files (only fileType=animations supported). Shape from 7.1.83
// docs: { name, type, originalName, path } — no id/modelKey.

export const fileSchema = passthroughObject({
  name: nullableString("Stored file name (server-generated)"),
  type: nullableString('Asset file type, e.g. "animations"'),
  originalName: nullableString("Original uploaded file name"),
  path: nullableString("Server-side storage path"),
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
