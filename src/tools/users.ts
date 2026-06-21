import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
import {
  userListOutputSchema,
  userOutputSchema,
  ulpUserListOutputSchema,
  ulpUserOutputSchema,
} from "../schemas/misc.js";

export function registerUserTools(server: McpServer, client: ProtectClient) {
  server.registerTool(
    "protect_list_users",
    {
      description:
        "List all Protect users (filtered by the API key's access permissions). Returns array; each user includes (Integration API 7.1.83-verified): id, modelKey, name, firstName, lastName, email, ucoreUserId. The Integration API does NOT expose roles, permissions, login history, groups, or notification settings.",
      outputSchema: userListOutputSchema,
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
      description:
        "Get details for a specific Protect user by ID. Returns the same fields as protect_list_users entries: id, modelKey, name, firstName, lastName, email, ucoreUserId.",
      inputSchema: { id: z.string().describe("User ID") },
      outputSchema: userOutputSchema,
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
      description:
        "List all UniFi Identity (ULP) users. Returns array; each ULP user includes (Integration API 7.1.83-verified): id, modelKey, firstName, lastName, fullName, status (e.g. ACTIVE). Enrolled-credential detail (NFC cards, fingerprints) is NOT exposed by this API surface.",
      outputSchema: ulpUserListOutputSchema,
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
      description:
        "Get details for a specific UniFi Identity (ULP) user by ID. Returns: id, modelKey, firstName, lastName, fullName, status.",
      inputSchema: { id: z.string().describe("ULP user ID") },
      outputSchema: ulpUserOutputSchema,
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
