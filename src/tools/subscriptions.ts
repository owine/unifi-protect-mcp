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

/**
 * Each device message carries a full device object, so a busy site can emit
 * enough in 30s to flood the MCP client's context. Stop listening at the cap.
 */
export const MAX_SUBSCRIPTION_MESSAGES = 200;

const MS_PER_SECOND = 1000;
/** The reported listen time is rounded to this many decimal places (0.1s). */
const ELAPSED_DECIMALS = 1;

interface CollectResult {
  messages: unknown[];
  duration: number;
  error?: string;
  truncated?: true;
}

function collectMessages(
  client: ProtectClient,
  path: string,
  duration: number
): Promise<CollectResult> {
  return new Promise((resolve) => {
    const messages: unknown[] = [];
    let error: string | undefined;
    let truncated = false;

    const startedAt = Date.now();
    const ws = client.connectWebSocket(path);

    const timeout = setTimeout(() => {
      ws.close();
    }, duration * MS_PER_SECOND);

    ws.on("message", (data: unknown) => {
      if (truncated) return;
      const text = String(data);
      try {
        messages.push(JSON.parse(text));
      } catch {
        messages.push(text);
      }
      if (messages.length >= MAX_SUBSCRIPTION_MESSAGES) {
        truncated = true;
        clearTimeout(timeout);
        ws.close();
      }
    });

    ws.on("error", (err: Error) => {
      error = err.message;
      clearTimeout(timeout);
      ws.close();
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      // Elapsed time, not the requested duration: the cap or an error can end
      // the listen early.
      const elapsed = Number(
        ((Date.now() - startedAt) / MS_PER_SECOND).toFixed(ELAPSED_DECIMALS)
      );
      const result: CollectResult = { messages, duration: elapsed };
      if (error) result.error = error;
      if (truncated) result.truncated = true;
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
        `Connect to the device update WebSocket and collect messages for a specified duration (1-30s). Returns {messages, duration, error?, truncated?}; stops early with truncated=true after ${MAX_SUBSCRIPTION_MESSAGES.toString()} messages. Each message is an envelope {type, item} where item is a device resource carrying id and modelKey (camera, light, sensor, nvr, …). The 7.3.70 docs show type 'add' with the full device object as item; other message types and whether updates carry only changed fields are not documented — inspect the captured messages. Use to detect device state changes or newly adopted devices.`,
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
        `Connect to the Protect event WebSocket and collect messages for a specified duration (1-30s). Returns {messages, duration, error?, truncated?}; stops early with truncated=true after ${MAX_SUBSCRIPTION_MESSAGES.toString()} messages. Each message is an envelope {type: 'add' | 'update', item: {id, modelKey: 'event', type (event kind, e.g. 'ring'), start, end (epoch ms), device (ID of the camera/sensor that raised it)}} (7.3.70 docs). The full set of event kinds and any further event fields are not documented — inspect the captured messages.`,
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
