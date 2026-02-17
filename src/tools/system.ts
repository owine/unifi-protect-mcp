import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY } from "../utils/safety.js";

export function registerSystemTools(
  server: McpServer,
  client: ProtectClient
) {
  server.registerTool(
    "protect_get_info",
    {
      description: "Get UniFi Protect system information and version details",
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const data = await client.get("/meta/info");
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_list_nvrs",
    {
      description: "List all NVR (Network Video Recorder) devices",
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const data = await client.get("/nvrs");
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
