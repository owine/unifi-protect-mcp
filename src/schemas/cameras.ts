import {
  idField,
  listResultSchema,
  nullableString,
  passthroughObject,
  unknownField,
} from "./common.js";

/**
 * Verified against live UniFi Protect Integration API 7.1.60 (2026-05-15).
 * The Integration API camera object is far smaller than the internal Protect
 * app's camera model — no isRecording/lastMotion/channels/firmwareVersion/etc.
 * `list` and `get-by-id` return the same field set.
 */

const featureFlagsSchema = passthroughObject({
  hasHdr: unknownField("Supports HDR (boolean)"),
  hasLedStatus: unknownField("Has a status LED (boolean)"),
  hasMic: unknownField("Has a microphone (boolean)"),
  hasSpeaker: unknownField("Has a speaker (boolean)"),
  smartDetectAudioTypes: unknownField("Supported smart audio-detect types (array of strings)"),
  smartDetectTypes: unknownField("Supported smart object-detect types (array of strings)"),
  supportFullHdSnapshot: unknownField("Supports full-HD snapshot (boolean)"),
  videoModes: unknownField("Supported video modes (array of strings)"),
});

const ledSettingsSchema = passthroughObject({
  isEnabled: unknownField("Status LED enabled (boolean)"),
  floodLed: unknownField("Flood LED enabled (boolean)"),
  welcomeLed: unknownField("Welcome LED enabled (boolean)"),
});

const osdSettingsSchema = passthroughObject({
  isNameEnabled: unknownField("Overlay camera name (boolean)"),
  isDateEnabled: unknownField("Overlay date (boolean)"),
  isLogoEnabled: unknownField("Overlay logo (boolean)"),
  isDebugEnabled: unknownField("Overlay debug info (boolean)"),
  overlayLocation: nullableString('OSD position, e.g. "topLeft"'),
});

const smartDetectSettingsSchema = passthroughObject({
  objectTypes: unknownField("Enabled object-detect types (array of strings)"),
  audioTypes: unknownField("Enabled audio-detect types (array of strings)"),
});

export const cameraSchema = passthroughObject({
  id: idField("Camera ID"),
  mac: nullableString("MAC address"),
  name: nullableString("Camera name"),
  modelKey: nullableString('Always "camera"'),
  state: nullableString("CONNECTED | DISCONNECTED | ..."),
  activePatrolSlot: unknownField("Active PTZ patrol slot, or null (number|null)"),
  hasPackageCamera: unknownField("Has a secondary package camera (boolean)"),
  hdrType: nullableString('HDR mode, e.g. "auto"'),
  isMicEnabled: unknownField("Microphone enabled (boolean)"),
  micVolume: unknownField("Microphone volume 0-100 (number)"),
  videoMode: nullableString('Video mode, e.g. "default"'),
  featureFlags: featureFlagsSchema.optional(),
  lcdMessage: unknownField("Doorbell LCD message (object; often empty {})"),
  ledSettings: ledSettingsSchema.optional(),
  osdSettings: osdSettingsSchema.optional(),
  smartDetectSettings: smartDetectSettingsSchema.optional(),
});

export const cameraOutputSchema = { ...cameraSchema.shape };
export const cameraListOutputSchema = listResultSchema(cameraSchema);

// Verified live (7.1.60): GET /cameras/{id}/rtsps-stream returns an object
// keyed by quality with RTSPS URLs. Keys absent when no session at that
// quality. nullableString keeps it null/absent-safe.
export const rtspStreamSchema = passthroughObject({
  high: nullableString("RTSPS URL for the high-quality stream"),
  medium: nullableString("RTSPS URL for the medium-quality stream"),
  low: nullableString("RTSPS URL for the low-quality stream"),
  package: nullableString("RTSPS URL for the package-camera stream"),
});
export const rtspStreamOutputSchema = { ...rtspStreamSchema.shape };

export const talkbackSessionOutputSchema = {
  url: nullableString("Talkback session URL"),
};
