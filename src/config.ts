import { z } from "zod";

const ConfigSchema = z.object({
  host: z.string().min(1, "UNIFI_PROTECT_HOST is required"),
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

export function loadConfig(): Config {
  const result = ConfigSchema.safeParse({
    host: process.env.UNIFI_PROTECT_HOST,
    apiKey: process.env.UNIFI_PROTECT_API_KEY,
    ...(process.env.UNIFI_PROTECT_CONSOLE_ID
      ? { consoleId: process.env.UNIFI_PROTECT_CONSOLE_ID }
      : {}),
    verifySsl: process.env.UNIFI_PROTECT_VERIFY_SSL !== "false",
    readOnly: process.env.UNIFI_PROTECT_READ_ONLY !== "false",
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
