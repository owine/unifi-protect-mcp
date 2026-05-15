import {
  idField,
  listResultSchema,
  nullableString,
  passthroughObject,
} from "./common.js";

/**
 * UNVERIFIED DOMAINS.
 *
 * The verification console (Protect 7.1.60) has zero instances of any of these
 * device types (lights, sensors, chimes, viewers, sirens, fobs, relays,
 * speakers, bridges, link-stations, alarm-hubs), so their real Integration API
 * response shapes could not be observed.
 *
 * Per the unifi-api-update skill's "soften unverifiable claims" rule, we do NOT
 * assert device-specific field lists here. The schema only types the universal
 * identity fields seen consistently across every *verified* Protect resource
 * (camera, nvr, user): id, modelKey, name, mac, state. `.passthrough()` lets
 * every real (unverified) field through without rejection.
 *
 * When a console with these devices is available, capture live samples and
 * tighten these per the skill (Step 4/5).
 */

const unverifiedDeviceSchema = () =>
  passthroughObject({
    id: idField("Device ID"),
    modelKey: nullableString("Resource kind"),
    name: nullableString("Device name"),
    mac: nullableString("MAC address"),
    state: nullableString("CONNECTED | DISCONNECTED | ..."),
  });

export const lightSchema = unverifiedDeviceSchema();
export const sensorSchema = unverifiedDeviceSchema();
export const chimeSchema = unverifiedDeviceSchema();
export const viewerSchema = unverifiedDeviceSchema();
export const sirenSchema = unverifiedDeviceSchema();
export const fobSchema = unverifiedDeviceSchema();
export const relaySchema = unverifiedDeviceSchema();
export const speakerSchema = unverifiedDeviceSchema();
export const bridgeSchema = unverifiedDeviceSchema();
export const linkStationSchema = unverifiedDeviceSchema();
export const alarmHubSchema = unverifiedDeviceSchema();

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
