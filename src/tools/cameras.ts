import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY, WRITE, DESTRUCTIVE, formatDryRun, requireConfirmation } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
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
        "List all cameras managed by UniFi Protect. Returns array; each camera includes (Integration API 7.1.60-verified fields): id, mac, name, modelKey, state (CONNECTED/DISCONNECTED), activePatrolSlot, hasPackageCamera, hdrType, isMicEnabled, micVolume, videoMode, featureFlags (hasHdr, hasMic, hasSpeaker, hasLedStatus, smartDetectTypes[], smartDetectAudioTypes[], videoModes[], supportFullHdSnapshot), lcdMessage, ledSettings (isEnabled, floodLed, welcomeLed), osdSettings (isNameEnabled, isDateEnabled, isLogoEnabled, isDebugEnabled, overlayLocation), smartDetectSettings (objectTypes[], audioTypes[]). The Integration API does NOT expose recording state, motion timestamps, connection/last-seen, firmware, host, or per-channel stream config.",
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
        "Get details for a specific camera by ID. The Protect Integration API returns the SAME field set as protect_list_cameras entries (id, mac, name, modelKey, state, activePatrolSlot, hasPackageCamera, hdrType, isMicEnabled, micVolume, videoMode, featureFlags, lcdMessage, ledSettings, osdSettings, smartDetectSettings) — there is no extended/by-id-only payload. Recording state, motion events, zones, and channel/RTSP config are NOT exposed by this API surface.",
      inputSchema: { id: z.string().describe("Camera ID") },
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
        "Get a JPEG snapshot from a camera. Returns a base64-encoded image/jpeg (rendered directly by MCP clients). Use highQuality=true for full-resolution capture from the camera's main channel; otherwise a low-res thumbnail is returned.",
      inputSchema: {
        id: z.string().describe("Camera ID"),
        highQuality: z
          .boolean()
          .optional()
          .describe("If true, request a high-quality snapshot"),
      },
      annotations: READ_ONLY,
    },
    async ({ id, highQuality }) => {
      try {
        const url = highQuality
          ? safePath`/cameras/${id}/snapshot?highQuality=true`
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
        "Get active RTSPS stream sessions for a camera. Returns the per-quality stream URLs currently published (keys typically: high, medium, low, package). Empty/missing keys mean no session is currently active at that quality — use protect_create_rtsp_stream to start one.",
      inputSchema: { id: z.string().describe("Camera ID") },
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
      description: "Update camera settings (partial update via PATCH)",
      inputSchema: {
        id: z.string().describe("Camera ID"),
        settings: z
          .record(z.string(), z.unknown())
          .describe("Partial camera settings to update. Known fields: name (string), osdSettings (object), ledSettings (object), lcdMessage (object), videoMode (string: \"default\" | \"highFps\" | \"slo-mo\"), hdrType (string: \"off\" | \"normal\" | \"always\"), micVolume (number 0-100), smartDetectSettings (object)"),
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
      description: "Create an RTSPS stream session for a camera",
      inputSchema: {
        id: z.string().describe("Camera ID"),
        qualities: z
          .array(z.enum(["high", "medium", "low", "package"]))
          .describe("Quality levels to include in the RTSPS stream"),
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
        id: z.string().describe("Camera ID"),
        qualities: z
          .array(z.enum(["high", "medium", "low", "package"]))
          .describe("Quality levels to remove from the RTSPS stream"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ id, qualities, dryRun }) => {
      try {
        if (dryRun) {
          return formatDryRun(
            "DELETE",
            safePath`/cameras/${id}/rtsps-stream?qualities=${qualities.join(",")}`
          );
        }
        const data = await client.delete(
          safePath`/cameras/${id}/rtsps-stream?qualities=${qualities.join(",")}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_create_talkback",
    {
      description: "Create a talkback (two-way audio) session for a camera",
      inputSchema: {
        id: z.string().describe("Camera ID"),
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
        "IRREVERSIBLE: Permanently disable the microphone on a camera. Can only be re-enabled by factory resetting the camera.",
      inputSchema: {
        id: z.string().describe("Camera ID"),
        confirm: z
          .literal(true)
          .describe("Must be true to confirm this irreversible action"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ id, confirm }) => {
      const denied = requireConfirmation(confirm, "permanently disable the microphone");
      if (denied) return denied;
      try {
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
        id: z.string().describe("Camera ID"),
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
        id: z.string().describe("Camera ID"),
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
        id: z.string().describe("Camera ID"),
        slot: z.number().int().min(-1).max(4).describe("PTZ preset slot number (0-4, or -1 for home position)"),
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
