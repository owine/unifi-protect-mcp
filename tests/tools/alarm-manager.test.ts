import { describe, it, expect } from "vitest";
import {
  createMockServer,
  createMockClient,
  mockFn,
  expectSuccess,
  expectError,
  parseInputSchema,
} from "./_helpers.js";
import { registerAlarmManagerTools } from "../../src/tools/alarm-manager.js";

describe("alarm manager tools", () => {
  const { server, handlers, configs } = createMockServer();
  const client = createMockClient();
  registerAlarmManagerTools(server, client, false);

  describe("protect_trigger_alarm_webhook", () => {
    it("triggers webhook by ID when confirm is true", async () => {
      mockFn(client, "post").mockResolvedValue("");
      const result = await handlers.get("protect_trigger_alarm_webhook")!({
        id: "wh1",
        confirm: true,
      });
      expectSuccess(result, "triggered");
      expectSuccess(result, "wh1");
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/alarm-manager/webhook/wh1");
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("not found"));
      const result = await handlers.get("protect_trigger_alarm_webhook")!({
        id: "x",
        confirm: true,
      });
      expectError(result);
    });

    it("refuses to run without confirm", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_trigger_alarm_webhook")!({
        id: "wh1",
        confirm: false,
      });
      expect(result.isError).toBe(true);
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("previews a dry run without confirm", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_trigger_alarm_webhook")!({
        id: "wh1",
        dryRun: true,
      });
      expect(result.isError).toBeUndefined();
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("returns dry-run preview without calling client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_trigger_alarm_webhook")!({
        id: "wh1",
        confirm: true,
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("POST");
      expect(data.path).toBe("/alarm-manager/webhook/wh1");
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("has destructive annotations", () => {
      expect(configs.get("protect_trigger_alarm_webhook")!.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
      });
    });

    it("has alarm description", () => {
      expect(configs.get("protect_trigger_alarm_webhook")!.description).toContain(
        "external alarm"
      );
    });

    describe("input schema", () => {
      const schema = parseInputSchema(configs, "protect_trigger_alarm_webhook");

      it("accepts a non-empty id with confirm: true", () => {
        expect(schema.safeParse({ id: "wh1", confirm: true }).success).toBe(true);
      });

      it("rejects an empty id", () => {
        expect(schema.safeParse({ id: "", confirm: true }).success).toBe(false);
      });

      // A missing confirm is refused by the handler, after the dry-run branch.
      it("leaves a missing confirm to the handler", () => {
        expect(schema.safeParse({ id: "wh1" }).success).toBe(true);
      });

      it("accepts dryRun alongside confirm", () => {
        expect(schema.safeParse({ id: "wh1", confirm: true, dryRun: true }).success).toBe(true);
      });
    });
  });
});

describe("alarm manager tools - read-only mode", () => {
  const { server, handlers } = createMockServer();
  const client = createMockClient();
  registerAlarmManagerTools(server, client, true);

  it("registers no tools", () => {
    expect(handlers.size).toBe(0);
    expect(handlers.has("protect_trigger_alarm_webhook")).toBe(false);
  });
});
