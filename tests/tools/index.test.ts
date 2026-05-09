import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient } from "./_helpers.js";
import { registerAllTools } from "../../src/tools/index.js";

const SYSTEM_TOOLS = ["protect_get_info", "protect_list_nvrs"];
const SUBSCRIPTION_TOOLS = ["protect_subscribe_devices", "protect_subscribe_events"];

const CAMERA_TOOLS = [
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
];

const DEVICES: { singular: string; plural: string }[] = [
  { singular: "light", plural: "lights" },
  { singular: "sensor", plural: "sensors" },
  { singular: "chime", plural: "chimes" },
  { singular: "viewer", plural: "viewers" },
  { singular: "siren", plural: "sirens" },
  { singular: "fob", plural: "fobs" },
  { singular: "relay", plural: "relays" },
  { singular: "speaker", plural: "speakers" },
  { singular: "bridge", plural: "bridges" },
  { singular: "link_station", plural: "link_stations" },
  { singular: "alarm_hub", plural: "alarm_hubs" },
];
const DEVICE_SINGULARS = DEVICES.map((d) => d.singular);
const DEVICE_PLURALS = DEVICES.map((d) => d.plural);

const DEVICE_TOOLS_RW = [
  ...DEVICE_PLURALS.map((p) => `protect_list_${p}`),
  ...DEVICE_SINGULARS.map((s) => `protect_get_${s}`),
  ...DEVICE_SINGULARS.map((s) => `protect_update_${s}`),
];

const DEVICE_TOOLS_RO = [
  ...DEVICE_PLURALS.map((p) => `protect_list_${p}`),
  ...DEVICE_SINGULARS.map((s) => `protect_get_${s}`),
];

const LIVEVIEW_TOOLS = [
  "protect_list_liveviews",
  "protect_get_liveview",
  "protect_create_liveview",
  "protect_update_liveview",
];

const FILE_TOOLS = [
  "protect_trigger_alarm_webhook",
  "protect_list_files",
  "protect_upload_file",
];

const READ_ONLY_TOOLS = [
  ...SYSTEM_TOOLS,
  ...SUBSCRIPTION_TOOLS,
  // cameras read-only
  "protect_list_cameras",
  "protect_get_camera",
  "protect_get_snapshot",
  "protect_get_rtsp_streams",
  ...DEVICE_TOOLS_RO,
  // liveviews read-only
  "protect_list_liveviews",
  "protect_get_liveview",
  // files read-only
  "protect_list_files",
];

const ALL_TOOLS_RW = [
  ...SYSTEM_TOOLS,
  ...SUBSCRIPTION_TOOLS,
  ...CAMERA_TOOLS,
  ...DEVICE_TOOLS_RW,
  ...LIVEVIEW_TOOLS,
  ...FILE_TOOLS,
];

const WRITE_TOOLS = ALL_TOOLS_RW.filter((t) => !READ_ONLY_TOOLS.includes(t));

describe("registerAllTools", () => {
  it(`registers all ${ALL_TOOLS_RW.length} tools`, () => {
    const { server, handlers } = createMockServer();
    const client = createMockClient();
    registerAllTools(server, client, false);
    expect(handlers.size).toBe(ALL_TOOLS_RW.length);
  });

  it("registers expected tool names", () => {
    const { server, handlers } = createMockServer();
    const client = createMockClient();
    registerAllTools(server, client, false);

    for (const name of ALL_TOOLS_RW) {
      expect(handlers.has(name), `Missing tool: ${name}`).toBe(true);
    }
  });
});

describe("registerAllTools - read-only mode", () => {
  it(`registers only ${READ_ONLY_TOOLS.length} read-only tools`, () => {
    const { server, handlers } = createMockServer();
    const client = createMockClient();
    registerAllTools(server, client, true);
    expect(handlers.size).toBe(READ_ONLY_TOOLS.length);
  });

  it("includes all read-only tools", () => {
    const { server, handlers } = createMockServer();
    const client = createMockClient();
    registerAllTools(server, client, true);

    for (const name of READ_ONLY_TOOLS) {
      expect(handlers.has(name), `Missing read-only tool: ${name}`).toBe(true);
    }
  });

  it("excludes all write tools", () => {
    const { server, handlers } = createMockServer();
    const client = createMockClient();
    registerAllTools(server, client, true);

    for (const name of WRITE_TOOLS) {
      expect(handlers.has(name), `Write tool should be hidden: ${name}`).toBe(false);
    }
  });
});
