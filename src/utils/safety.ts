import { z } from "zod";
import { formatSuccess } from "./responses.js";

/** Annotation constants for tool safety classification */

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false } as const;
export const WRITE = { readOnlyHint: false, destructiveHint: false } as const;
export const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true } as const;

/**
 * Build a standard dry-run preview response.
 * Returns the MCP tool result that describes what *would* happen.
 */
export function formatDryRun(
  method: string,
  path: string,
  body?: unknown,
) {
  const preview: Record<string, unknown> = { dryRun: true, action: method, path };
  if (body !== undefined) {
    preview.body = body;
  }
  return formatSuccess(preview);
}

/**
 * The `confirm` input of a gated tool. Optional in the schema: a dry run
 * changes nothing, so it never needs confirming, and the handler checks
 * confirm only on the real call (see requireConfirmation).
 */
export function confirmInput(action: string) {
  return z
    .boolean()
    .optional()
    .describe(`Must be true to ${action}; not needed with dryRun: true`);
}

/**
 * Guard for a gated action, checked after the dry-run branch. Returns an
 * error result if `confirm` is not `true`, otherwise `null`.
 */
export function requireConfirmation(confirm: boolean | undefined, action: string) {
  if (confirm !== true) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: This action requires confirmation: set confirm to true to ${action} (a dryRun: true preview needs no confirm)`,
        },
      ],
      isError: true,
    };
  }
  return null;
}
