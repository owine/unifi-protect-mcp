import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient, mockFn, expectSuccess, expectError } from "./_helpers.js";
import { registerArmProfileTools } from "../../src/tools/arm-profiles.js";

describe("arm profile tools", () => {
  const { server, handlers, configs } = createMockServer();
  const client = createMockClient();
  registerArmProfileTools(server, client, false);

  describe("protect_list_arm_profiles", () => {
    it("lists arm profiles", async () => {
      mockFn(client, "get").mockResolvedValue([{ id: "p1", name: "Home" }]);
      const result = await handlers.get("protect_list_arm_profiles")!({});
      expectSuccess(result, "Home");
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/arm-profiles");
    });

    it("returns error on failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_list_arm_profiles")!({});
      expectError(result);
    });

    it("has read-only annotations", () => {
      expect(configs.get("protect_list_arm_profiles")!.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
      });
    });
  });

  describe("protect_create_arm_profile", () => {
    const baseInput = {
      name: "Home",
      automations: ["a1"],
      schedules: [{}],
      recordEverything: true,
      activationDelay: 0,
    };

    it("creates an arm profile", async () => {
      mockFn(client, "post").mockResolvedValue({ id: "p1", name: "Home" });
      const result = await handlers.get("protect_create_arm_profile")!(baseInput);
      expectSuccess(result, "Home");
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/arm-profiles", baseInput);
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("invalid"));
      const result = await handlers.get("protect_create_arm_profile")!(baseInput);
      expectError(result);
    });

    it("dry-run does not call client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_create_arm_profile")!({
        ...baseInput,
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("POST");
      expect(data.path).toBe("/arm-profiles");
      expect(data.body).toEqual(baseInput);
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });

    it("has WRITE annotations", () => {
      expect(configs.get("protect_create_arm_profile")!.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
      });
    });
  });

  describe("protect_set_current_arm_profile", () => {
    it("sets current profile", async () => {
      mockFn(client, "patch").mockResolvedValue({ ok: true });
      await handlers.get("protect_set_current_arm_profile")!({ armProfileId: "p1" });
      expect(mockFn(client, "patch")).toHaveBeenCalledWith("/arm-profiles/settings", {
        armProfileId: "p1",
      });
    });

    it("returns error on failure", async () => {
      mockFn(client, "patch").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_set_current_arm_profile")!({
        armProfileId: "p1",
      });
      expectError(result);
    });

    it("dry-run does not call client", async () => {
      mockFn(client, "patch").mockClear();
      const result = await handlers.get("protect_set_current_arm_profile")!({
        armProfileId: "p1",
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.path).toBe("/arm-profiles/settings");
      expect(mockFn(client, "patch")).not.toHaveBeenCalled();
    });
  });

  describe("protect_update_arm_profile", () => {
    it("updates profile", async () => {
      mockFn(client, "patch").mockResolvedValue({ id: "p1", name: "Renamed" });
      await handlers.get("protect_update_arm_profile")!({
        id: "p1",
        settings: { name: "Renamed" },
      });
      expect(mockFn(client, "patch")).toHaveBeenCalledWith("/arm-profiles/p1", {
        name: "Renamed",
      });
    });

    it("returns error on failure", async () => {
      mockFn(client, "patch").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_update_arm_profile")!({
        id: "p1",
        settings: {},
      });
      expectError(result);
    });

    it("dry-run does not call client", async () => {
      mockFn(client, "patch").mockClear();
      const result = await handlers.get("protect_update_arm_profile")!({
        id: "p1",
        settings: { name: "Test" },
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.path).toBe("/arm-profiles/p1");
      expect(mockFn(client, "patch")).not.toHaveBeenCalled();
    });
  });

  describe("protect_delete_arm_profile", () => {
    it("deletes profile", async () => {
      mockFn(client, "delete").mockResolvedValue({ ok: true });
      await handlers.get("protect_delete_arm_profile")!({ id: "p1" });
      expect(mockFn(client, "delete")).toHaveBeenCalledWith("/arm-profiles/p1");
    });

    it("returns error on failure", async () => {
      mockFn(client, "delete").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_delete_arm_profile")!({ id: "p1" });
      expectError(result);
    });

    it("dry-run does not call client", async () => {
      mockFn(client, "delete").mockClear();
      const result = await handlers.get("protect_delete_arm_profile")!({
        id: "p1",
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("DELETE");
      expect(data.path).toBe("/arm-profiles/p1");
      expect(mockFn(client, "delete")).not.toHaveBeenCalled();
    });

    it("has DESTRUCTIVE annotations", () => {
      expect(configs.get("protect_delete_arm_profile")!.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
      });
    });
  });

  describe("protect_enable_arm_alarm", () => {
    it("enables arm alarm", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      await handlers.get("protect_enable_arm_alarm")!({});
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/arm-profiles/enable");
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_enable_arm_alarm")!({});
      expectError(result);
    });

    it("dry-run does not call client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_enable_arm_alarm")!({ dryRun: true });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.path).toBe("/arm-profiles/enable");
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });
  });

  describe("protect_disable_arm_alarm", () => {
    it("disables arm alarm", async () => {
      mockFn(client, "post").mockResolvedValue({ ok: true });
      await handlers.get("protect_disable_arm_alarm")!({});
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/arm-profiles/disable");
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_disable_arm_alarm")!({});
      expectError(result);
    });

    it("dry-run does not call client", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_disable_arm_alarm")!({ dryRun: true });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.path).toBe("/arm-profiles/disable");
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });
  });
});

describe("arm profile tools - read-only mode", () => {
  const { server, handlers } = createMockServer();
  const client = createMockClient();
  registerArmProfileTools(server, client, true);

  it("registers only the list tool", () => {
    expect(handlers.has("protect_list_arm_profiles")).toBe(true);
    expect(handlers.size).toBe(1);
  });

  it("excludes write tools", () => {
    for (const name of [
      "protect_create_arm_profile",
      "protect_set_current_arm_profile",
      "protect_update_arm_profile",
      "protect_delete_arm_profile",
      "protect_enable_arm_alarm",
      "protect_disable_arm_alarm",
    ]) {
      expect(handlers.has(name), `${name} should not be registered in read-only`).toBe(false);
    }
  });
});
