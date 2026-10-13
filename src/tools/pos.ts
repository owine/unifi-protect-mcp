import { z } from "zod";
import type { ToolRegistrar } from "./registrar.js";
import { ProtectClient } from "../client.js";
import { formatSuccess } from "../utils/responses.js";
import { WRITE, formatDryRun, dryRunInput } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
import { resourceId } from "../utils/params.js";
import { posTransactionOutputSchema } from "../schemas/pos.js";

/**
 * Point-of-sale event ingestion (added in Protect 7.3.x).
 *
 * `lineItems` entries use `.loose()` because the 7.3.70 docs render the
 * item schema collapsed — the request sample shows `{ title, quantity: 1 }`, but
 * an undocumented extra field should reach the API rather than be stripped.
 * Since the item constraints are not published, `quantity` is only required
 * to be positive (fractional quantities such as weights are allowed).
 */
export function registerPosTools(
  server: ToolRegistrar,
  client: ProtectClient,
  readOnly: boolean
) {
  if (readOnly) return;

  const lineItemSchema = z
    .object({
      title: z.string().describe("Line item name"),
      quantity: z.number().positive().describe("Quantity purchased (> 0)"),
    })
    .loose();

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
        id: resourceId().describe("Camera ID to attach the transaction event to"),
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
          .loose()
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
            "Transaction time in epoch milliseconds. Protect validates this " +
              "against the NVR clock: it must be within the last 24 hours and no " +
              "more than 5 minutes ahead of server time. Protect rejects an " +
              "out-of-range value with a 400 and clamps an in-skew value to now. " +
              "This tool forwards the value unchanged rather than pre-checking it, " +
              "because the window is relative to NVR time, not this process clock."
          ),
        dryRun: dryRunInput(),
      },
      outputSchema: posTransactionOutputSchema,
      annotations: WRITE,
    },
    async ({ id, dryRun, ...transaction }) => {
      const path = safePath`/pos/cameras/${id}/transactions`;
      if (dryRun) {
        return formatDryRun("POST", path, transaction);
      }
      const data = await client.post(path, transaction);
      return formatSuccess(data);
    }
  );
}
