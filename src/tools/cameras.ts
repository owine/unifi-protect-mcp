import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY, WRITE, DESTRUCTIVE, formatDryRun, requireConfirmation } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
import { resourceId } from "../utils/params.js";
import {
  cameraOutputSchema,
  cameraListOutputSchema,
  rtspStreamOutputSchema,
  talkbackSessionOutputSchema,
} from "../schemas/cameras.js";

export function registerCameraTools(
  server: McpServer,
  client: ProtectClient,
  readOnly: boolean
) {
  // --- Read-only tools (always registered) ---

  server.registerTool(
    "protect_list_cameras",
    {
      description:
        "List all cameras managed by UniFi Protect. Returns array; each camera includes (Integration API 7.3.70-verified fields): id, mac, name, modelKey, state (CONNECTED/DISCONNECTED), type (hardware model name, e.g. UVC G6 Turret), guid (hardware MODEL GUID — every camera of the same model returns the same value, so it is NOT a per-camera identifier; use id), activePatrolSlot, hasPackageCamera, hdrType, isMicEnabled, micVolume, videoMode, featureFlags (hasHdr, hasMic, hasSpeaker, hasLedStatus, smartDetectTypes[], smartDetectAudioTypes[], videoModes[], supportFullHdSnapshot), lcdMessage (type, resetAt, text), ledSettings (isEnabled, floodLed, welcomeLed), osdSettings (isNameEnabled, isDateEnabled, isLogoEnabled, isDebugEnabled, overlayLocation), smartDetectSettings (objectTypes[], audioTypes[]). The Integration API does NOT expose recording state, motion timestamps, connection/last-seen, firmware, host, or per-channel stream config.",
      outputSchema: cameraListOutputSchema,
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const data = await client.get("/cameras");
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_get_camera",
    {
      description:
        "Get details for a specific camera by ID. The Protect Integration API returns the SAME field set as protect_list_cameras entries (id, mac, name, modelKey, state, type, guid, activePatrolSlot, hasPackageCamera, hdrType, isMicEnabled, micVolume, videoMode, featureFlags, lcdMessage, ledSettings, osdSettings, smartDetectSettings) — there is no extended/by-id-only payload (confirmed live on 7.3.70). Recording state, motion events, zones, and channel/RTSP config are NOT exposed by this API surface.",
      inputSchema: { id: resourceId().describe("Camera ID") },
      outputSchema: cameraOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      try {
        const data = await client.get(safePath`/cameras/${id}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_get_snapshot",
    {
      description:
        "Get a JPEG snapshot from a camera. Returns a base64-encoded image/jpeg (rendered directly by MCP clients). Use highQuality=true to force a 1080p-or-higher capture; set channel=package to capture from the secondary package camera on doorbells with hasPackageCamera=true. Fails with HTTP 503 when the camera is offline or unreachable.",
      inputSchema: {
        id: resourceId().describe("Camera ID"),
        highQuality: z
          .boolean()
          .optional()
          .describe("If true, force a 1080p-or-higher resolution snapshot"),
        channel: z
          .enum(["main", "package"])
          .optional()
          .describe('Camera channel to capture. Use "package" for cameras with hasPackageCamera=true (defaults to main)'),
      },
      annotations: READ_ONLY,
    },
    async ({ id, highQuality, channel }) => {
      try {
        const params = new URLSearchParams();
        if (highQuality) params.set("highQuality", "true");
        if (channel) params.set("channel", channel);
        const query = params.toString();
        const url = query
          ? safePath`/cameras/${id}/snapshot` + `?${query}`
          : safePath`/cameras/${id}/snapshot`;
        const { data, mimeType } = await client.getBinary(url);
        return {
          content: [
            {
              type: "image" as const,
              data: data.toString("base64"),
              mimeType,
            },
          ],
        };
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_get_rtsp_streams",
    {
      description:
        "Get active RTSPS stream sessions for a camera. Returns: high, medium, low, package — each an rtsps:// URL, or null (or absent) when no session is active at that quality. Use protect_create_rtsp_stream to start one.",
      inputSchema: { id: resourceId().describe("Camera ID") },
      outputSchema: rtspStreamOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      try {
        const data = await client.get(safePath`/cameras/${id}/rtsps-stream`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  // --- Write tools (skipped in read-only mode) ---

  if (readOnly) return;

  server.registerTool(
    "protect_update_camera",
    {
      description:
        "Update camera settings (partial update via PATCH). Returns: the full updated camera (same fields as protect_get_camera).",
      inputSchema: {
        id: resourceId().describe("Camera ID"),
        settings: z
          .object({
            name: z.string().optional().describe("Camera name"),
            osdSettings: z
              .record(z.string(), z.unknown())
              .optional()
              .describe("On-screen display (isNameEnabled, isDateEnabled, isLogoEnabled, isDebugEnabled, overlayLocation)"),
            ledSettings: z
              .record(z.string(), z.unknown())
              .optional()
              .describe("LED settings (isEnabled, welcomeLed, floodLed)"),
            lcdMessage: z
              .record(z.string(), z.unknown())
              .optional()
              .describe('Doorbell LCD message (type, resetAt, text), e.g. { type: "DO_NOT_DISTURB", resetAt: 0 }'),
            micVolume: z.number().min(0).max(100).optional().describe("Mic volume (0-100)"),
            videoMode: z
              .enum(["default", "highFps", "sport", "slowShutter", "lprReflex", "lprNoneReflex"])
              .optional()
              .describe("Video mode"),
            hdrType: z.enum(["auto", "on", "off"]).optional().describe("HDR mode"),
            smartDetectSettings: z
              .record(z.string(), z.unknown())
              .optional()
              .describe("Smart detection (objectTypes[], audioTypes[])"),
          })
          .passthrough()
          .refine((o) => Object.keys(o).length > 0, "settings must include at least one field")
          .describe("Partial camera settings to update"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      outputSchema: cameraOutputSchema,
      annotations: WRITE,
    },
    async ({ id, settings, dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun("PATCH", safePath`/cameras/${id}`, settings);
        }
        const data = await client.patch(safePath`/cameras/${id}`, settings);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_create_rtsp_stream",
    {
      description:
        "Create an RTSPS stream session for a camera. Returns: one key per requested quality (high, medium, low, package), each an rtsps:// URL. The package quality is only available on cameras with hasPackageCamera=true.",
      inputSchema: {
        id: resourceId().describe("Camera ID"),
        qualities: z
          .array(z.enum(["high", "medium", "low", "package"]))
          .min(1)
          .describe("Quality levels to include in the RTSPS stream (at least one)"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      outputSchema: rtspStreamOutputSchema,
      annotations: WRITE,
    },
    async ({ id, qualities, dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun(
            "POST",
            safePath`/cameras/${id}/rtsps-stream`,
            { qualities }
          );
        }
        const data = await client.post(safePath`/cameras/${id}/rtsps-stream`, {
          qualities,
        });
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_delete_rtsp_stream",
    {
      description: "Stop and delete an active RTSPS stream session for a camera",
      inputSchema: {
        id: resourceId().describe("Camera ID"),
        qualities: z
          .array(z.enum(["high", "medium", "low", "package"]))
          .min(1)
          .describe("Quality levels to remove from the RTSPS stream (at least one)"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ id, qualities, dryRun }) => {
      try {
        // Protect expects repeated keys (qualities=high&qualities=medium), not
        // a comma-joined value — safePath would encode the comma as %2C.
        const params = new URLSearchParams();
        for (const quality of qualities) params.append("qualities", quality);
        const url = safePath`/cameras/${id}/rtsps-stream` + `?${params.toString()}`;
        if (dryRun) {
          return formatDryRun("DELETE", url);
        }
        const data = await client.delete(url);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_create_talkback",
    {
      description:
        "Create a talkback (two-way audio) session for a camera. Returns: url, codec, samplingRate, bitsPerSample (the audio config for encoding outbound audio).",
      inputSchema: {
        id: resourceId().describe("Camera ID"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      outputSchema: talkbackSessionOutputSchema,
      annotations: WRITE,
    },
    async ({ id, dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun("POST", safePath`/cameras/${id}/talkback-session`);
        }
        const data = await client.post(safePath`/cameras/${id}/talkback-session`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_disable_mic",
    {
      description:
        "IRREVERSIBLE: Permanently disable the microphone on a camera. Can only be re-enabled by factory resetting the camera. Returns: the full updated camera (same fields as protect_get_camera).",
      inputSchema: {
        id: resourceId().describe("Camera ID"),
        confirm: z
          .literal(true)
          .describe("Must be true to confirm this irreversible action"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      outputSchema: cameraOutputSchema,
      annotations: DESTRUCTIVE,
    },
    async ({ id, confirm, dryRun }) => {
      const denied = requireConfirmation(confirm, "permanently disable the microphone");
      if (denied) return denied;
      try {
        if (dryRun) {
          return formatDryRun("POST", safePath`/cameras/${id}/disable-mic-permanently`);
        }
        const data = await client.post(
          safePath`/cameras/${id}/disable-mic-permanently`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_start_ptz_patrol",
    {
      description: "Start PTZ patrol on a camera at a given slot",
      inputSchema: {
        id: resourceId().describe("Camera ID"),
        slot: z.number().int().min(0).max(4).describe("Patrol slot number (0-4)"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ id, slot, dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun("POST", safePath`/cameras/${id}/ptz/patrol/start/${slot}`);
        }
        const data = await client.post(
          safePath`/cameras/${id}/ptz/patrol/start/${slot}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_stop_ptz_patrol",
    {
      description: "Stop PTZ patrol on a camera",
      inputSchema: {
        id: resourceId().describe("Camera ID"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ id, dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun("POST", safePath`/cameras/${id}/ptz/patrol/stop`);
        }
        const data = await client.post(safePath`/cameras/${id}/ptz/patrol/stop`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_goto_ptz_preset",
    {
      description: "Move camera PTZ to a preset position",
      inputSchema: {
        id: resourceId().describe("Camera ID"),
        slot: z
          .number()
          .int()
          .min(-1)
          .describe("PTZ preset slot: -1 for the home position, 0 or higher for saved presets"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ id, slot, dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun("POST", safePath`/cameras/${id}/ptz/goto/${slot}`);
        }
        const data = await client.post(safePath`/cameras/${id}/ptz/goto/${slot}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
