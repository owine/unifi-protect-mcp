import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient, mockFn, expectSuccess, expectError } from "./_helpers.js";
import { registerSystemTools } from "../../src/tools/system.js";

describe("system tools", () => {
  const { server, handlers, configs } = createMockServer();
  const client = createMockClient();
  registerSystemTools(server, client);

  describe("protect_get_info", () => {
    it("returns system info on success", async () => {
      const info = { version: "5.0.0", uptime: 12345 };
      mockFn(client, "get").mockResolvedValue(info);
      const result = await handlers.get("protect_get_info")!({});
      expectSuccess(result, "5.0.0");
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/meta/info");
    });

    it("returns error on failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("connection refused"));
      const result = await handlers.get("protect_get_info")!({});
      expectError(result);
      expect(result.content[0].text).toContain("connection refused");
    });

    it("has read-only annotations", () => {
      expect(configs.get("protect_get_info")!.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
      });
    });
  });

  describe("protect_list_nvrs", () => {
    it("returns NVR list on success", async () => {
      const nvrs = [{ id: "nvr1", name: "Main NVR" }];
      mockFn(client, "get").mockResolvedValue(nvrs);
      const result = await handlers.get("protect_list_nvrs")!({});
      expectSuccess(result, "nvr1");
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/nvrs");
    });

    it("returns error on failure", async () => {
      mockFn(client, "get").mockRejectedValue(new Error("timeout"));
      const result = await handlers.get("protect_list_nvrs")!({});
      expectError(result);
      expect(result.content[0].text).toContain("timeout");
    });

    it("has read-only annotations", () => {
      expect(configs.get("protect_list_nvrs")!.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
      });
    });
  });
});
