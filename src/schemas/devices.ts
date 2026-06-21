import {
  idField,
  listResultSchema,
  nullableString,
  passthroughObject,
  unknownField,
} from "./common.js";

/**
 * Device schemas for the config-driven Protect device types.
 *
 * Field sets are derived from the UniFi Protect Integration API 7.1.83 docs
 * (per-type response samples). Chimes were additionally verified against live
 * console responses (2026-06-20); the rest have no instances on the available
 * console, so their TOP-LEVEL fields are typed from the published docs while
 * every nested object/array is left as `unknownField()` (z.unknown()) — naming
 * the field for the LLM without risking SDK output-validation failures on a
 * shape we have not observed live. `.passthrough()` lets any extra field flow.
 *
 * Convention (see schemas/common.ts): only `id` is strictly typed; strings use
 * `nullableString()` (API returns explicit null for absent strings); booleans,
 * numbers, and unverified nested structures use `unknownField()`.
 */

/** Identity fields common to every Protect device resource. */
const deviceIdentity = () => ({
  id: idField("Device ID"),
  modelKey: nullableString("Resource kind"),
  name: nullableString("Device name"),
  mac: nullableString("MAC address"),
  state: nullableString("CONNECTED | DISCONNECTED | ..."),
});

export const lightSchema = passthroughObject({
  ...deviceIdentity(),
  lightModeSettings: unknownField("Activation settings (object: mode, enableAt)"),
  lightDeviceSettings: unknownField(
    "Hardware settings (object: isIndicatorEnabled, pirDuration, pirSensitivity, ledLevel)"
  ),
  isDark: unknownField("Whether it is currently dark out (boolean)"),
  isLightOn: unknownField("Whether the light is currently on (boolean)"),
  isLightForceEnabled: unknownField("Main LED force-enabled (boolean)"),
  lastMotion: unknownField("Last motion timestamp in epoch ms (number)"),
  isPirMotionDetected: unknownField("PIR motion currently detected (boolean)"),
  camera: nullableString("Paired camera ID"),
});

export const sensorSchema = passthroughObject({
  ...deviceIdentity(),
  mountType: nullableString('Mount type, e.g. "door", "leak", "garage"'),
  batteryStatus: unknownField("Battery status (object: percentage, isLow)"),
  stats: unknownField("Environmental stats (object: light, humidity, temperature)"),
  lightSettings: unknownField("Light threshold settings (object)"),
  humiditySettings: unknownField("Humidity threshold settings (object)"),
  temperatureSettings: unknownField("Temperature threshold settings (object)"),
  isOpened: unknownField("Open/close contact state (boolean)"),
  openStatusChangedAt: unknownField("Open-status change timestamp in epoch ms (number)"),
  isMotionDetected: unknownField("Motion currently detected (boolean)"),
  motionDetectedAt: unknownField("Last motion timestamp in epoch ms (number)"),
  motionSettings: unknownField("Motion detection settings (object)"),
  glassBreakSettings: unknownField("Glass-break detection settings (object)"),
  scheduleMode: nullableString('Schedule mode: "always" | "when_armed"'),
  armProfileIds: unknownField("Arm profile IDs this sensor belongs to (array of strings)"),
  hasCustomSensitivityWhenArmed: unknownField("Custom armed sensitivity enabled (boolean)"),
  alarmTriggeredAt: unknownField("Last alarm timestamp in epoch ms (number)"),
  alarmSettings: unknownField("Alarm settings (object: isEnabled)"),
  leakDetectedAt: unknownField("Last leak timestamp in epoch ms (number)"),
  externalLeakDetectedAt: unknownField("Last external-leak timestamp in epoch ms (number)"),
  leakSettings: unknownField("Leak detection settings (object)"),
  tamperingDetectedAt: unknownField("Last tampering timestamp in epoch ms (number)"),
  wirelessConnectionState: unknownField(
    "Wireless link state (object: signalState, batteryStatus, bridge)"
  ),
});

// Verified live (7.1.83): chimes return cameraIds[] and ringSettings[] whose
// items are { cameraId, volume, ringtoneId, repeatTimes }.
export const chimeSchema = passthroughObject({
  ...deviceIdentity(),
  cameraIds: unknownField("Paired camera IDs (array of strings)"),
  ringSettings: unknownField(
    "Per-camera ring config (array of objects: cameraId, volume, ringtoneId, repeatTimes)"
  ),
});

export const viewerSchema = passthroughObject({
  ...deviceIdentity(),
  liveview: nullableString("Assigned live view ID, or null"),
  streamLimit: unknownField("Max concurrent streams (number)"),
});

export const sirenSchema = passthroughObject({
  ...deviceIdentity(),
  volume: unknownField("Siren volume (number)"),
  ledSettings: unknownField("LED settings (object: isEnabled)"),
  sirenStatus: unknownField("Current siren status (object: isActive, activatedAt, duration)"),
  connectionType: nullableString('Connection type, e.g. "lora"'),
  wirelessConnectionState: unknownField("Wireless link state (object)"),
});

export const fobSchema = passthroughObject({
  ...deviceIdentity(),
  awayState: nullableString('Away state, e.g. "ONLINE"'),
  buttonLabels: nullableString('Button label preset, e.g. "securityActions"'),
  featureFlags: unknownField("Feature flags (object: buttons[])"),
  wirelessConnectionState: unknownField("Wireless link state (object)"),
});

export const relaySchema = passthroughObject({
  ...deviceIdentity(),
  ledSettings: unknownField("LED settings (object: isEnabled)"),
  outputs: unknownField("Output channels (array of objects)"),
  inputs: unknownField("Input channels (array of objects)"),
  wirelessConnectionState: unknownField("Wireless link state (object)"),
});

export const speakerSchema = passthroughObject({
  ...deviceIdentity(),
  volume: unknownField("Speaker volume (number)"),
  micVolume: unknownField("Microphone volume (number)"),
  isMicEnabled: unknownField("Microphone enabled (boolean)"),
  speakerState: unknownField("Speaker state (object: status, mode)"),
  featureFlags: unknownField("Feature flags (object: hasMic)"),
});

export const bridgeSchema = passthroughObject({
  ...deviceIdentity(),
  platform: nullableString('Hardware platform, e.g. "mt7621"'),
  clients: unknownField("Connected client MACs (array of strings)"),
  maxClients: unknownField("Max client capacity (number)"),
});

// Link stations and alarm hubs share one shape (both report modelKey
// "linkstation"); /alarm-hubs is the same resource filtered to alarm hubs.
const linkStationLikeSchema = () =>
  passthroughObject({
    ...deviceIdentity(),
    isAlarmHub: unknownField("Whether this device is an alarm hub (boolean)"),
    ledSettings: unknownField("LED settings (object: isEnabled)"),
    lastEvent: unknownField("Last event timestamp in epoch ms (number)"),
    alarmHub: unknownField(
      "Alarm hub status (object: armed, battery, connector, cover, output, input, …)"
    ),
  });

export const linkStationSchema = linkStationLikeSchema();
export const alarmHubSchema = linkStationLikeSchema();

export const DEVICE_SCHEMAS = {
  light: lightSchema,
  sensor: sensorSchema,
  chime: chimeSchema,
  viewer: viewerSchema,
  siren: sirenSchema,
  fob: fobSchema,
  relay: relaySchema,
  speaker: speakerSchema,
  bridge: bridgeSchema,
  link_station: linkStationSchema,
  alarm_hub: alarmHubSchema,
} as const;

export function itemOutputShape(key: keyof typeof DEVICE_SCHEMAS) {
  return { ...DEVICE_SCHEMAS[key].shape };
}

export function listOutputShape(key: keyof typeof DEVICE_SCHEMAS) {
  return listResultSchema(DEVICE_SCHEMAS[key]);
}
