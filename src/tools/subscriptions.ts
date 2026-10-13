import type { ToolRegistrar } from "./registrar.js";
import { z } from "zod";
import { ProtectClient, currentCallSignal } from "../client.js";
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

/**
 * The most JSON text one listen returns, about 25k tokens: the scale at which
 * MCP hosts commonly cap or warn about a tool result. The count cap alone
 * allowed 95k-385k tokens at 200 device messages. Also the largest single
 * WebSocket frame accepted, since a frame bigger than the whole budget could
 * never be returned.
 */
export const MAX_SUBSCRIPTION_TEXT_CHARS = 100_000;

/**
 * How long a closing socket may wait for the peer's close frame before it is
 * dropped. ws itself waits 30 s, which on a half-open connection held a 30 s
 * listen past the MCP client's 60 s request timeout.
 */
const CLOSE_GRACE_MS = 1_000;

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
    let finishedAt: number | undefined;
    // Start with the result's own envelope ({"messages":[],"duration":…}).
    let textChars = JSON.stringify({ messages: [], duration, truncated: true }).length;

    const startedAt = Date.now();
    const ws = client.connectWebSocket(path, { maxPayload: MAX_SUBSCRIPTION_TEXT_CHARS });
    let grace: ReturnType<typeof setTimeout> | undefined;

    /**
     * Stop collecting now and close the socket. Messages that arrive after
     * this are dropped, and a peer that never answers the close frame is cut
     * off after CLOSE_GRACE_MS.
     */
    const finish = () => {
      if (finishedAt !== undefined) return;
      finishedAt = Date.now();
      clearTimeout(window);
      // Armed before close(): a socket may report "close" synchronously, and
      // the close handler must find the timer to clear it.
      grace = setTimeout(() => { ws.terminate(); }, CLOSE_GRACE_MS);
      ws.close();
    };

    const window = setTimeout(finish, duration * MS_PER_SECOND);

    // A cancelled call gets no result, so drop the socket at once rather than
    // holding it open for the rest of the listen window.
    const signal = currentCallSignal();
    const onAbort = () => {
      finish();
      ws.terminate();
    };

    ws.on("message", (data: unknown) => {
      if (finishedAt !== undefined) return;
      const text = String(data);
      let message: unknown;
      try {
        message = JSON.parse(text);
      } catch {
        message = text;
      }
      // The comma between array elements counts too.
      const chars = JSON.stringify(message).length + 1;
      if (textChars + chars > MAX_SUBSCRIPTION_TEXT_CHARS) {
        truncated = true;
        finish();
        return;
      }
      textChars += chars;
      messages.push(message);
      if (messages.length >= MAX_SUBSCRIPTION_MESSAGES) {
        truncated = true;
        finish();
      }
    });

    ws.on("error", (err: Error) => {
      error = err.message;
      finish();
    });

    ws.on("close", () => {
      clearTimeout(window);
      clearTimeout(grace);
      signal?.removeEventListener("abort", onAbort);
      // Time actually spent listening: the cap, an error or a cancel can end
      // the listen early, and the close handshake is not part of it.
      const elapsed = Number(
        (((finishedAt ?? Date.now()) - startedAt) / MS_PER_SECOND).toFixed(ELAPSED_DECIMALS)
      );
      const result: CollectResult = { messages, duration: elapsed };
      if (error) result.error = error;
      if (truncated) result.truncated = true;
      resolve(result);
    });

    // Last, once every listener is attached: a call cancelled before its
    // listen began gets no abort event, and must still see its close.
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * A listen that failed before receiving anything is an error, not an empty
 * result: `{messages: []}` would read as "no activity" when the socket was
 * refused or unauthorised. One that failed partway returns what it collected,
 * with the error alongside.
 */
function listenResult(data: CollectResult) {
  return data.error !== undefined && data.messages.length === 0
    ? formatError(new Error(`Subscription failed: ${data.error}`))
    : formatSuccess(data);
}

export function registerSubscriptionTools(
  server: ToolRegistrar,
  client: ProtectClient
) {
  server.registerTool(
    "protect_subscribe_devices",
    {
      description:
        `Connect to the device update WebSocket and collect messages for a specified duration (1-30s). Returns {messages, duration, error?, truncated?}; stops early with truncated=true after ${MAX_SUBSCRIPTION_MESSAGES.toString()} messages or ${MAX_SUBSCRIPTION_TEXT_CHARS.toLocaleString("en-US")} characters of JSON, whichever comes first. A connection that fails before any message arrives returns an error. Each message is an envelope {type, item} where item is a device resource carrying id and modelKey (camera, light, sensor, nvr, …). The 7.3.70 docs show type 'add' with the full device object as item; other message types and whether updates carry only changed fields are not documented — inspect the captured messages. Use to detect device state changes or newly adopted devices.`,
      inputSchema: { duration: durationSchema },
      outputSchema: subscriptionOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ duration }) => {
      const data = await collectMessages(
        client,
        "/subscribe/devices",
        duration
      );
      return listenResult(data);
    }
  );

  server.registerTool(
    "protect_subscribe_events",
    {
      description:
        `Connect to the Protect event WebSocket and collect messages for a specified duration (1-30s). Returns {messages, duration, error?, truncated?}; stops early with truncated=true after ${MAX_SUBSCRIPTION_MESSAGES.toString()} messages or ${MAX_SUBSCRIPTION_TEXT_CHARS.toLocaleString("en-US")} characters of JSON, whichever comes first. A connection that fails before any message arrives returns an error. Each message is an envelope {type: 'add' | 'update', item: {id, modelKey: 'event', type (event kind, e.g. 'ring'), start, end (epoch ms), device (ID of the camera/sensor that raised it)}} (7.3.70 docs). The full set of event kinds and any further event fields are not documented — inspect the captured messages.`,
      inputSchema: { duration: durationSchema },
      outputSchema: subscriptionOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ duration }) => {
      const data = await collectMessages(
        client,
        "/subscribe/events",
        duration
      );
      return listenResult(data);
    }
  );
}
