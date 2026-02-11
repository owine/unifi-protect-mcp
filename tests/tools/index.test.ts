import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient } from "./_helpers.js";
import { registerAllTools } from "../../src/tools/index.js";

describe("registerAllTools", () => {
  it("registers all 33 tools", () => {
    const { server, handlers } = createMockServer();
    const client = createMockClient();
    registerAllTools(server, client);
    expect(handlers.size).toBe(33);
  });

  it("registers expected tool names", () => {
    const { server, handlers } = createMockServer();
    const client = createMockClient();
    registerAllTools(server, client);

    const expectedTools = [
      // System (2)
      "protect_get_info",
      "protect_list_nvrs",
      // Cameras (12)
      "protect_list_cameras",
      "protect_get_camera",
      "protect_update_camera",
      "protect_get_snapshot",
      "protect_create_rtsp_stream",
      "protect_get_rtsp_streams",
      "protect_delete_rtsp_stream",
      "protect_create_talkback",
      "protect_disable_mic",
      "protect_start_ptz_patrol",
      "protect_stop_ptz_patrol",
      "protect_goto_ptz_preset",
      // Devices (4 types x 3 = 12)
      "protect_list_lights",
      "protect_get_light",
      "protect_update_light",
      "protect_list_sensors",
      "protect_get_sensor",
      "protect_update_sensor",
      "protect_list_chimes",
      "protect_get_chime",
      "protect_update_chime",
      "protect_list_viewers",
      "protect_get_viewer",
      "protect_update_viewer",
      // Liveviews (4)
      "protect_list_liveviews",
      "protect_get_liveview",
      "protect_create_liveview",
      "protect_update_liveview",
      // Files (3)
      "protect_trigger_alarm_webhook",
      "protect_list_files",
      "protect_upload_file",
    ];

    for (const name of expectedTools) {
      expect(handlers.has(name), `Missing tool: ${name}`).toBe(true);
    }
    expect(expectedTools.length).toBe(33);
  });
});
