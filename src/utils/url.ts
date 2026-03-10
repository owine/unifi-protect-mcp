/**
 * Tagged template that encodes interpolated values for safe URL path construction.
 *
 * This function URL-encodes only the interpolated values, which prevents them from
 * introducing path traversal (`/`), query (`?`), or fragment (`#`) delimiters.
 * The literal template segments are not modified, so they must be trusted and should
 * not contain user-controlled data.
 *
 * Values must be raw (unencoded). Pre-encoded values will be double-encoded
 * (e.g. `%2F` becomes `%252F`), which is the correct defensive behavior.
 */
export function safePath(
  strings: TemplateStringsArray,
  ...values: (string | number)[]
): string {
  return strings.reduce((result, str, i) =>
    i < values.length
      ? result + str + encodeURIComponent(String(values[i]))
      : result + str,
    "",
  );
}
