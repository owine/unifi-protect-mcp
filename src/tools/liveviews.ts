import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";

export function registerLiveviewTools(
  server: McpServer,
  client: ProtectClient
) {
  server.tool(
    "protect_list_liveviews",
    "List all live views configured in UniFi Protect",
    {},
    async () => {
      try {
        const data = await client.get("/liveviews");
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "protect_get_liveview",
    "Get details for a specific live view by ID",
    { id: z.string().describe("Liveview ID") },
    async ({ id }) => {
      try {
        const data = await client.get(`/liveviews/${id}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "protect_create_liveview",
    "Create a new live view",
    {
      settings: z
        .record(z.unknown())
        .describe("Liveview configuration (JSON object with name, slots, etc.)"),
    },
    async ({ settings }) => {
      try {
        const data = await client.post("/liveviews", settings);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "protect_update_liveview",
    "Update an existing live view (partial update via PATCH)",
    {
      id: z.string().describe("Liveview ID"),
      settings: z
        .record(z.unknown())
        .describe("Partial liveview settings to update (JSON object)"),
    },
    async ({ id, settings }) => {
      try {
        const data = await client.patch(`/liveviews/${id}`, settings);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
