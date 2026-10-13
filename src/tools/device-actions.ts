import { z } from "zod";
import type { ToolRegistrar } from "./registrar.js";
import { ProtectClient } from "../client.js";
import { formatSuccess } from "../utils/responses.js";
import { WRITE, DESTRUCTIVE, formatDryRun, dryRunInput, confirmGate } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
import { resourceId } from "../utils/params.js";

// Each gate's confirm input and handler check share one action text.
const STOP_SIREN = confirmGate("silence the siren");
const SWITCH_RELAY = confirmGate("switch the relay output");
const TRIGGER_HUB_OUTPUT = confirmGate("trigger the alarm hub output");

export function registerDeviceActionTools(
  server: ToolRegistrar,
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
        id: resourceId().describe("Siren ID"),
        duration: z
          .union([z.literal(5), z.literal(10), z.literal(20), z.literal(30)])
          .optional()
          .describe("Duration of siren activation in seconds (5, 10, 20, or 30). Defaults to 5."),
        dryRun: dryRunInput(),
      },
      annotations: WRITE,
    },
    async ({ id, duration, dryRun }) => {
      const body = duration !== undefined ? { duration } : undefined;
      if (dryRun) {
        return formatDryRun("POST", safePath`/sirens/${id}/play`, body);
      }
      const data = await client.post(safePath`/sirens/${id}/play`, body);
      return formatSuccess(data);
    }
  );

  server.registerTool(
    "protect_stop_siren",
    {
      description: "Stop an active siren. Requires confirm: true: it silences an alarm siren.",
      inputSchema: {
        id: resourceId().describe("Siren ID"),
        confirm: STOP_SIREN.input,
        dryRun: dryRunInput(),
      },
      annotations: WRITE,
    },
    async ({ id, confirm, dryRun }) => {
      if (dryRun) {
        return formatDryRun("POST", safePath`/sirens/${id}/stop`);
      }
      const denied = STOP_SIREN.check(confirm);
      if (denied) return denied;
      const data = await client.post(safePath`/sirens/${id}/stop`);
      return formatSuccess(data);
    }
  );

  server.registerTool(
    "protect_test_siren_sound",
    {
      description: "Test the siren sound for 5 seconds at the specified volume",
      inputSchema: {
        id: resourceId().describe("Siren ID"),
        volume: z.number().int().min(1).max(100).optional().describe("Test volume 1-100. Defaults to configured device volume."),
        dryRun: dryRunInput(),
      },
      annotations: WRITE,
    },
    async ({ id, volume, dryRun }) => {
      const body = volume !== undefined ? { volume } : undefined;
      if (dryRun) {
        return formatDryRun("POST", safePath`/sirens/${id}/test-sound`, body);
      }
      const data = await client.post(safePath`/sirens/${id}/test-sound`, body);
      return formatSuccess(data);
    }
  );

  // --- Speakers ---

  server.registerTool(
    "protect_test_speaker_sound",
    {
      description: "Test the speaker sound at the specified volume",
      inputSchema: {
        id: resourceId().describe("Speaker ID"),
        volume: z.number().int().min(0).max(100).optional().describe("Test volume 0-100. Defaults to configured device volume."),
        dryRun: dryRunInput(),
      },
      annotations: WRITE,
    },
    async ({ id, volume, dryRun }) => {
      const body = volume !== undefined ? { volume } : undefined;
      if (dryRun) {
        return formatDryRun("POST", safePath`/speakers/${id}/test-sound`, body);
      }
      const data = await client.post(safePath`/speakers/${id}/test-sound`, body);
      return formatSuccess(data);
    }
  );

  // --- Relays ---

  server.registerTool(
    "protect_activate_relay_output",
    {
      description: "Control a relay output. Relays commonly drive gates, door strikes and garage doors, so this requires confirm: true. state (\"on\"/\"off\") is required: the API's toggle mode is not exposed because a retried toggle would flip the output back. Read the current output state with protect_get_relay. When state is \"on\", pulseDuration auto-turns off after the given milliseconds.",
      inputSchema: {
        id: resourceId().describe("Relay ID"),
        outputId: z.number().int().min(0).describe("Output channel ID (0 or 1)"),
        state: z.enum(["on", "off"]).describe("Desired output state"),
        pulseDuration: z.number().int().min(0).optional().describe("Auto-off duration in milliseconds (only when state is \"on\"). 0 means stay on."),
        confirm: SWITCH_RELAY.input,
        dryRun: dryRunInput(),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ id, outputId, state, pulseDuration, confirm, dryRun }) => {
      const body: Record<string, unknown> = { state };
      if (pulseDuration !== undefined) body.pulseDuration = pulseDuration;
      const path = safePath`/relays/${id}/outputs/${outputId}/activate`;
      if (dryRun) {
        return formatDryRun("POST", path, body);
      }
      const denied = SWITCH_RELAY.check(confirm);
      if (denied) return denied;
      const data = await client.post(path, body);
      return formatSuccess(data);
    }
  );

  // --- Alarm hubs ---

  server.registerTool(
    "protect_trigger_alarm_hub_output",
    {
      description: "Trigger an alarm hub output channel. Used to turn on/off connected sirens, lights, locks, or other actuators, so this requires confirm: true. enable is required: the API's toggle mode is not exposed because a retried toggle would flip the output back.",
      inputSchema: {
        id: resourceId().describe("Alarm hub (link station) ID"),
        outputId: z.number().int().min(0).describe("Output channel ID (0 or 1)"),
        enable: z.boolean().describe("True to turn on, false to turn off"),
        delay: z.number().int().min(0).optional().describe("Delay in milliseconds before output activates"),
        duration: z.number().int().min(0).optional().describe("Duration in milliseconds to keep output active. 0 = indefinite."),
        confirm: TRIGGER_HUB_OUTPUT.input,
        dryRun: dryRunInput(),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ id, outputId, enable, delay, duration, confirm, dryRun }) => {
      const body: Record<string, unknown> = { enable };
      if (delay !== undefined) body.delay = delay;
      if (duration !== undefined) body.duration = duration;
      const path = safePath`/alarm-hubs/${id}/outputs/${outputId}/trigger`;
      if (dryRun) {
        return formatDryRun("POST", path, body);
      }
      const denied = TRIGGER_HUB_OUTPUT.check(confirm);
      if (denied) return denied;
      const data = await client.post(path, body);
      return formatSuccess(data);
    }
  );
}
