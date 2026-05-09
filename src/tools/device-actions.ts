import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { WRITE, formatDryRun } from "../utils/safety.js";
import { safePath } from "../utils/url.js";

export function registerDeviceActionTools(
  server: McpServer,
  client: ProtectClient,
  readOnly: boolean
) {
  if (readOnly) return;

  // --- Sirens ---

  server.registerTool(
    "protect_play_siren",
    {
      description: "Activate the siren alarm for a duration. Tracks status and can be stopped early.",
      inputSchema: {
        id: z.string().describe("Siren ID"),
        duration: z
          .union([z.literal(5), z.literal(10), z.literal(20), z.literal(30)])
          .optional()
          .describe("Duration of siren activation in seconds (5, 10, 20, or 30). Defaults to 5."),
        dryRun: z.boolean().optional().describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ id, duration, dryRun }) => {
      try {
        const body = duration !== undefined ? { duration } : undefined;
        if (dryRun) {
          return formatDryRun("POST", safePath`/sirens/${id}/play`, body);
        }
        const data = await client.post(safePath`/sirens/${id}/play`, body);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_stop_siren",
    {
      description: "Stop an active siren",
      inputSchema: {
        id: z.string().describe("Siren ID"),
        dryRun: z.boolean().optional().describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ id, dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun("POST", safePath`/sirens/${id}/stop`);
        }
        const data = await client.post(safePath`/sirens/${id}/stop`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_test_siren_sound",
    {
      description: "Test the siren sound for 5 seconds at the specified volume",
      inputSchema: {
        id: z.string().describe("Siren ID"),
        volume: z.number().int().min(1).max(100).optional().describe("Test volume 1-100. Defaults to configured device volume."),
        dryRun: z.boolean().optional().describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ id, volume, dryRun }) => {
      try {
        const body = volume !== undefined ? { volume } : undefined;
        if (dryRun) {
          return formatDryRun("POST", safePath`/sirens/${id}/test-sound`, body);
        }
        const data = await client.post(safePath`/sirens/${id}/test-sound`, body);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Speakers ---

  server.registerTool(
    "protect_test_speaker_sound",
    {
      description: "Test the speaker sound at the specified volume",
      inputSchema: {
        id: z.string().describe("Speaker ID"),
        volume: z.number().int().min(0).max(100).optional().describe("Test volume 0-100. Defaults to configured device volume."),
        dryRun: z.boolean().optional().describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ id, volume, dryRun }) => {
      try {
        const body = volume !== undefined ? { volume } : undefined;
        if (dryRun) {
          return formatDryRun("POST", safePath`/speakers/${id}/test-sound`, body);
        }
        const data = await client.post(safePath`/speakers/${id}/test-sound`, body);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Relays ---

  server.registerTool(
    "protect_activate_relay_output",
    {
      description: "Control a relay output. Set state to \"on\"/\"off\" to set explicitly, or omit to toggle. When state is \"on\", pulseDuration auto-turns off after the given milliseconds.",
      inputSchema: {
        id: z.string().describe("Relay ID"),
        outputId: z.number().int().min(0).describe("Output channel ID (0 or 1)"),
        state: z.enum(["on", "off"]).optional().describe("Desired output state. If omitted, toggles current state."),
        pulseDuration: z.number().int().min(0).optional().describe("Auto-off duration in milliseconds (only when state is \"on\"). 0 means stay on."),
        dryRun: z.boolean().optional().describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ id, outputId, state, pulseDuration, dryRun }) => {
      try {
        const body: Record<string, unknown> = {};
        if (state !== undefined) body.state = state;
        if (pulseDuration !== undefined) body.pulseDuration = pulseDuration;
        const path = safePath`/relays/${id}/outputs/${outputId}/activate`;
        if (dryRun) {
          return formatDryRun("POST", path, Object.keys(body).length > 0 ? body : undefined);
        }
        const data = await client.post(path, Object.keys(body).length > 0 ? body : undefined);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Alarm hubs ---

  server.registerTool(
    "protect_trigger_alarm_hub_output",
    {
      description: "Trigger an alarm hub output channel. Used to turn on/off connected sirens, lights, or other actuators.",
      inputSchema: {
        id: z.string().describe("Alarm hub (link station) ID"),
        outputId: z.number().int().min(0).describe("Output channel ID (0 or 1)"),
        enable: z.boolean().optional().describe("True to turn on, false to turn off. If omitted, toggles current state."),
        delay: z.number().int().min(0).optional().describe("Delay in milliseconds before output activates"),
        duration: z.number().int().min(0).optional().describe("Duration in milliseconds to keep output active. 0 = indefinite."),
        dryRun: z.boolean().optional().describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ id, outputId, enable, delay, duration, dryRun }) => {
      try {
        const body: Record<string, unknown> = {};
        if (enable !== undefined) body.enable = enable;
        if (delay !== undefined) body.delay = delay;
        if (duration !== undefined) body.duration = duration;
        const path = safePath`/alarm-hubs/${id}/outputs/${outputId}/trigger`;
        if (dryRun) {
          return formatDryRun("POST", path, Object.keys(body).length > 0 ? body : undefined);
        }
        const data = await client.post(path, Object.keys(body).length > 0 ? body : undefined);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
