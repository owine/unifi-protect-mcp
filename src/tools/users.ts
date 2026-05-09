import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY } from "../utils/safety.js";
import { safePath } from "../utils/url.js";

export function registerUserTools(server: McpServer, client: ProtectClient) {
  server.registerTool(
    "protect_list_users",
    {
      description: "List all Protect users. Filtered by access permissions.",
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const data = await client.get("/users");
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_get_user",
    {
      description: "Get details for a specific Protect user by ID",
      inputSchema: { id: z.string().describe("User ID") },
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      try {
        const data = await client.get(safePath`/users/${id}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_list_ulp_users",
    {
      description: "List all UniFi Identity (ULP) users with enrolled credentials (NFC cards, fingerprints).",
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const data = await client.get("/ulp-users");
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_get_ulp_user",
    {
      description: "Get details for a specific UniFi Identity (ULP) user by ID",
      inputSchema: { id: z.string().describe("ULP user ID") },
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      try {
        const data = await client.get(safePath`/ulp-users/${id}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
