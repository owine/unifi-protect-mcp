import { z } from "zod";

/**
 * Schema primitives for Protect outputSchema declarations.
 *
 * Hard-won rule (verified against live 7.1.60): the UniFi Protect Integration
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
 * - Every object uses `.passthrough()` so unverified/extra fields flow through.
 */

/** Create an object schema with `.passthrough()` to allow unknown fields. */
export function passthroughObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).passthrough();
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

/** Output-schema shape for list endpoints that return a top-level array. */
export function listResultSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return {
    result: z.array(itemSchema).describe("Array of items returned by the list endpoint"),
  };
}
