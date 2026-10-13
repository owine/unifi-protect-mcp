import { readFileSync } from "node:fs";
import { z } from "zod";
import { pemCertificates } from "./tls.js";

function holdsCertificate(pem: string): boolean {
  try {
    return pemCertificates(pem).length > 0;
  } catch {
    return false;
  }
}

const CLOUD_CONNECTOR_HOST = "api.ui.com";

const ConfigSchema = z.object({
  // The client builds https://<host>/..., so accept the URL people paste from
  // a browser and reduce it to host[:port]. Parsing it as a URL validates the
  // port and IPv6 brackets, and drops a redundant :443. Anything that would
  // change the request (credentials, path, query) is rejected rather than
  // silently misrouted.
  host: z
    .string({ error: "UNIFI_PROTECT_HOST is required" })
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
        url?.username !== "" ||
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
  // Trimmed, because a key pasted with its trailing newline is common; any
  // control character left inside is refused, since fetch would reject the
  // header and echo the whole key into every tool error. The message never
  // repeats the value.
  apiKey: z
    .string({ error: "UNIFI_PROTECT_API_KEY is required" })
    .trim()
    .min(1, "UNIFI_PROTECT_API_KEY is required")
    // eslint-disable-next-line no-control-regex -- matching control characters is the point
    .refine((key) => !/[\u0000-\u001f\u007f]/.test(key), "UNIFI_PROTECT_API_KEY contains a control character (a line break or similar); paste the key again"),
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
  // PEM certificate(s) to trust for the console, e.g. its own self-signed one.
  caCert: z
    .string()
    .refine(holdsCertificate, "UNIFI_PROTECT_CA_CERT must name a PEM file containing a certificate")
    .optional(),
}).refine((config) => config.verifySsl || config.caCert === undefined, {
  path: ["caCert"],
  message: "UNIFI_PROTECT_CA_CERT pins a certificate to verify against; it cannot be combined with UNIFI_PROTECT_VERIFY_SSL=false",
}).refine((config) => config.caCert === undefined || !isCloudConnectorHost(config.host), {
  // Node's `ca` option replaces the public roots, so pinning a certificate
  // can only break the connection to Ubiquiti's properly certified cloud.
  path: ["caCert"],
  message: "UNIFI_PROTECT_CA_CERT is for local consoles; unset it for api.ui.com",
}).refine((config) => config.verifySsl || !isCloudConnectorHost(config.host), {
  // Turning verification off is for local consoles with self-signed
  // certificates. A Site Manager key reaches every console on the account and
  // crosses the internet, so it never goes out unverified.
  path: ["verifySsl"],
  message: "TLS verification cannot be disabled for api.ui.com; unset UNIFI_PROTECT_VERIFY_SSL",
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Whether host is Ubiquiti's Cloud Connector, however it was written: the
 * TLS rules below must not be dodged by a trailing dot or an explicit port.
 */
export function isCloudConnectorHost(host: string): boolean {
  return new URL(`https://${host}`).hostname.replace(/\.$/, "") === CLOUD_CONNECTOR_HOST;
}

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
  const caCertPath = process.env.UNIFI_PROTECT_CA_CERT;
  let caCert: string | undefined;
  if (caCertPath) {
    try {
      caCert = readFileSync(caCertPath, "utf8");
    } catch (err) {
      console.error(`Configuration error: cannot read UNIFI_PROTECT_CA_CERT (${caCertPath}): ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  const result = ConfigSchema.safeParse({
    host: process.env.UNIFI_PROTECT_HOST,
    apiKey: process.env.UNIFI_PROTECT_API_KEY,
    ...(process.env.UNIFI_PROTECT_CONSOLE_ID
      ? { consoleId: process.env.UNIFI_PROTECT_CONSOLE_ID }
      : {}),
    verifySsl: envFlag(process.env.UNIFI_PROTECT_VERIFY_SSL, true),
    readOnly: envFlag(process.env.UNIFI_PROTECT_READ_ONLY, true),
    ...(caCert !== undefined ? { caCert } : {}),
  });

  if (!result.success) {
    // Every message names the variable it is about, so no generic trailer.
    const errors = result.error.issues.map((i) => i.message).join("; ");
    console.error(`Configuration error: ${errors}`);
    process.exit(1);
  }

  return result.data;
}
