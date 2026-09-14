import { nullableString, unknownField } from "./common.js";

/**
 * Point-of-sale event ingestion, added in UniFi Protect 7.3.x
 * (POST /v1/pos/cameras/{id}/transactions).
 *
 * Shape taken from the 7.3.47 published docs with the response sample expanded
 * — there is no POS-capable register on the available console, so this is
 * doc-verified rather than live-verified. `created` stays `unknownField()`
 * because we have not observed the boolean live; `eventId` publishes the string
 * hint via `nullableString()`.
 */
export const posTransactionOutputSchema = {
  created: unknownField("Whether the transaction event was recorded (boolean)"),
  eventId: nullableString("ID of the created Protect camera event"),
};
