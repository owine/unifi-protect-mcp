import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";

type DeviceType = "light" | "sensor" | "chime" | "viewer";

function registerDeviceCrud(
  server: McpServer,
  client: ProtectClient,
  deviceType: DeviceType
) {
  const plural = `${deviceType}s`;
  const label = deviceType.charAt(0).toUpperCase() + deviceType.slice(1);

  server.tool(
    `protect_list_${plural}`,
    `List all ${plural} managed by UniFi Protect`,
    {},
    async () => {
      try {
        const data = await client.get(`/${plural}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    `protect_get_${deviceType}`,
    `Get details for a specific ${deviceType} by ID`,
    { id: z.string().describe(`${label} ID`) },
    async ({ id }) => {
      try {
        const data = await client.get(`/${plural}/${id}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    `protect_update_${deviceType}`,
    `Update ${deviceType} settings (partial update via PATCH)`,
    {
      id: z.string().describe(`${label} ID`),
      settings: z
        .record(z.unknown())
        .describe(`Partial ${deviceType} settings to update (JSON object)`),
    },
    async ({ id, settings }) => {
      try {
        const data = await client.patch(`/${plural}/${id}`, settings);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}

export function registerDeviceTools(
  server: McpServer,
  client: ProtectClient
) {
  const deviceTypes: DeviceType[] = ["light", "sensor", "chime", "viewer"];
  for (const dt of deviceTypes) {
    registerDeviceCrud(server, client, dt);
  }
}
