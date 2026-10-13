import { z } from "zod";

/**
 * Schema primitives for Protect outputSchema declarations.
 *
 * Hard-won rule (verified against live 7.1.83): the UniFi Protect Integration
 * API returns explicit `null` for absent string fields (e.g. a user with no
 * email returns `email: null`, not omitted). `z.string().optional()` permits
 * `undefined` but REJECTS `null`, which fails SDK output validation and breaks
 * the tool call. So:
 *
 * - Only `id` is strictly typed (`z.string()`) — it is always a present,
 *   non-null string on every resource, and keeps one real validation guard.
 * - Every other string uses `nullableString()` = string | null | undefined.
 *   The LLM still sees "this is a string" in the published schema, but null
 *   can never fail validation.
 * - Non-string fields (booleans, numbers, nested objects whose shape we have
 *   not verified) use `unknownField()` — name + description published, no
 *   runtime type constraint at all.
 * - Every object uses `.loose()` so unverified/extra fields flow through.
 */

/** Create an object schema with `.loose()` to allow unknown fields. */
export function passthroughObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).loose();
}

/**
 * An unverified field: name + description are published to clients, but there
 * is no runtime type constraint (never fails output validation).
 */
export function unknownField(description: string) {
  return z.unknown().optional().describe(description);
}

/** The one strictly-typed field: `id` is always a present non-null string. */
export function idField(description = "Resource ID") {
  return z.string().optional().describe(description);
}

/**
 * A string field that may be string, null, or absent. Publishes the string
 * type hint to clients while never failing validation on an API null.
 */
export function nullableString(description: string) {
  return z.string().nullable().optional().describe(description);
}

/**
 * Hardware-model fields that Protect 7.3.x added to every device resource and
 * to the NVR.
 *
 * VERIFIED LIVE (7.3.47): `guid` identifies the hardware MODEL, not the unit.
 * Three "UVC G6 Turret" cameras on the test console all return the same guid,
 * as do two "UP Chime PoE" chimes. Despite the name, it is NOT a per-device
 * identifier — `id` remains the only device identity.
 */
export function hardwareModelFields() {
  return {
    type: nullableString(
      'Hardware model name, e.g. "UVC G6 Turret", "UP Chime PoE", "UNVR-PRO"'
    ),
    guid: nullableString(
      "Hardware MODEL GUID, shared by every unit of the same model. NOT a " +
        "per-device identifier — use `id` to identify a device."
    ),
  };
}

/** Output-schema shape for list endpoints that return a top-level array. */
export function listResultSchema<T extends z.ZodType>(itemSchema: T) {
  return {
    result: z.array(itemSchema).describe("Array of items returned by the list endpoint"),
  };
}

/**
 * The outputSchema to publish for a tool: always a loose object. Tool modules
 * hand over raw shapes (`{ ...schema.shape }`), and the SDK wraps a raw shape
 * in a plain `z.object`, whose JSON Schema says `additionalProperties: false`.
 * SDK clients validate structuredContent against that published schema, and
 * tools pass Protect's response through, so the first top-level field a
 * firmware update added would fail the call for every client that validates.
 */
export function looseOutput(schema: z.ZodRawShape | z.ZodType): z.ZodObject {
  if (schema instanceof z.ZodObject) return schema.loose();
  if (schema instanceof z.ZodType) {
    // structuredContent is always an object; a list wraps its array under
    // `result` (see listResultSchema).
    throw new TypeError("An outputSchema must be a z.object or a raw shape");
  }
  return z.looseObject(schema);
}

/**
 * Fields of the preview a write tool returns for `dryRun: true` (see
 * formatDryRun). Declared so the published outputSchema documents them; a
 * resource field of the same name (a file's `path`) takes precedence.
 */
export const dryRunPreviewFields = {
  dryRun: z
    .literal(true)
    .optional()
    .describe("Present and true when this is a dry-run preview: nothing was changed"),
  action: z.string().optional().describe("Dry run: the HTTP method that would be sent"),
  path: z.string().optional().describe("Dry run: the request path that would be sent"),
  body: z.unknown().optional().describe("Dry run: the request body that would be sent"),
} as const;
