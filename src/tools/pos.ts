import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { WRITE, formatDryRun } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
import { posTransactionOutputSchema } from "../schemas/pos.js";

/**
 * Point-of-sale event ingestion (added in Protect 7.3.x).
 *
 * `lineItems` entries use `.passthrough()` because the 7.3.47 docs render the
 * item schema collapsed — the request sample shows `{ title, quantity }`, but
 * an undocumented extra field should reach the API rather than be stripped.
 */
export function registerPosTools(
  server: McpServer,
  client: ProtectClient,
  readOnly: boolean
) {
  if (readOnly) return;

  const lineItemSchema = z
    .object({
      title: z.string().describe("Line item name"),
      quantity: z.number().min(1).describe("Quantity purchased (>= 1)"),
    })
    .passthrough();

  server.registerTool(
    "protect_ingest_pos_transaction",
    {
      description:
        "Record a point-of-sale transaction as a camera event so the transaction " +
        "details can be overlaid on recorded footage. Requires write access to the " +
        "target camera. Footage capture is best-effort: the overlay only appears " +
        "where the camera was actually recording the transaction window, and a " +
        "backdated timestamp may fall outside retained footage — a success response " +
        "confirms the event was recorded, NOT that video exists for that window. " +
        "A 409 means a transaction with the same externalId is already being " +
        "processed for this camera; retry shortly. " +
        "Returns: created (boolean), eventId (string).",
      inputSchema: {
        id: z.string().describe("Camera ID to attach the transaction event to"),
        type: z.enum(["sale", "refund"]).describe("Transaction type"),
        externalId: z
          .string()
          .min(1)
          .max(255)
          .describe(
            "Caller-supplied transaction ID, unique per camera. Used for " +
              "best-effort idempotency within a short window only — the dedupe " +
              "cache is in-memory and per-process, so a retry after a Protect " +
              "restart or after the window elapses may create a duplicate event."
          ),
        amount: z.number().min(0).describe("Transaction total amount (>= 0)"),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional()
          .describe('Uppercase ISO 4217 currency code, e.g. "USD"'),
        lineItems: z
          .array(lineItemSchema)
          .max(200)
          .optional()
          .describe("Purchased line items (max 200)"),
        location: z
          .object({
            id: z.string().optional().describe("Store/location ID"),
            name: z.string().optional().describe("Store/location name"),
          })
          .passthrough()
          .optional()
          .describe("Point-of-sale location"),
        paymentTypes: z
          .array(z.string().min(1).max(255))
          .max(20)
          .optional()
          .describe("Payment method names (max 20)"),
        timestamp: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            "Transaction time in epoch milliseconds. Must be within the last 24 " +
              "hours and no more than 5 minutes ahead of server time; out-of-range " +
              "values are rejected. A value within the allowed skew is clamped to now."
          ),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      outputSchema: posTransactionOutputSchema,
      annotations: WRITE,
    },
    async ({ id, dryRun, ...transaction }) => {
      try {
        const path = safePath`/pos/cameras/${id}/transactions`;
        if (dryRun) {
          return formatDryRun("POST", path, transaction);
        }
        const data = await client.post(path, transaction);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
