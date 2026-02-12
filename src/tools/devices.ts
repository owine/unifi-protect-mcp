import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";

const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false } as const;
const WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false } as const;

type DeviceType = "light" | "sensor" | "chime" | "viewer";

const settingsHints: Record<DeviceType, string> = {
  light: "Known fields: name (string), isLightForceEnabled (boolean), lightModeSettings (object with mode, enableAt), lightDeviceSettings (object with isIndicatorEnabled, pirDuration, pirSensitivity, ledLevel)",
  sensor: "Known fields: name (string), mountType (string), motionSettings (object), humiditySettings (object), temperatureSettings (object), lightSettings (object), alarmSettings (object)",
  chime: "Known fields: name (string), volume (number), ringSettings (array of ring tone configurations)",
  viewer: "Known fields: name (string), liveview (string, liveview ID to display)",
};

function registerDeviceCrud(
  server: McpServer,
  client: ProtectClient,
  deviceType: DeviceType,
  readOnly: boolean
) {
  const plural = `${deviceType}s`;
  const label = deviceType.charAt(0).toUpperCase() + deviceType.slice(1);

  server.registerTool(
    `protect_list_${plural}`,
    {
      description: `List all ${plural} managed by UniFi Protect`,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () => {
      try {
        const data = await client.get(`/${plural}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    `protect_get_${deviceType}`,
    {
      description: `Get details for a specific ${deviceType} by ID`,
      inputSchema: { id: z.string().describe(`${label} ID`) },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const data = await client.get(`/${plural}/${id}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (!readOnly) {
    server.registerTool(
      `protect_update_${deviceType}`,
      {
        description: `Update ${deviceType} settings (partial update via PATCH)`,
        inputSchema: {
          id: z.string().describe(`${label} ID`),
          settings: z
            .record(z.string(), z.unknown())
            .describe(`Partial ${deviceType} settings to update. ${settingsHints[deviceType]}`),
          dryRun: z
            .boolean()
            .optional()
            .describe("If true, return what would happen without making changes"),
        },
        annotations: WRITE_ANNOTATIONS,
      },
      async ({ id, settings, dryRun }) => {
        try {
          if (dryRun) {
            return formatSuccess({ dryRun: true, action: "PATCH", path: `/${plural}/${id}`, body: settings });
          }
          const data = await client.patch(`/${plural}/${id}`, settings);
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
  const deviceTypes: DeviceType[] = ["light", "sensor", "chime", "viewer"];
  for (const dt of deviceTypes) {
    registerDeviceCrud(server, client, dt, readOnly);
  }
}
