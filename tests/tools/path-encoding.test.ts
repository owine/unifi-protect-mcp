import { describe, it, expect, beforeEach } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerCameraTools } from "../../src/tools/cameras.js";
import { registerDeviceTools } from "../../src/tools/devices.js";
import { registerFileTools } from "../../src/tools/files.js";
import { registerLiveviewTools } from "../../src/tools/liveviews.js";

/**
 * Verifies that tool handlers encode user-supplied path segments via safePath.
 * A malicious ID containing path traversal or query injection characters
 * must appear encoded in the URL passed to the ProtectClient.
 */

const MALICIOUS_ID = "../admin?key=val#frag";
const ENCODED_ID = "..%2Fadmin%3Fkey%3Dval%23frag";

let handlers: Map<string, (...args: any[]) => any>;
let client: ReturnType<typeof createMockClient>;

beforeEach(() => {
  const mock = createMockServer();
  client = createMockClient();
  handlers = mock.handlers;

  mockFn(client, "get").mockResolvedValue({ id: "ok" });
  mockFn(client, "post").mockResolvedValue({ id: "ok" });
  mockFn(client, "patch").mockResolvedValue({ id: "ok" });
  mockFn(client, "delete").mockResolvedValue({ id: "ok" });
  mockFn(client, "getBinary").mockResolvedValue({
    data: Buffer.from("img"),
    mimeType: "image/jpeg",
  });
  mockFn(client, "postBinary").mockResolvedValue({ id: "ok" });

  registerCameraTools(mock.server, client, false);
  registerDeviceTools(mock.server, client, false);
  registerFileTools(mock.server, client, false);
  registerLiveviewTools(mock.server, client, false);
});

function assertPathContains(
  method: keyof ReturnType<typeof createMockClient>,
  encodedSegment: string,
) {
  const fn = mockFn(client, method as keyof import("../../src/client.js").ProtectClient);
  expect(fn).toHaveBeenCalled();

  const paths = (fn.mock.calls as [string, ...unknown[]][]).map((call) => call[0]);

  for (const path of paths) {
    expect(path).not.toContain(MALICIOUS_ID);
  }

  expect(paths.some((path) => path.includes(encodedSegment))).toBe(true);
}

describe("path encoding in camera tools", () => {
  it("protect_get_camera encodes id", async () => {
    await handlers.get("protect_get_camera")!({ id: MALICIOUS_ID });
    assertPathContains("get", ENCODED_ID);
  });

  it("protect_get_snapshot encodes id", async () => {
    await handlers.get("protect_get_snapshot")!({ id: MALICIOUS_ID });
    assertPathContains("getBinary", ENCODED_ID);
  });

  it("protect_get_rtsp_streams encodes id", async () => {
    await handlers.get("protect_get_rtsp_streams")!({ id: MALICIOUS_ID });
    assertPathContains("get", ENCODED_ID);
  });

  it("protect_update_camera encodes id", async () => {
    await handlers.get("protect_update_camera")!({
      id: MALICIOUS_ID,
      settings: { name: "test" },
    });
    assertPathContains("patch", ENCODED_ID);
  });

  it("protect_create_rtsp_stream encodes id", async () => {
    await handlers.get("protect_create_rtsp_stream")!({ id: MALICIOUS_ID });
    assertPathContains("post", ENCODED_ID);
  });

  it("protect_delete_rtsp_stream encodes id", async () => {
    await handlers.get("protect_delete_rtsp_stream")!({ id: MALICIOUS_ID });
    assertPathContains("delete", ENCODED_ID);
  });

  it("protect_create_talkback encodes id", async () => {
    await handlers.get("protect_create_talkback")!({ id: MALICIOUS_ID });
    assertPathContains("post", ENCODED_ID);
  });

  it("protect_disable_mic encodes id", async () => {
    await handlers.get("protect_disable_mic")!({
      id: MALICIOUS_ID,
      confirm: true,
    });
    assertPathContains("post", ENCODED_ID);
  });

  it("protect_start_ptz_patrol encodes id and slot", async () => {
    await handlers.get("protect_start_ptz_patrol")!({
      id: MALICIOUS_ID,
      slot: 1,
    });
    assertPathContains("post", ENCODED_ID);
  });

  it("protect_stop_ptz_patrol encodes id", async () => {
    await handlers.get("protect_stop_ptz_patrol")!({ id: MALICIOUS_ID });
    assertPathContains("post", ENCODED_ID);
  });

  it("protect_goto_ptz_preset encodes id", async () => {
    await handlers.get("protect_goto_ptz_preset")!({
      id: MALICIOUS_ID,
      slot: 1,
    });
    assertPathContains("post", ENCODED_ID);
  });
});

describe("path encoding in device tools", () => {
  for (const device of ["light", "sensor", "chime", "viewer"]) {
    it(`protect_get_${device} encodes id`, async () => {
      await handlers.get(`protect_get_${device}`)!({ id: MALICIOUS_ID });
      assertPathContains("get", ENCODED_ID);
    });

    it(`protect_update_${device} encodes id`, async () => {
      await handlers.get(`protect_update_${device}`)!({
        id: MALICIOUS_ID,
        settings: { name: "test" },
      });
      assertPathContains("patch", ENCODED_ID);
    });
  }
});

describe("path encoding in file tools", () => {
  it("protect_list_files encodes fileType", async () => {
    await handlers.get("protect_list_files")!({ fileType: MALICIOUS_ID });
    assertPathContains("get", ENCODED_ID);
  });

  it("protect_trigger_alarm_webhook encodes id", async () => {
    await handlers.get("protect_trigger_alarm_webhook")!({
      id: MALICIOUS_ID,
      confirm: true,
    });
    assertPathContains("post", ENCODED_ID);
  });

  it("protect_upload_file encodes fileType", async () => {
    await handlers.get("protect_upload_file")!({
      fileType: MALICIOUS_ID,
      base64Data: "dGVzdA==",
      contentType: "video/mp4",
    });
    assertPathContains("postBinary", ENCODED_ID);
  });
});

describe("path encoding in liveview tools", () => {
  it("protect_get_liveview encodes id", async () => {
    await handlers.get("protect_get_liveview")!({ id: MALICIOUS_ID });
    assertPathContains("get", ENCODED_ID);
  });

  it("protect_update_liveview encodes id", async () => {
    await handlers.get("protect_update_liveview")!({
      id: MALICIOUS_ID,
      settings: { name: "test" },
    });
    assertPathContains("patch", ENCODED_ID);
  });
});

describe("dryRun paths are also encoded", () => {
  it("protect_update_camera dryRun encodes id in path", async () => {
    const result = await handlers.get("protect_update_camera")!({
      id: MALICIOUS_ID,
      settings: { name: "test" },
      dryRun: true,
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.path).toContain(ENCODED_ID);
    expect(data.path).not.toContain(MALICIOUS_ID);
  });

  it("protect_upload_file dryRun encodes fileType in path", async () => {
    const result = await handlers.get("protect_upload_file")!({
      fileType: MALICIOUS_ID,
      base64Data: "dGVzdA==",
      contentType: "video/mp4",
      dryRun: true,
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.path).toContain(ENCODED_ID);
    expect(data.path).not.toContain(MALICIOUS_ID);
  });
});
