import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";

const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false } as const;
const WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false } as const;

export function registerLiveviewTools(
  server: McpServer,
  client: ProtectClient,
  readOnly: boolean
) {
  server.registerTool(
    "protect_list_liveviews",
    {
      description: "List all live views configured in UniFi Protect",
      annotations: READ_ONLY_ANNOTATIONS,
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
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const data = await client.get(`/liveviews/${id}`);
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
          .describe("Liveview configuration (JSON object with name, slots, etc.)"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ settings, dryRun }) => {
      try {
        if (dryRun) {
          return formatSuccess({ dryRun: true, action: "POST", path: "/liveviews", body: settings });
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
      description: "Update an existing live view (partial update via PATCH)",
      inputSchema: {
        id: z.string().describe("Liveview ID"),
        settings: z
          .record(z.string(), z.unknown())
          .describe("Partial liveview settings to update (JSON object)"),
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
          return formatSuccess({ dryRun: true, action: "PATCH", path: `/liveviews/${id}`, body: settings });
        }
        const data = await client.patch(`/liveviews/${id}`, settings);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
