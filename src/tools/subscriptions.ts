import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY } from "../utils/safety.js";
import { subscriptionOutputSchema } from "../schemas/misc.js";

const durationSchema = z
  .number()
  .min(1)
  .max(30)
  .default(5)
  .describe("Seconds to listen (1-30, default 5)");

function collectMessages(
  client: ProtectClient,
  path: string,
  duration: number
): Promise<{ messages: unknown[]; duration: number; error?: string }> {
  return new Promise((resolve) => {
    const messages: unknown[] = [];
    let error: string | undefined;

    const ws = client.connectWebSocket(path);

    const timeout = setTimeout(() => {
      ws.close();
    }, duration * 1000);

    ws.on("message", (data: unknown) => {
      const text = String(data);
      try {
        messages.push(JSON.parse(text));
      } catch {
        messages.push(text);
      }
    });

    ws.on("error", (err: Error) => {
      error = err.message;
      clearTimeout(timeout);
      ws.close();
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      const result: { messages: unknown[]; duration: number; error?: string } =
        { messages, duration };
      if (error) result.error = error;
      resolve(result);
    });
  });
}

export function registerSubscriptionTools(
  server: McpServer,
  client: ProtectClient
) {
  server.registerTool(
    "protect_subscribe_devices",
    {
      description:
        "Connect to the device update WebSocket and collect messages for a specified duration (1-30s). Returns {messages, duration, error?}; each message has {type: 'add'|'update'|'remove', modelKey: 'camera'|'light'|'sensor'|..., id, payload: partial device fields that changed}. Use to detect state changes like isRecording flipping, battery drops, or new devices being adopted — fields delivered are only those that changed, not the full device object.",
      inputSchema: { duration: durationSchema },
      outputSchema: subscriptionOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ duration }) => {
      try {
        const data = await collectMessages(
          client,
          "/subscribe/devices",
          duration
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_subscribe_events",
    {
      description:
        "Connect to the Protect event WebSocket and collect messages for a specified duration (1-30s). Returns {messages, duration, error?}; each event message includes: id, type ('motion' | 'ring' | 'smartDetectZone' | 'smartDetectLine' | 'sensorMotion' | 'sensorAlarm' | 'fingerprint' | 'nfcCard' | ...), start, end (null while ongoing), camera/sensor id, score, smartDetectTypes (['person','vehicle','animal','package','license_plate','face']), metadata (e.g. detected license plate text, NFC card id, fingerprint id, ULP user match).",
      inputSchema: { duration: durationSchema },
      outputSchema: subscriptionOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ duration }) => {
      try {
        const data = await collectMessages(
          client,
          "/subscribe/events",
          duration
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
