import type { ToolRegistrar } from "./registrar.js";
import { ProtectClient } from "../client.js";
import { formatSuccess } from "../utils/responses.js";
import { READ_ONLY } from "../utils/safety.js";
import { infoOutputSchema, nvrOutputSchema } from "../schemas/misc.js";

export function registerSystemTools(
  server: ToolRegistrar,
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
      const data = await client.get("/meta/info");
      return formatSuccess(data);
    }
  );

  server.registerTool(
    "protect_list_nvrs",
    {
      description:
        "Get the NVR (Network Video Recorder) console info. NOTE: despite the name, the Protect Integration API's /nvrs endpoint returns a SINGLE NVR object, not an array. Returns: id, modelKey, name, type (e.g. UNVR-PRO), guid, mac, doorbellSettings (defaultMessageText, defaultMessageResetTimeoutMs, customMessages[], customImages[] (preview, sprite)), armMode (status, armProfileId, armedAt, willBeArmedAt, breachDetectedAt, breachEventCount, breachTriggerEventId, breachEventId).",
      outputSchema: nvrOutputSchema,
      annotations: READ_ONLY,
    },
    async () => {
      const data = await client.get("/nvrs");
      return formatSuccess(data);
    }
  );
}
