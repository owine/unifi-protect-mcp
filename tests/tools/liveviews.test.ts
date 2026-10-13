import { describe, it, expect } from "vitest";
import {
  createMockServer,
  createMockClient,
  mockFn,
  expectSuccess,
  expectError,
  parseInputSchema,
} from "./_helpers.js";
import { registerLiveviewTools } from "../../src/tools/liveviews.js";

describe("liveview tools", () => {
  const { server, handlers, configs } = createMockServer();
  const client = createMockClient();
  registerLiveviewTools(server, client, false);

  describe("protect_list_liveviews", () => {
    it("returns liveview list", async () => {
      mockFn(client, "get").mockResolvedValue([{ id: "lv1", name: "All Cams" }]);
      const result = await handlers.get("protect_list_liveviews")!({});
      expectSuccess(result, "All Cams");
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/liveviews");
    });

    it("returns error on failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("fail"));
      const result = await handlers.get("protect_list_liveviews")!({});
      expectError(result);
    });

    it("has read-only annotations", () => {
      expect(configs.get("protect_list_liveviews")!.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
      });
    });
  });

  describe("protect_get_liveview", () => {
    it("fetches liveview by ID", async () => {
      mockFn(client, "get").mockResolvedValue({ id: "lv1", name: "All Cams" });
      const result = await handlers.get("protect_get_liveview")!({ id: "lv1" });
      expectSuccess(result, "lv1");
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/liveviews/lv1");
    });

    it("returns error on failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("not found"));
      const result = await handlers.get("protect_get_liveview")!({ id: "x" });
      expectError(result);
    });
  });

  // Full liveview body — every field is required by the 7.3.70 docs.
  const fullBody = {
    id: "lv1",
    modelKey: "liveview" as const,
    name: "All Cams",
    isDefault: false,
    isGlobal: true,
    owner: "user1",
    layout: 4,
    slots: [
      { cameras: ["6805169300863503e4032252"], cycleMode: "time", cycleInterval: 10 },
    ],
  };

  describe("protect_create_liveview", () => {
    it("creates a new liveview, sending the body unchanged", async () => {
      mockFn(client, "post").mockResolvedValue({ ...fullBody, id: "lv2" });
      const result = await handlers.get("protect_create_liveview")!({
        settings: fullBody,
      });
      expectSuccess(result, "All Cams");
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/liveviews", fullBody);
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("bad request"));
      const result = await handlers.get("protect_create_liveview")!({
        settings: fullBody,
      });
      expectError(result);
    });

    it("supports dry-run", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_create_liveview")!({
        settings: fullBody,
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("POST");
      expect(data.path).toBe("/liveviews");
      expect(data.body).toEqual(fullBody);
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });
  });

  describe("protect_update_liveview", () => {
    it("updates liveview settings, sending the body unchanged", async () => {
      const renamed = { ...fullBody, name: "Renamed" };
      mockFn(client, "patch").mockResolvedValue(renamed);
      const result = await handlers.get("protect_update_liveview")!({
        id: "lv1",
        settings: renamed,
      });
      expectSuccess(result, "Renamed");
      expect(mockFn(client, "patch")).toHaveBeenCalledWith("/liveviews/lv1", renamed);
    });

    it("returns error on failure", async () => {
      mockFn(client, "patch").mockRejectedValue(new Error("forbidden"));
      const result = await handlers.get("protect_update_liveview")!({
        id: "lv1",
        settings: fullBody,
      });
      expectError(result);
    });

    it("returns dry-run preview without calling client", async () => {
      mockFn(client, "patch").mockClear();
      const result = await handlers.get("protect_update_liveview")!({
        id: "lv1",
        settings: fullBody,
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("PATCH");
      expect(data.path).toBe("/liveviews/lv1");
      expect(mockFn(client, "patch")).not.toHaveBeenCalled();
    });

    it("rejects a body whose id does not match the path id", async () => {
      mockFn(client, "patch").mockClear();
      const result = await handlers.get("protect_update_liveview")!({
        id: "lv2",
        settings: fullBody,
      });
      expectError(result);
      expect(result.content[0].text).toContain("lv2");
      expect(mockFn(client, "patch")).not.toHaveBeenCalled();
    });
  });

  for (const tool of ["protect_create_liveview", "protect_update_liveview"]) {
    describe(`${tool} input validation`, () => {
      const schema = parseInputSchema(configs, tool);
      const withSettings = (settings: unknown) =>
        tool === "protect_update_liveview" ? { id: "lv1", settings } : { settings };

      it("accepts a full body and leaves it unchanged", () => {
        const parsed = schema.safeParse(withSettings(fullBody));
        expect(parsed.success).toBe(true);
        expect(parsed.data!.settings).toEqual(fullBody);
      });

      it.each(Object.keys(fullBody))("rejects a body missing %s", (key) => {
        const partial = Object.fromEntries(
          Object.entries(fullBody).filter(([k]) => k !== key)
        );
        expect(schema.safeParse(withSettings(partial)).success).toBe(false);
      });

      it("rejects a body with only a name", () => {
        expect(schema.safeParse(withSettings({ name: "New View" })).success).toBe(false);
      });

      it('rejects modelKey other than "liveview"', () => {
        expect(
          schema.safeParse(withSettings({ ...fullBody, modelKey: "camera" })).success
        ).toBe(false);
      });

      it("rejects layout outside 1-26", () => {
        expect(schema.safeParse(withSettings({ ...fullBody, layout: 0 })).success).toBe(false);
        expect(schema.safeParse(withSettings({ ...fullBody, layout: 27 })).success).toBe(false);
        expect(schema.safeParse(withSettings({ ...fullBody, layout: 1 })).success).toBe(true);
        expect(schema.safeParse(withSettings({ ...fullBody, layout: 26 })).success).toBe(true);
      });

      it("rejects a slot missing cameras", () => {
        const slots = [{ cycleMode: "time", cycleInterval: 10 }];
        expect(schema.safeParse(withSettings({ ...fullBody, slots })).success).toBe(false);
      });

      it("passes unknown keys through on the body and slots", () => {
        const body = {
          ...fullBody,
          futureField: "x",
          slots: [{ ...fullBody.slots[0], extraSlotKey: 1 }],
        };
        const parsed = schema.safeParse(withSettings(body));
        expect(parsed.success).toBe(true);
        expect(parsed.data!.settings).toEqual(body);
      });
    });
  }
});

describe("liveview tools - read-only mode", () => {
  const { server, handlers } = createMockServer();
  const client = createMockClient();
  registerLiveviewTools(server, client, true);

  it("registers read-only tools", () => {
    expect(handlers.has("protect_list_liveviews")).toBe(true);
    expect(handlers.has("protect_get_liveview")).toBe(true);
  });

  it("does not register write tools", () => {
    expect(handlers.has("protect_create_liveview")).toBe(false);
    expect(handlers.has("protect_update_liveview")).toBe(false);
  });
});
