import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";

export function registerCameraTools(
  server: McpServer,
  client: ProtectClient
) {
  server.tool(
    "protect_list_cameras",
    "List all cameras managed by UniFi Protect",
    {},
    async () => {
      try {
        const data = await client.get("/cameras");
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "protect_get_camera",
    "Get details for a specific camera by ID",
    { id: z.string().describe("Camera ID") },
    async ({ id }) => {
      try {
        const data = await client.get(`/cameras/${id}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "protect_update_camera",
    "Update camera settings (partial update via PATCH)",
    {
      id: z.string().describe("Camera ID"),
      settings: z
        .record(z.unknown())
        .describe("Partial camera settings to update (JSON object)"),
    },
    async ({ id, settings }) => {
      try {
        const data = await client.patch(`/cameras/${id}`, settings);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "protect_get_snapshot",
    "Get a JPEG snapshot from a camera (returns image)",
    { id: z.string().describe("Camera ID") },
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

  server.tool(
    "protect_create_rtsp_stream",
    "Create an RTSPS stream session for a camera",
    { id: z.string().describe("Camera ID") },
    async ({ id }) => {
      try {
        const data = await client.post(`/cameras/${id}/rtsps-stream`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "protect_get_rtsp_streams",
    "Get active RTSPS stream sessions for a camera",
    { id: z.string().describe("Camera ID") },
    async ({ id }) => {
      try {
        const data = await client.get(`/cameras/${id}/rtsps-stream`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "protect_delete_rtsp_stream",
    "Delete/stop an RTSPS stream session for a camera",
    { id: z.string().describe("Camera ID") },
    async ({ id }) => {
      try {
        const data = await client.delete(`/cameras/${id}/rtsps-stream`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "protect_create_talkback",
    "Create a talkback (two-way audio) session for a camera",
    { id: z.string().describe("Camera ID") },
    async ({ id }) => {
      try {
        const data = await client.post(`/cameras/${id}/talkback-session`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "protect_disable_mic",
    "Permanently disable the microphone on a camera",
    { id: z.string().describe("Camera ID") },
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

  server.tool(
    "protect_start_ptz_patrol",
    "Start PTZ patrol on a camera at a given slot",
    {
      id: z.string().describe("Camera ID"),
      slot: z.number().int().describe("Patrol slot number"),
    },
    async ({ id, slot }) => {
      try {
        const data = await client.post(
          `/cameras/${id}/ptz/patrol/start/${slot}`
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "protect_stop_ptz_patrol",
    "Stop PTZ patrol on a camera",
    { id: z.string().describe("Camera ID") },
    async ({ id }) => {
      try {
        const data = await client.post(`/cameras/${id}/ptz/patrol/stop`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );

  server.tool(
    "protect_goto_ptz_preset",
    "Move camera PTZ to a preset position",
    {
      id: z.string().describe("Camera ID"),
      slot: z.number().int().describe("PTZ preset slot number"),
    },
    async ({ id, slot }) => {
      try {
        const data = await client.post(`/cameras/${id}/ptz/goto/${slot}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
    }
  );
}
