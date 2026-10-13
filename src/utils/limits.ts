/** Largest JSON response body read from Protect. */
export const MAX_JSON_BYTES = 10_000_000;

/** Largest binary response body (a snapshot) read from Protect. */
export const MAX_BINARY_BYTES = 100_000_000;

/**
 * How much of an error body is read. Only its start reaches the model, so a
 * proxy's error page or a runaway body is not buffered whole.
 */
export const MAX_ERROR_BODY_BYTES = 64 * 1024;
