import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient, parseInputSchema } from "./_helpers.js";
import { registerCameraTools } from "../../src/tools/cameras.js";
import { registerDeviceTools } from "../../src/tools/devices.js";
import { registerFileTools } from "../../src/tools/files.js";
import { registerLiveviewTools } from "../../src/tools/liveviews.js";

/**
 * These tests validate the Zod input schemas registered on each tool.
 * The handler tests in other files bypass schema validation entirely
 * (createMockServer passes raw input to handlers), so these tests
 * ensure that safety-critical schemas like z.literal(true) on confirm
 * actually reject invalid inputs.
 */

const { server, configs } = createMockServer();
const client = createMockClient();
registerCameraTools(server, client, false);
registerDeviceTools(server, client, false);
registerFileTools(server, client, false);
registerLiveviewTools(server, client, false);

describe("confirm: z.literal(true) pattern", () => {
  const confirmTools = ["protect_disable_mic", "protect_trigger_alarm_webhook"];

  for (const toolName of confirmTools) {
    describe(toolName, () => {
      const schema = parseInputSchema(configs, toolName);

      it("accepts confirm: true", () => {
        const result = schema.safeParse({ id: "test-id", confirm: true });
        expect(result.success).toBe(true);
      });

      it("rejects confirm: false", () => {
        const result = schema.safeParse({ id: "test-id", confirm: false });
        expect(result.success).toBe(false);
      });

      it("rejects confirm: undefined (missing)", () => {
        const result = schema.safeParse({ id: "test-id" });
        expect(result.success).toBe(false);
      });

      it("rejects confirm: string 'true'", () => {
        const result = schema.safeParse({ id: "test-id", confirm: "true" });
        expect(result.success).toBe(false);
      });

      it("rejects confirm: 1", () => {
        const result = schema.safeParse({ id: "test-id", confirm: 1 });
        expect(result.success).toBe(false);
      });
    });
  }
});

describe("required string fields", () => {
  const toolsWithId = [
    "protect_get_camera",
    "protect_get_snapshot",
    "protect_get_rtsp_streams",
    "protect_get_light",
    "protect_get_sensor",
    "protect_get_chime",
    "protect_get_viewer",
    "protect_get_liveview",
  ];

  for (const toolName of toolsWithId) {
    describe(toolName, () => {
      const schema = parseInputSchema(configs, toolName);

      it("accepts a valid string id", () => {
        const result = schema.safeParse({ id: "abc123" });
        expect(result.success).toBe(true);
      });

      it("rejects missing id", () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(false);
      });

      it("rejects non-string id", () => {
        const result = schema.safeParse({ id: 123 });
        expect(result.success).toBe(false);
      });
    });
  }
});

describe("required number fields", () => {
  describe("protect_start_ptz_patrol", () => {
    const schema = parseInputSchema(configs, "protect_start_ptz_patrol");

    it("accepts valid integer slot", () => {
      const result = schema.safeParse({ id: "cam1", slot: 2 });
      expect(result.success).toBe(true);
    });

    it("rejects missing slot", () => {
      const result = schema.safeParse({ id: "cam1" });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer slot", () => {
      const result = schema.safeParse({ id: "cam1", slot: 2.5 });
      expect(result.success).toBe(false);
    });

    it("rejects string slot", () => {
      const result = schema.safeParse({ id: "cam1", slot: "2" });
      expect(result.success).toBe(false);
    });
  });

  describe("protect_goto_ptz_preset", () => {
    const schema = parseInputSchema(configs, "protect_goto_ptz_preset");

    it("accepts valid integer slot", () => {
      const result = schema.safeParse({ id: "cam1", slot: 3 });
      expect(result.success).toBe(true);
    });

    it("rejects non-integer slot", () => {
      const result = schema.safeParse({ id: "cam1", slot: 1.7 });
      expect(result.success).toBe(false);
    });
  });
});

describe("optional dryRun field", () => {
  const toolsWithDryRun = [
    "protect_update_camera",
    "protect_create_rtsp_stream",
    "protect_delete_rtsp_stream",
    "protect_create_talkback",
    "protect_start_ptz_patrol",
    "protect_stop_ptz_patrol",
    "protect_goto_ptz_preset",
    "protect_update_light",
    "protect_update_sensor",
    "protect_update_chime",
    "protect_update_viewer",
    "protect_create_liveview",
    "protect_update_liveview",
    "protect_upload_file",
  ];

  for (const toolName of toolsWithDryRun) {
    describe(toolName, () => {
      const schema = parseInputSchema(configs, toolName);

      it("accepts dryRun: true", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse({ ...base, dryRun: true });
        expect(result.success).toBe(true);
      });

      it("accepts dryRun: false", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse({ ...base, dryRun: false });
        expect(result.success).toBe(true);
      });

      it("accepts dryRun: undefined (omitted)", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse(base);
        expect(result.success).toBe(true);
      });

      it("rejects dryRun: string", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse({ ...base, dryRun: "true" });
        expect(result.success).toBe(false);
      });
    });
  }
});

describe("record fields (settings)", () => {
  const toolsWithSettings = [
    "protect_update_camera",
    "protect_update_light",
    "protect_update_sensor",
    "protect_update_chime",
    "protect_update_viewer",
    "protect_create_liveview",
    "protect_update_liveview",
  ];

  for (const toolName of toolsWithSettings) {
    describe(toolName, () => {
      const schema = parseInputSchema(configs, toolName);

      it("accepts an object for settings", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse({ ...base, settings: { name: "test" } });
        expect(result.success).toBe(true);
      });

      it("rejects a string for settings", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse({ ...base, settings: "not an object" });
        expect(result.success).toBe(false);
      });

      it("rejects an array for settings", () => {
        const base = buildMinimalInput(toolName);
        const result = schema.safeParse({ ...base, settings: [1, 2] });
        expect(result.success).toBe(false);
      });
    });
  }
});

/** Build minimal valid input for a tool (without dryRun) */
function buildMinimalInput(toolName: string): Record<string, unknown> {
  if (toolName === "protect_create_liveview") {
    return { settings: { name: "test" } };
  }
  if (toolName === "protect_upload_file") {
    return { fileType: "video", base64Data: "abc", contentType: "video/mp4" };
  }
  if (
    toolName === "protect_start_ptz_patrol" ||
    toolName === "protect_goto_ptz_preset"
  ) {
    return { id: "cam1", slot: 1 };
  }
  if (toolName.startsWith("protect_update_")) {
    return { id: "test-id", settings: { name: "test" } };
  }
  // Most tools just need an id
  return { id: "test-id" };
}
