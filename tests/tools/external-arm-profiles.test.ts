import { describe, it, expect, beforeEach } from "vitest";
import {
  createMockServer,
  createMockClient,
  mockFn,
  expectSuccess,
  expectError,
  parseInputSchema,
} from "./_helpers.js";
import {
  registerExternalArmProfileTools,
  EXTERNAL_ARM_PROFILE_CONFIRM_FIELDS,
} from "../../src/tools/external-arm-profiles.js";

const DAY = { type: "intervals", entries: [{ start: { hour: 22, minute: 0 }, end: { hour: 6, minute: 30 } }] };

/** GET /v1/external/arm-profiles/{id}: the 7.4.99 doc response sample's shape. */
const PROFILE = {
  id: "xp1",
  title: "Night",
  alarm_ids: ["alarm1"],
  created_at: "string",
  state: "disarmed",
  state_set_at: "string",
  state_promotion_due_at: "string",
  schedule: { sun: DAY, mon: DAY },
  updated_at: "string",
  created_by: "string",
  updated_by: "string",
  active_breach_id: 0,
  has_pin: true,
  activation_delay: 60,
  deactivation_delay: 30,
};

describe("external arm profile tools", () => {
  let handlers: ReturnType<typeof createMockServer>["handlers"];
  let configs: ReturnType<typeof createMockServer>["configs"];
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    const mock = createMockServer();
    ({ handlers, configs } = mock);
    client = createMockClient();
    registerExternalArmProfileTools(mock.server, client, false);
  });

  const call = (name: string, args: Record<string, unknown>) => handlers.get(name)!(args);

  describe("protect_list_external_arm_profiles", () => {
    it("lists profiles from the external route", async () => {
      mockFn(client, "get").mockResolvedValue([PROFILE]);
      const result = await call("protect_list_external_arm_profiles", {});
      expectSuccess(result, "Night");
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/external/arm-profiles");
    });

    it("pages with limit and offset", async () => {
      mockFn(client, "get").mockResolvedValue([PROFILE, { ...PROFILE, id: "xp2" }]);
      const result = await call("protect_list_external_arm_profiles", { limit: 1, offset: 1 });
      expect(result.structuredContent).toMatchObject({ result: [{ id: "xp2" }], totalCount: 2, offset: 1 });
    });

    it("returns error on failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("HTTP 400"));
      expectError(await call("protect_list_external_arm_profiles", {}));
    });

    it("says when the tools apply", () => {
      expect(configs.get("protect_list_external_arm_profiles")!.description).toContain("featureFlags.useExternalAlarmManager");
    });
  });

  describe("protect_get_external_arm_profile", () => {
    it("gets one profile by ID", async () => {
      mockFn(client, "get").mockResolvedValue(PROFILE);
      expectSuccess(await call("protect_get_external_arm_profile", { id: "xp1" }), "has_pin");
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/external/arm-profiles/xp1");
    });

    it("returns error on failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("HTTP 404: Entity 'externalArmProfile' not found"));
      expectError(await call("protect_get_external_arm_profile", { id: "nope" }));
    });
  });

  describe("protect_create_external_arm_profile", () => {
    it("sends only the fields given", async () => {
      mockFn(client, "post").mockResolvedValue(PROFILE);
      const result = await call("protect_create_external_arm_profile", { title: "Night", activation_delay: 60, pin_code: null });
      expectSuccess(result, "Night");
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/external/arm-profiles", {
        title: "Night",
        activation_delay: 60,
        pin_code: null,
      });
    });

    it("dry-run previews the body without calling the client", async () => {
      const result = await call("protect_create_external_arm_profile", { title: "Night", schedule: { sun: DAY }, dryRun: true });
      expect(JSON.parse(result.content[0].text)).toEqual({
        dryRun: true,
        action: "POST",
        path: "/external/arm-profiles",
        body: { title: "Night", schedule: { sun: DAY } },
      });
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("invalid"));
      expectError(await call("protect_create_external_arm_profile", { title: "Night" }));
    });

    it.each([
      ["no title", {}],
      ["an empty title", { title: "" }],
      ["a delay above the documented maximum", { title: "x", activation_delay: 3601 }],
      ["a negative delay", { title: "x", deactivation_delay: -1 }],
      ["an empty schedule", { title: "x", schedule: {} }],
      ["an empty alarm ID", { title: "x", alarm_ids: [""] }],
    ])("rejects %s", (_label, input) => {
      expect(parseInputSchema(configs, "protect_create_external_arm_profile").safeParse(input).success).toBe(false);
    });
  });

  describe("protect_update_external_arm_profile", () => {
    it("renames without confirm", async () => {
      mockFn(client, "patch").mockResolvedValue({ ...PROFILE, title: "Away" });
      const result = await call("protect_update_external_arm_profile", { id: "xp1", settings: { title: "Away" } });
      expectSuccess(result, "Away");
      expect(mockFn(client, "patch")).toHaveBeenCalledWith("/external/arm-profiles/xp1", { title: "Away" });
    });

    it.each(EXTERNAL_ARM_PROFILE_CONFIRM_FIELDS)("refuses to change %s without confirm", async (field) => {
      const result = await call("protect_update_external_arm_profile", { id: "xp1", settings: { title: "Away", [field]: null } });
      expectError(result);
      expect(mockFn(client, "patch")).not.toHaveBeenCalled();
    });

    it("clears the PIN with confirm", async () => {
      mockFn(client, "patch").mockResolvedValue({ ...PROFILE, has_pin: false });
      const result = await call("protect_update_external_arm_profile", { id: "xp1", settings: { pin_code: null }, confirm: true });
      expect(result.isError).toBeFalsy();
      expect(mockFn(client, "patch")).toHaveBeenCalledWith("/external/arm-profiles/xp1", { pin_code: null });
    });

    it("dry-run needs no confirm", async () => {
      const result = await call("protect_update_external_arm_profile", { id: "xp1", settings: { schedule: null }, dryRun: true });
      expect(JSON.parse(result.content[0].text)).toMatchObject({ dryRun: true, action: "PATCH", path: "/external/arm-profiles/xp1" });
      expect(mockFn(client, "patch")).not.toHaveBeenCalled();
    });

    it("accepts null for each nullable field, as the docs allow", () => {
      const schema = parseInputSchema(configs, "protect_update_external_arm_profile");
      for (const field of EXTERNAL_ARM_PROFILE_CONFIRM_FIELDS) {
        expect(schema.safeParse({ id: "xp1", settings: { [field]: null } }).success, field).toBe(true);
      }
    });

    it.each([
      ["empty settings", {}],
      ["a null title", { title: null }],
    ])("rejects %s", (_label, settings) => {
      expect(parseInputSchema(configs, "protect_update_external_arm_profile").safeParse({ id: "xp1", settings }).success).toBe(false);
    });
  });

  describe.each([
    ["protect_delete_external_arm_profile", "delete" as const, "DELETE", "/external/arm-profiles/xp1"],
    ["protect_disarm_external_arm_profile", "post" as const, "POST", "/external/arm-profiles/xp1/actions/disarm"],
  ])("%s", (name, method, action, path) => {
    it("refuses without confirm", async () => {
      expectError(await call(name, { id: "xp1" }));
      expect(mockFn(client, method)).not.toHaveBeenCalled();
    });

    it("acts with confirm", async () => {
      mockFn(client, method).mockResolvedValue("");
      const result = await call(name, { id: "xp1", confirm: true });
      expect(result.isError).toBeFalsy();
      expect(mockFn(client, method)).toHaveBeenCalledWith(path);
    });

    it("dry-run needs no confirm", async () => {
      const result = await call(name, { id: "xp1", dryRun: true });
      expect(JSON.parse(result.content[0].text)).toEqual({ dryRun: true, action, path });
      expect(mockFn(client, method)).not.toHaveBeenCalled();
    });

    it("returns error on failure", async () => {
      mockFn(client, method).mockRejectedValue(new Error("fail"));
      expectError(await call(name, { id: "xp1", confirm: true }));
    });
  });

  describe("protect_arm_external_arm_profile", () => {
    it("arms without confirm and returns the profile", async () => {
      mockFn(client, "post").mockResolvedValue({ ...PROFILE, state: "armed" });
      expectSuccess(await call("protect_arm_external_arm_profile", { id: "xp1" }), "armed");
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/external/arm-profiles/xp1/actions/arm");
    });

    it("dry-run does not call the client", async () => {
      const result = await call("protect_arm_external_arm_profile", { id: "xp1", dryRun: true });
      expect(JSON.parse(result.content[0].text)).toMatchObject({ dryRun: true, path: "/external/arm-profiles/xp1/actions/arm" });
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("fail"));
      expectError(await call("protect_arm_external_arm_profile", { id: "xp1" }));
    });
  });

  describe("annotations", () => {
    it.each([
      ["protect_list_external_arm_profiles", true, false],
      ["protect_get_external_arm_profile", true, false],
      ["protect_create_external_arm_profile", false, false],
      ["protect_arm_external_arm_profile", false, false],
      ["protect_update_external_arm_profile", false, true],
      ["protect_delete_external_arm_profile", false, true],
      ["protect_disarm_external_arm_profile", false, true],
    ])("%s: readOnlyHint %s, destructiveHint %s", (name, readOnlyHint, destructiveHint) => {
      expect(configs.get(name)!.annotations).toMatchObject({ readOnlyHint, destructiveHint });
    });
  });
});

describe("external arm profile tools - read-only mode", () => {
  it("registers only the list and get tools", () => {
    const { server, configs } = createMockServer();
    registerExternalArmProfileTools(server, createMockClient(), true);
    expect([...configs.keys()].sort()).toEqual([
      "protect_get_external_arm_profile",
      "protect_list_external_arm_profiles",
    ]);
  });
});
