import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY } from "../utils/safety.js";
import { infoOutputSchema, nvrOutputSchema } from "../schemas/misc.js";

export function registerSystemTools(
  server: McpServer,
  client: ProtectClient
) {
  server.registerTool(
    "protect_get_info",
    {
      description:
        "Get UniFi Protect application information. Returns: applicationVersion (string).",
      outputSchema: infoOutputSchema,
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
      description:
        "Get the NVR (Network Video Recorder) console info. NOTE: despite the name, the Protect Integration API's /nvrs endpoint returns a SINGLE NVR object, not an array. Returns: id, modelKey, name, doorbellSettings (defaultMessageText, defaultMessageResetTimeoutMs, customMessages[], customImages[]), armMode (status, armedAt, willBeArmedAt, breachDetectedAt, breachEventCount, breachTriggerEventId, breachEventId).",
      outputSchema: nvrOutputSchema,
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
