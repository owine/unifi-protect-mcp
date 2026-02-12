import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient, mockFn, expectSuccess, expectError } from "./_helpers.js";
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

  describe("protect_create_liveview", () => {
    it("creates a new liveview", async () => {
      mockFn(client, "post").mockResolvedValue({ id: "lv2", name: "New View" });
      const result = await handlers.get("protect_create_liveview")!({
        settings: { name: "New View" },
      });
      expectSuccess(result, "New View");
      expect(mockFn(client, "post")).toHaveBeenCalledWith("/liveviews", {
        name: "New View",
      });
    });

    it("returns error on failure", async () => {
      mockFn(client, "post").mockRejectedValue(new Error("bad request"));
      const result = await handlers.get("protect_create_liveview")!({
        settings: {},
      });
      expectError(result);
    });

    it("supports dry-run", async () => {
      mockFn(client, "post").mockClear();
      const result = await handlers.get("protect_create_liveview")!({
        settings: { name: "Test" },
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("POST");
      expect(data.path).toBe("/liveviews");
      expect(mockFn(client, "post")).not.toHaveBeenCalled();
    });
  });

  describe("protect_update_liveview", () => {
    it("updates liveview settings", async () => {
      mockFn(client, "patch").mockResolvedValue({ id: "lv1", name: "Renamed" });
      const result = await handlers.get("protect_update_liveview")!({
        id: "lv1",
        settings: { name: "Renamed" },
      });
      expectSuccess(result, "Renamed");
      expect(mockFn(client, "patch")).toHaveBeenCalledWith("/liveviews/lv1", {
        name: "Renamed",
      });
    });

    it("returns error on failure", async () => {
      mockFn(client, "patch").mockRejectedValue(new Error("forbidden"));
      const result = await handlers.get("protect_update_liveview")!({
        id: "lv1",
        settings: {},
      });
      expectError(result);
    });

    it("returns dry-run preview without calling client", async () => {
      mockFn(client, "patch").mockClear();
      const result = await handlers.get("protect_update_liveview")!({
        id: "lv1",
        settings: { name: "Test" },
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.dryRun).toBe(true);
      expect(data.action).toBe("PATCH");
      expect(data.path).toBe("/liveviews/lv1");
      expect(mockFn(client, "patch")).not.toHaveBeenCalled();
    });
  });
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
