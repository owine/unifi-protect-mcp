import { z } from "zod";

const ConfigSchema = z.object({
  host: z.string().min(1, "UNIFI_PROTECT_HOST is required"),
  apiKey: z.string().min(1, "UNIFI_PROTECT_API_KEY is required"),
  verifySsl: z.boolean(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const result = ConfigSchema.safeParse({
    host: process.env.UNIFI_PROTECT_HOST,
    apiKey: process.env.UNIFI_PROTECT_API_KEY,
    verifySsl: process.env.UNIFI_PROTECT_VERIFY_SSL !== "false",
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
