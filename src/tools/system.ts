import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";

export function registerSystemTools(
  server: McpServer,
  client: ProtectClient
) {
  server.tool(
    "protect_get_info",
    "Get UniFi Protect system information and version details",
    {},
    async () => {
      try {
        const data = await client.get("/meta/info");
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "protect_list_nvrs",
    "List all NVR (Network Video Recorder) devices",
    {},
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
