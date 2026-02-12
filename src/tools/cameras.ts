import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";

const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false } as const;
const WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false } as const;
const DESTRUCTIVE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: true } as const;

export function registerCameraTools(
  server: McpServer,
  client: ProtectClient,
  readOnly: boolean
) {
  // --- Read-only tools (always registered) ---

  server.registerTool(
    "protect_list_cameras",
    {
      description: "List all cameras managed by UniFi Protect",
      annotations: READ_ONLY_ANNOTATIONS,
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
      description: "Get details for a specific camera by ID",
      inputSchema: { id: z.string().describe("Camera ID") },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const data = await client.get(`/cameras/${id}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.registerTool(
    "protect_get_snapshot",
    {
      description: "Get a JPEG snapshot from a camera (returns image)",
      inputSchema: { id: z.string().describe("Camera ID") },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const { data, mimeType } = await client.getBinary(
          `/cameras/${id}/snapshot`
        );
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
      description: "Get active RTSPS stream sessions for a camera",
      inputSchema: { id: z.string().describe("Camera ID") },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const data = await client.get(`/cameras/${id}/rtsps-stream`);
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
          .describe("Partial camera settings to update (JSON object)"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ id, settings, dryRun }) => {
      try {
        if (dryRun) {
          return formatSuccess({ dryRun: true, action: "PATCH", path: `/cameras/${id}`, body: settings });
        }
        const data = await client.patch(`/cameras/${id}`, settings);
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
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ id, dryRun }) => {
      try {
        if (dryRun) {
          return formatSuccess({ dryRun: true, action: "POST", path: `/cameras/${id}/rtsps-stream` });
        }
        const data = await client.post(`/cameras/${id}/rtsps-stream`);
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
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: DESTRUCTIVE_ANNOTATIONS,
    },
    async ({ id, dryRun }) => {
      try {
        if (dryRun) {
          return formatSuccess({ dryRun: true, action: "DELETE", path: `/cameras/${id}/rtsps-stream` });
        }
        const data = await client.delete(`/cameras/${id}/rtsps-stream`);
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
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ id, dryRun }) => {
      try {
        if (dryRun) {
          return formatSuccess({ dryRun: true, action: "POST", path: `/cameras/${id}/talkback-session` });
        }
        const data = await client.post(`/cameras/${id}/talkback-session`);
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
        "IRREVERSIBLE: Permanently disable the microphone on a camera. Cannot be re-enabled.",
      inputSchema: {
        id: z.string().describe("Camera ID"),
        confirm: z
          .literal(true)
          .describe("Must be true to confirm this irreversible action"),
      },
      annotations: DESTRUCTIVE_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const data = await client.post(
          `/cameras/${id}/disable-mic-permanently`
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
        slot: z.number().int().describe("Patrol slot number"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ id, slot, dryRun }) => {
      try {
        if (dryRun) {
          return formatSuccess({ dryRun: true, action: "POST", path: `/cameras/${id}/ptz/patrol/start/${slot}` });
        }
        const data = await client.post(
          `/cameras/${id}/ptz/patrol/start/${slot}`
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
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ id, dryRun }) => {
      try {
        if (dryRun) {
          return formatSuccess({ dryRun: true, action: "POST", path: `/cameras/${id}/ptz/patrol/stop` });
        }
        const data = await client.post(`/cameras/${id}/ptz/patrol/stop`);
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
        slot: z.number().int().describe("PTZ preset slot number"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ id, slot, dryRun }) => {
      try {
        if (dryRun) {
          return formatSuccess({ dryRun: true, action: "POST", path: `/cameras/${id}/ptz/goto/${slot}` });
        }
        const data = await client.post(`/cameras/${id}/ptz/goto/${slot}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
