import { z } from "zod";
import type { ToolRegistrar } from "./registrar.js";
import { ProtectClient } from "../client.js";
import { formatSuccess } from "../utils/responses.js";
import { READ_ONLY, DESTRUCTIVE, formatDryRun, confirmInput, requireConfirmationForFields, dryRunInput } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
import { PAGING_NOTE, pageOf, pagingInput } from "../utils/paging.js";
import { resourceId } from "../utils/params.js";
import {
  DEVICE_SCHEMAS,
  itemOutputShape,
  listOutputShape,
} from "../schemas/devices.js";

interface DeviceConfig {
  urlPath: string;   // URL segment (may contain hyphens, e.g. "link-stations")
  // Tool-name singular (snake_case, e.g. "link_station"); also the key of its
  // output schema, so a name with no schema fails to compile.
  singular: keyof typeof DEVICE_SCHEMAS;
  plural: string;    // Tool-name plural (snake_case, e.g. "link_stations")
  label: string;     // Human-readable label, e.g. "Link station"
  hint: string;      // Description of patchable fields (for PATCH tools)
  returns: string;   // Description of fields returned by GET tools (for LLM context)
  note?: string;     // Extra context prepended to list/get descriptions
  // Settings that weaken alarm coverage: an update touching any of them needs
  // confirm: true (a dry run does not).
  confirmFields?: readonly string[];
}

// Field lists below are from the UniFi Protect Integration API 7.3.70 docs.
// 7.3.x added `type` (hardware model name) and `guid` to every device. NOTE:
// `guid` identifies the hardware MODEL, not the unit — every camera of the same
// model returns the same guid (verified live 7.3.47 and 7.3.70). `id` is the
// device identity.
// Chimes are additionally verified against live console responses; the rest
// have no instances on the available console (top-level fields documented,
// nested shapes intentionally left opaque in the output schema).
const DEVICES: DeviceConfig[] = [
  {
    urlPath: "lights",
    singular: "light",
    plural: "lights",
    label: "Light",
    hint: "Known fields: name (string), isLightForceEnabled (boolean), lightModeSettings (object with mode, enableAt), lightDeviceSettings (object with isIndicatorEnabled, pirDuration, pirSensitivity, ledLevel)",
    returns:
      "id, modelKey, name, mac, state, type, guid, lightModeSettings (mode, enableAt), lightDeviceSettings (isIndicatorEnabled, pirDuration, pirSensitivity, ledLevel), isDark, isLightOn, isLightForceEnabled, lastMotion, isPirMotionDetected, camera (7.3.70 docs)",
  },
  {
    urlPath: "sensors",
    singular: "sensor",
    confirmFields: ["alarmSettings", "motionSettings", "glassBreakSettings", "armProfileIds", "scheduleMode"],
    plural: "sensors",
    label: "Sensor",
    hint: "Known fields: name (string), lightSettings / humiditySettings / temperatureSettings (objects: isEnabled, margin, lowThreshold, highThreshold), motionSettings / glassBreakSettings (objects: isEnabled, sensitivity, sensitivityWhenArmed), alarmSettings (object: isEnabled), scheduleMode (\"always\" | \"when_armed\"), armProfileIds (array of up to 32 strings, or null), hasCustomSensitivityWhenArmed (boolean). leakSettings is read-only. Returns HTTP 409 if a setting is not supported by this sensor",
    returns:
      "id, modelKey, name, mac, state, type, guid, mountType, featureFlags (temperature, humidity, light, motion, waterLeak, open, tamper, smoke — each {channelCount}), batteryStatus (percentage, isLow), stats (light, humidity, temperature — each {value, status}), lightSettings / humiditySettings / temperatureSettings (isEnabled, margin, lowThreshold, highThreshold), isOpened, openStatusChangedAt, isMotionDetected, motionDetectedAt, motionSettings / glassBreakSettings (isEnabled, sensitivity, sensitivityWhenArmed), scheduleMode, armProfileIds, hasCustomSensitivityWhenArmed, alarmTriggeredAt, alarmSettings, leakDetectedAt, externalLeakDetectedAt, leakSettings (isInternalEnabled, isExternalEnabled), tamperingDetectedAt, wirelessConnectionState (signalState: signalQuality, signalStrength; batteryStatus: percentage, isLow; bridge) (7.3.70 docs)",
  },
  {
    urlPath: "chimes",
    singular: "chime",
    plural: "chimes",
    label: "Chime",
    hint: "Known fields: name (string), cameraIds (array of doorbell camera IDs linked to the chime), ringSettings (array of objects: cameraId, volume, ringtoneId, repeatTimes)",
    returns:
      "id, modelKey, name, mac, state, type, guid, cameraIds (array of camera IDs), ringSettings (array of objects: cameraId, volume, ringtoneId, repeatTimes) — verified live 7.3.70",
  },
  {
    urlPath: "viewers",
    singular: "viewer",
    plural: "viewers",
    label: "Viewer",
    hint: "Known fields: name (string), liveview (string, liveview ID to display, or null)",
    returns: "id, modelKey, name, mac, state, type, guid, liveview, streamLimit (7.3.70 docs)",
  },
  {
    urlPath: "sirens",
    singular: "siren",
    plural: "sirens",
    label: "Siren",
    hint: "Known fields: name (string), volume (integer 1-100), ledSettings (object with isEnabled boolean)",
    returns:
      "id, modelKey, name, mac, state, type, guid, volume, ledSettings (isEnabled), sirenStatus (isActive, activatedAt, duration), connectionType, wirelessConnectionState (signalState: signalQuality, signalStrength; batteryStatus: percentage, isLow; bridge) (7.3.70 docs)",
  },
  {
    urlPath: "fobs",
    singular: "fob",
    confirmFields: ["armControlSettings"],
    plural: "fobs",
    label: "Fob",
    hint: "Known fields: name (string). armControlSettings is not documented as patchable; sending it requires confirm: true",
    returns:
      "id, modelKey, name, mac, state, type, guid, awayState, buttonLabels, featureFlags (buttons[], hasKeypad), armControlSettings (enabled, armProfileId, nightProfileId), keypadSettings (beepEnabled, beepVolume), wirelessConnectionState (signalState: signalQuality, signalStrength; batteryStatus: percentage, isLow; bridge) (7.3.70 docs)",
  },
  {
    urlPath: "relays",
    singular: "relay",
    plural: "relays",
    label: "Relay",
    hint: "Known fields: name (string), ledSettings (object with isEnabled boolean)",
    returns:
      "id, modelKey, name, mac, state, type, guid, ledSettings (isEnabled), outputs (array of objects: id, name, type, delay, pulseDuration, state, rebootState — id is the outputId for protect_activate_relay_output), inputs (array of objects: id, name, state, actionTrigger, actionType, actionOutputId), wirelessConnectionState (signalState: signalQuality, signalStrength; batteryStatus: percentage, isLow; bridge) (7.3.70 docs)",
  },
  {
    urlPath: "speakers",
    singular: "speaker",
    plural: "speakers",
    label: "Speaker",
    hint: "Known fields: name (string), volume (integer 0-100), micVolume (integer 0-100), isMicEnabled (boolean)",
    returns:
      "id, modelKey, name, mac, state, type, guid, volume, micVolume, isMicEnabled, speakerState (status, mode), featureFlags (hasMic) (7.3.70 docs)",
  },
  {
    urlPath: "bridges",
    singular: "bridge",
    plural: "bridges",
    label: "Bridge",
    hint: "Known fields: name (string)",
    returns:
      "id, modelKey, name, mac, state, type, guid, platform, clients (array of MACs), maxClients (7.3.70 docs)",
  },
  {
    urlPath: "link-stations",
    singular: "link_station",
    plural: "link_stations",
    label: "Link station",
    note: "Link stations are non-alarm-hub gateways (use protect_list_alarm_hubs for alarm hubs).",
    hint: "Known fields: name (string)",
    returns:
      "id, modelKey (\"linkstation\"), name, mac, state, type, guid, isAlarmHub, ledSettings (isEnabled), lastEvent, alarmHub (armed, battery, buckboost, connector, cover, deviceTamperStatus (e.g. \"tampered\"), currentMeterChannelStatus, currentMeterStatus, inputPower, poeout, powerMeter, output and input (maps keyed by channel), inputTerminalStatus, outputTerminalStatus, emergencyTerminalStatus, auxiliaryPowerTerminalStatus), threadState (network: status, role, networkName, channel, panId, extendedPanId, joinedDeviceCount, errorReason, lastUpdatedAt) (7.3.70 docs)",
  },
  {
    urlPath: "alarm-hubs",
    singular: "alarm_hub",
    plural: "alarm_hubs",
    label: "Alarm hub",
    hint: "Known fields: name (string)",
    returns:
      "id, modelKey (\"linkstation\"), name, mac, state, type, guid, isAlarmHub, ledSettings (isEnabled), lastEvent, alarmHub (armed, battery, buckboost, connector, cover, deviceTamperStatus (e.g. \"tampered\"), currentMeterChannelStatus, currentMeterStatus, inputPower, poeout, powerMeter, output and input (maps keyed by channel), inputTerminalStatus, outputTerminalStatus, emergencyTerminalStatus, auxiliaryPowerTerminalStatus), threadState (network: status, role, networkName, channel, panId, extendedPanId, joinedDeviceCount, errorReason, lastUpdatedAt) (7.3.70 docs)",
  },
];

function registerDeviceCrud(
  server: ToolRegistrar,
  client: ProtectClient,
  cfg: DeviceConfig,
  readOnly: boolean
) {
  const schemaKey = cfg.singular;
  const note = cfg.note ? `${cfg.note} ` : "";
  server.registerTool(
    `protect_list_${cfg.plural}`,
    {
      description: `List all ${cfg.label.toLowerCase()}s managed by UniFi Protect. ${note}Returns array; each ${cfg.label.toLowerCase()} includes: ${cfg.returns}.${PAGING_NOTE}`,
      inputSchema: pagingInput,
      outputSchema: listOutputShape(schemaKey),
      annotations: READ_ONLY,
    },
    async ({ limit, offset }) => {
      const data = await client.get(`/${cfg.urlPath}`);
      return formatSuccess(pageOf(data, limit, offset));
    }
  );

  server.registerTool(
    `protect_get_${cfg.singular}`,
    {
      description: `Get full details for a specific ${cfg.label.toLowerCase()} by ID. ${note}Returns: ${cfg.returns}.`,
      inputSchema: { id: resourceId().describe(`${cfg.label} ID`) },
      outputSchema: itemOutputShape(schemaKey),
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const data = await client.get(safePath`/${cfg.urlPath}/${id}`);
      return formatSuccess(data);
    }
  );

  if (!readOnly) {
    server.registerTool(
      `protect_update_${cfg.singular}`,
      {
        description: `Update ${cfg.label.toLowerCase()} settings (partial update via PATCH).${
          cfg.confirmFields ? ` Changing ${cfg.confirmFields.join(", ")} affects alarm coverage and requires confirm: true.` : ""
        }`,
        inputSchema: {
          id: resourceId().describe(`${cfg.label} ID`),
          settings: z
            .record(z.string(), z.unknown())
            .refine((o) => Object.keys(o).length > 0, "settings must include at least one field")
            .describe(`Partial ${cfg.label.toLowerCase()} settings to update. ${cfg.hint}`),
          ...(cfg.confirmFields
            ? { confirm: confirmInput(`change ${cfg.confirmFields.join(", ")}`) }
            : {}),
          dryRun: dryRunInput(),
        },
        outputSchema: itemOutputShape(schemaKey),
        annotations: DESTRUCTIVE,
      },
      async ({ id, settings, dryRun, confirm }) => {
        if (dryRun) {
          return formatDryRun("PATCH", safePath`/${cfg.urlPath}/${id}`, settings);
        }
        const denied = requireConfirmationForFields(settings, cfg.confirmFields ?? [], confirm);
        if (denied) return denied;
        const data = await client.patch(safePath`/${cfg.urlPath}/${id}`, settings);
        return formatSuccess(data);
      }
    );
  }
}

export function registerDeviceTools(
  server: ToolRegistrar,
  client: ProtectClient,
  readOnly: boolean
) {
  for (const cfg of DEVICES) {
    registerDeviceCrud(server, client, cfg, readOnly);
  }
}

/** Exported for tests */
export const _DEVICE_CONFIGS = DEVICES;
