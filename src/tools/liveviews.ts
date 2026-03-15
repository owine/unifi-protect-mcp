import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY, WRITE, formatDryRun } from "../utils/safety.js";
import { safePath } from "../utils/url.js";

export function registerLiveviewTools(
  server: McpServer,
  client: ProtectClient,
  readOnly: boolean
) {
  server.registerTool(
    "protect_list_liveviews",
    {
      description: "List all live views configured in UniFi Protect",
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const data = await client.get("/liveviews");
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_get_liveview",
    {
      description: "Get details for a specific live view by ID",
      inputSchema: { id: z.string().describe("Liveview ID") },
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      try {
        const data = await client.get(safePath`/liveviews/${id}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  if (readOnly) return;

  server.registerTool(
    "protect_create_liveview",
    {
      description: "Create a new live view",
      inputSchema: {
        settings: z
          .record(z.string(), z.unknown())
          .describe("Liveview configuration. Required fields: id (string), modelKey (string, must be 'liveview'), owner (string, user ID), name (string), layout (number of slots), slots (array of {cameras: string[], cycleMode: string, cycleInterval: number}), isDefault (boolean), isGlobal (boolean)"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ settings, dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun("POST", "/liveviews", settings);
        }
        const data = await client.post("/liveviews", settings);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_update_liveview",
    {
      description: "Update an existing live view (full replacement via PUT-style PATCH — include all fields)",
      inputSchema: {
        id: z.string().describe("Liveview ID"),
        settings: z
          .record(z.string(), z.unknown())
          .describe("Full liveview object for update (all fields required). Known fields: id (string), modelKey (string, must be 'liveview'), owner (string, user ID), name (string), layout (number), slots (array of {cameras: string[], cycleMode: string, cycleInterval: number}), isDefault (boolean), isGlobal (boolean)"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ id, settings, dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun("PATCH", safePath`/liveviews/${id}`, settings);
        }
        const data = await client.patch(safePath`/liveviews/${id}`, settings);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
