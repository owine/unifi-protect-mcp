import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY, WRITE, formatDryRun } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
import {
  DEVICE_SCHEMAS,
  itemOutputShape,
  listOutputShape,
} from "../schemas/devices.js";

interface DeviceConfig {
  urlPath: string;   // URL segment (may contain hyphens, e.g. "link-stations")
  singular: string;  // Tool-name singular (snake_case, e.g. "link_station")
  plural: string;    // Tool-name plural (snake_case, e.g. "link_stations")
  label: string;     // Human-readable label, e.g. "Link station"
  hint: string;      // Description of patchable fields (for PATCH tools)
  returns: string;   // Description of fields returned by GET tools (for LLM context)
}

// Field lists below are from the UniFi Protect Integration API 7.1.83 docs.
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
      "id, modelKey, name, mac, state, lightModeSettings (mode, enableAt), lightDeviceSettings (isIndicatorEnabled, pirDuration, pirSensitivity, ledLevel), isDark, isLightOn, isLightForceEnabled, lastMotion, isPirMotionDetected, camera (7.1.83 docs)",
  },
  {
    urlPath: "sensors",
    singular: "sensor",
    plural: "sensors",
    label: "Sensor",
    hint: "Known fields: name (string), motionSettings (object), humiditySettings (object), temperatureSettings (object), lightSettings (object), alarmSettings (object), glassBreakSettings (object), leakSettings (object), scheduleMode (\"always\" | \"when_armed\"), armProfileIds (array of up to 32 strings), hasCustomSensitivityWhenArmed (boolean)",
    returns:
      "id, modelKey, name, mac, state, mountType, batteryStatus (percentage, isLow), stats (light, humidity, temperature), lightSettings, humiditySettings, temperatureSettings, isOpened, openStatusChangedAt, isMotionDetected, motionDetectedAt, motionSettings, glassBreakSettings, scheduleMode, armProfileIds, hasCustomSensitivityWhenArmed, alarmTriggeredAt, alarmSettings, leakDetectedAt, externalLeakDetectedAt, leakSettings, tamperingDetectedAt, wirelessConnectionState (7.1.83 docs)",
  },
  {
    urlPath: "chimes",
    singular: "chime",
    plural: "chimes",
    label: "Chime",
    hint: "Known fields: name (string), cameraIds (array of camera IDs linked to the chime), ringSettings (array of objects: cameraId, volume, ringtoneId, repeatTimes)",
    returns:
      "id, modelKey, name, mac, state, cameraIds (array of camera IDs), ringSettings (array of objects: cameraId, volume, ringtoneId, repeatTimes) — verified live 7.1.83",
  },
  {
    urlPath: "viewers",
    singular: "viewer",
    plural: "viewers",
    label: "Viewer",
    hint: "Known fields: name (string), liveview (string, liveview ID to display, or null)",
    returns: "id, modelKey, name, mac, state, liveview, streamLimit (7.1.83 docs)",
  },
  {
    urlPath: "sirens",
    singular: "siren",
    plural: "sirens",
    label: "Siren",
    hint: "Known fields: name (string), volume (integer 1-100), ledSettings (object with isEnabled boolean)",
    returns:
      "id, modelKey, name, mac, state, volume, ledSettings (isEnabled), sirenStatus (isActive, activatedAt, duration), connectionType, wirelessConnectionState (7.1.83 docs)",
  },
  {
    urlPath: "fobs",
    singular: "fob",
    plural: "fobs",
    label: "Fob",
    hint: "Known fields: name (string)",
    returns:
      "id, modelKey, name, mac, state, awayState, buttonLabels, featureFlags (buttons[]), wirelessConnectionState (7.1.83 docs)",
  },
  {
    urlPath: "relays",
    singular: "relay",
    plural: "relays",
    label: "Relay",
    hint: "Known fields: name (string), ledSettings (object with isEnabled boolean)",
    returns:
      "id, modelKey, name, mac, state, ledSettings (isEnabled), outputs (array), inputs (array), wirelessConnectionState (7.1.83 docs)",
  },
  {
    urlPath: "speakers",
    singular: "speaker",
    plural: "speakers",
    label: "Speaker",
    hint: "Known fields: name (string), volume (integer 0-100), micVolume (integer 0-100), isMicEnabled (boolean)",
    returns:
      "id, modelKey, name, mac, state, volume, micVolume, isMicEnabled, speakerState (status, mode), featureFlags (hasMic) (7.1.83 docs)",
  },
  {
    urlPath: "bridges",
    singular: "bridge",
    plural: "bridges",
    label: "Bridge",
    hint: "Known fields: name (string)",
    returns:
      "id, modelKey, name, mac, state, platform, clients (array of MACs), maxClients (7.1.83 docs)",
  },
  {
    urlPath: "link-stations",
    singular: "link_station",
    plural: "link_stations",
    label: "Link station",
    hint: "Known fields: name (string)",
    returns:
      "id, modelKey (\"linkstation\"), name, mac, state, isAlarmHub, ledSettings (isEnabled), lastEvent, alarmHub (object) (7.1.83 docs)",
  },
  {
    urlPath: "alarm-hubs",
    singular: "alarm_hub",
    plural: "alarm_hubs",
    label: "Alarm hub",
    hint: "Known fields: name (string)",
    returns:
      "id, modelKey (\"linkstation\"), name, mac, state, isAlarmHub, ledSettings (isEnabled), lastEvent, alarmHub (object) (7.1.83 docs)",
  },
];

function registerDeviceCrud(
  server: McpServer,
  client: ProtectClient,
  cfg: DeviceConfig,
  readOnly: boolean
) {
  const schemaKey = cfg.singular as keyof typeof DEVICE_SCHEMAS;
  server.registerTool(
    `protect_list_${cfg.plural}`,
    {
      description: `List all ${cfg.label.toLowerCase()}s managed by UniFi Protect. Returns array; each ${cfg.label.toLowerCase()} includes: ${cfg.returns}.`,
      outputSchema: listOutputShape(schemaKey),
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const data = await client.get(`/${cfg.urlPath}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    `protect_get_${cfg.singular}`,
    {
      description: `Get full details for a specific ${cfg.label.toLowerCase()} by ID. Returns: ${cfg.returns}.`,
      inputSchema: { id: z.string().describe(`${cfg.label} ID`) },
      outputSchema: itemOutputShape(schemaKey),
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      try {
        const data = await client.get(safePath`/${cfg.urlPath}/${id}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (!readOnly) {
    server.registerTool(
      `protect_update_${cfg.singular}`,
      {
        description: `Update ${cfg.label.toLowerCase()} settings (partial update via PATCH)`,
        inputSchema: {
          id: z.string().describe(`${cfg.label} ID`),
          settings: z
            .record(z.string(), z.unknown())
            .describe(`Partial ${cfg.label.toLowerCase()} settings to update. ${cfg.hint}`),
          dryRun: z
            .boolean()
            .optional()
            .describe("If true, return what would happen without making changes"),
        },
        outputSchema: itemOutputShape(schemaKey),
        annotations: WRITE,
      },
      async ({ id, settings, dryRun }) => {
        try {
          if (dryRun) {
            return formatDryRun("PATCH", safePath`/${cfg.urlPath}/${id}`, settings);
          }
          const data = await client.patch(safePath`/${cfg.urlPath}/${id}`, settings);
          return formatSuccess(data);
        } catch (err) {
          return formatError(err);
        }
      }
    );
  }
}

export function registerDeviceTools(
  server: McpServer,
  client: ProtectClient,
  readOnly: boolean
) {
  for (const cfg of DEVICES) {
    registerDeviceCrud(server, client, cfg, readOnly);
  }
}

/** Exported for tests */
export const _DEVICE_CONFIGS = DEVICES;
