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
 * Guard for destructive actions that require explicit confirmation.
 * Returns an error result if `confirm` is not `true`, otherwise `null`.
 */
export function requireConfirmation(confirm: boolean, action: string) {
  if (confirm !== true) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: You must set confirm to true to ${action}`,
        },
      ],
      isError: true,
    };
  }
  return null;
}
