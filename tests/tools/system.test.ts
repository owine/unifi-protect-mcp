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
    // Real 7.3.70 response shape: /nvrs returns a SINGLE object, not an array.
    const nvr = {
      id: "67f5751003927603e40003ec",
      modelKey: "nvr",
      name: "Melrose NVR Pro",
      type: "UNVR-PRO",
      guid: "10b3fc63-28eb-4f7e-b8de-7579cd609cf5",
      mac: "0CEA1447C0A4",
      doorbellSettings: {
        defaultMessageText: "WELCOME",
        defaultMessageResetTimeoutMs: 60000,
        customMessages: ["Please Leave Delivery at Door"],
        customImages: [],
      },
      armMode: {
        status: "disabled",
        armedAt: null,
        willBeArmedAt: null,
        breachDetectedAt: null,
        breachEventCount: 0,
        breachTriggerEventId: null,
        breachEventId: null,
      },
    };

    it("returns the single NVR object on success", async () => {
      mockFn(client, "get").mockResolvedValue(nvr);
      const result = await handlers.get("protect_list_nvrs")!({});
      expectSuccess(result, "Melrose NVR Pro");
      expect(mockFn(client, "get")).toHaveBeenCalledWith("/nvrs");
      // Object responses are passed through as-is, not wrapped under `result`
      expect(result.structuredContent).toEqual(nvr);
      expect(result.structuredContent).not.toHaveProperty("result");
    });

    it("documents armMode.armProfileId in the description", () => {
      expect(configs.get("protect_list_nvrs")!.description).toContain("armProfileId");
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
