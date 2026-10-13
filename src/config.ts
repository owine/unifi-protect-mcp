import { z } from "zod";

const ConfigSchema = z.object({
  // The client builds https://<host>/..., so accept the URL people paste from
  // a browser and reduce it to host[:port]. Parsing it as a URL validates the
  // port and IPv6 brackets, and drops a redundant :443. Anything that would
  // change the request (credentials, path, query) is rejected rather than
  // silently misrouted.
  host: z
    .string()
    .min(1, "UNIFI_PROTECT_HOST is required")
    .transform((raw, ctx) => {
      const trimmed = raw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
      let url: URL | undefined;
      try {
        url = new URL(`https://${trimmed}`);
      } catch {
        // reported below
      }
      if (
        !url ||
        url.username !== "" ||
        url.password !== "" ||
        url.pathname !== "/" ||
        url.search !== "" ||
        url.hash !== ""
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "UNIFI_PROTECT_HOST must be a hostname or IP with an optional :port (no path); bracket IPv6 addresses, e.g. [2001:db8::1]:443",
        });
        return z.NEVER;
      }
      return url.host;
    }),
  apiKey: z.string().min(1, "UNIFI_PROTECT_API_KEY is required"),
  // Console IDs are hex, UUID- or colon-shaped depending on vintage. The
  // charset excludes anything that could escape the URL path segment it is
  // interpolated into.
  consoleId: z
    .string()
    .regex(
      /^[A-Za-z0-9:_-]{1,128}$/,
      "UNIFI_PROTECT_CONSOLE_ID must be alphanumeric with : _ -"
    )
    .optional(),
  verifySsl: z.boolean(),
  readOnly: z.boolean(),
});

export type Config = z.infer<typeof ConfigSchema>;

const FALSE_VALUES = new Set(["false", "0", "no", "off"]);
const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);

/**
 * Read a boolean env var. An unset or unrecognized value keeps the default,
 * so a typo can never switch off TLS verification or read-only mode.
 */
function envFlag(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (FALSE_VALUES.has(normalized)) return false;
  if (TRUE_VALUES.has(normalized)) return true;
  return fallback;
}

export function loadConfig(): Config {
  const result = ConfigSchema.safeParse({
    host: process.env.UNIFI_PROTECT_HOST,
    apiKey: process.env.UNIFI_PROTECT_API_KEY,
    ...(process.env.UNIFI_PROTECT_CONSOLE_ID
      ? { consoleId: process.env.UNIFI_PROTECT_CONSOLE_ID }
      : {}),
    verifySsl: envFlag(process.env.UNIFI_PROTECT_VERIFY_SSL, true),
    readOnly: envFlag(process.env.UNIFI_PROTECT_READ_ONLY, true),
  });

  if (!result.success) {
    const errors = result.error.issues.map((i) => i.message).join(", ");
    console.error(`Configuration error: ${errors}`);
    console.error(
      "Required env vars: UNIFI_PROTECT_HOST, UNIFI_PROTECT_API_KEY"
    );
    process.exit(1);
  }

  return result.data;
}
