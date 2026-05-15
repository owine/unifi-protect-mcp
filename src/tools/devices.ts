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

const DEVICES: DeviceConfig[] = [
  {
    urlPath: "lights",
    singular: "light",
    plural: "lights",
    label: "Light",
    hint: "Known fields: name (string), isLightForceEnabled (boolean), lightModeSettings (object with mode, enableAt), lightDeviceSettings (object with isIndicatorEnabled, pirDuration, pirSensitivity, ledLevel)",
    returns:
      "id, modelKey, name, mac, state (universal identity fields). Protect Integration API 7.1.60 returns a thin object; additional device-specific fields are NOT verified (no instances on reference console) — inspect a live response before relying on them",
  },
  {
    urlPath: "sensors",
    singular: "sensor",
    plural: "sensors",
    label: "Sensor",
    hint: "Known fields: name (string), motionSettings (object), humiditySettings (object), temperatureSettings (object), lightSettings (object), alarmSettings (object)",
    returns:
      "id, modelKey, name, mac, state (universal identity fields). Protect Integration API 7.1.60 returns a thin object; additional device-specific fields are NOT verified (no instances on reference console) — inspect a live response before relying on them",
  },
  {
    urlPath: "chimes",
    singular: "chime",
    plural: "chimes",
    label: "Chime",
    hint: "Known fields: name (string), cameraIds (array of camera IDs linked to the chime), ringSettings (array of ring tone configurations)",
    returns:
      "id, modelKey, name, mac, state (universal identity fields). Protect Integration API 7.1.60 returns a thin object; additional device-specific fields are NOT verified (no instances on reference console) — inspect a live response before relying on them",
  },
  {
    urlPath: "viewers",
    singular: "viewer",
    plural: "viewers",
    label: "Viewer",
    hint: "Known fields: name (string), liveview (string, liveview ID to display)",
    returns:
      "id, modelKey, name, mac, state (universal identity fields). Protect Integration API 7.1.60 returns a thin object; additional device-specific fields are NOT verified (no instances on reference console) — inspect a live response before relying on them",
  },
  {
    urlPath: "sirens",
    singular: "siren",
    plural: "sirens",
    label: "Siren",
    hint: "Known fields: name (string), volume (integer 1-100), ledSettings (object with isEnabled boolean)",
    returns:
      "id, modelKey, name, mac, state (universal identity fields). Protect Integration API 7.1.60 returns a thin object; additional device-specific fields are NOT verified (no instances on reference console) — inspect a live response before relying on them",
  },
  {
    urlPath: "fobs",
    singular: "fob",
    plural: "fobs",
    label: "Fob",
    hint: "Known fields: name (string)",
    returns:
      "id, modelKey, name, mac, state (universal identity fields). Protect Integration API 7.1.60 returns a thin object; additional device-specific fields are NOT verified (no instances on reference console) — inspect a live response before relying on them",
  },
  {
    urlPath: "relays",
    singular: "relay",
    plural: "relays",
    label: "Relay",
    hint: "Known fields: name (string), ledSettings (object with isEnabled boolean)",
    returns:
      "id, modelKey, name, mac, state (universal identity fields). Protect Integration API 7.1.60 returns a thin object; additional device-specific fields are NOT verified (no instances on reference console) — inspect a live response before relying on them",
  },
  {
    urlPath: "speakers",
    singular: "speaker",
    plural: "speakers",
    label: "Speaker",
    hint: "Known fields: name (string), volume (integer 0-100), micVolume (integer 0-100), isMicEnabled (boolean)",
    returns:
      "id, modelKey, name, mac, state (universal identity fields). Protect Integration API 7.1.60 returns a thin object; additional device-specific fields are NOT verified (no instances on reference console) — inspect a live response before relying on them",
  },
  {
    urlPath: "bridges",
    singular: "bridge",
    plural: "bridges",
    label: "Bridge",
    hint: "Known fields: name (string)",
    returns:
      "id, modelKey, name, mac, state (universal identity fields). Protect Integration API 7.1.60 returns a thin object; additional device-specific fields are NOT verified (no instances on reference console) — inspect a live response before relying on them",
  },
  {
    urlPath: "link-stations",
    singular: "link_station",
    plural: "link_stations",
    label: "Link station",
    hint: "Known fields: name (string)",
    returns:
      "id, modelKey, name, mac, state (universal identity fields). Protect Integration API 7.1.60 returns a thin object; additional device-specific fields are NOT verified (no instances on reference console) — inspect a live response before relying on them",
  },
  {
    urlPath: "alarm-hubs",
    singular: "alarm_hub",
    plural: "alarm_hubs",
    label: "Alarm hub",
    hint: "Known fields: name (string)",
    returns:
      "id, modelKey, name, mac, state (universal identity fields). Protect Integration API 7.1.60 returns a thin object; additional device-specific fields are NOT verified (no instances on reference console) — inspect a live response before relying on them",
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
