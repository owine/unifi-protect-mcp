import {
  idField,
  listResultSchema,
  nullableString,
  passthroughObject,
  unknownField,
} from "./common.js";

/**
 * Verified against live UniFi Protect Integration API 7.1.83 (2026-06-20).
 * The Integration API camera object is far smaller than the internal Protect
 * app's camera model — no isRecording/lastMotion/channels/firmwareVersion/etc.
 * `list` and `get-by-id` return the same field set (confirmed live).
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

// Verified live (7.1.83): doorbell LCD message. `resetAt` is null when the
// message has no expiry, so it stays unknownField (number|null).
const lcdMessageSchema = passthroughObject({
  type: nullableString('Message type, e.g. "CUSTOM_MESSAGE", "LEAVE_PACKAGE_AT_DOOR", "DO_NOT_DISTURB"'),
  resetAt: unknownField("Auto-reset timestamp in epoch ms, or null (number|null)"),
  text: nullableString("Message text shown on the doorbell LCD"),
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
  lcdMessage: lcdMessageSchema.optional(),
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

// Verified against 7.1.83 docs: talkback returns the stream URL plus audio
// config the client needs to encode outbound audio.
export const talkbackSessionOutputSchema = {
  url: nullableString("Talkback session URL (e.g. rtp://host:port)"),
  codec: nullableString('Audio codec, e.g. "opus"'),
  samplingRate: unknownField("Audio sampling rate in Hz (number)"),
  bitsPerSample: unknownField("Audio bit depth (number)"),
};
