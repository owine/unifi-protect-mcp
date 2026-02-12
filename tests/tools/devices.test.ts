import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient, mockFn, expectSuccess, expectError } from "./_helpers.js";
import { registerDeviceTools } from "../../src/tools/devices.js";

describe("device tools", () => {
  const deviceTypes = ["light", "sensor", "chime", "viewer"] as const;

  for (const deviceType of deviceTypes) {
    const plural = `${deviceType}s`;
    const label = deviceType.charAt(0).toUpperCase() + deviceType.slice(1);

    describe(`${deviceType} CRUD`, () => {
      const { server, handlers, configs } = createMockServer();
      const client = createMockClient();
      registerDeviceTools(server, client, false);

      describe(`protect_list_${plural}`, () => {
        it(`lists all ${plural}`, async () => {
          const items = [{ id: `${deviceType}1` }];
          mockFn(client, "get").mockResolvedValue(items);
          const result = await handlers.get(`protect_list_${plural}`)!({});
          expectSuccess(result, `${deviceType}1`);
          expect(mockFn(client, "get")).toHaveBeenCalledWith(`/${plural}`);
        });

        it("returns error on failure", async () => {
          mockFn(client, "get").mockRejectedValue(new Error("fail"));
          const result = await handlers.get(`protect_list_${plural}`)!({});
          expectError(result);
        });

        it("has read-only annotations", () => {
          expect(configs.get(`protect_list_${plural}`)!.annotations).toEqual({
            readOnlyHint: true,
            destructiveHint: false,
          });
        });
      });

      describe(`protect_get_${deviceType}`, () => {
        it(`gets ${deviceType} by ID`, async () => {
          mockFn(client, "get").mockResolvedValue({
            id: `${deviceType}1`,
            name: `My ${label}`,
          });
          const result = await handlers.get(`protect_get_${deviceType}`)!({
            id: `${deviceType}1`,
          });
          expectSuccess(result, `My ${label}`);
          expect(mockFn(client, "get")).toHaveBeenCalledWith(
            `/${plural}/${deviceType}1`
          );
        });

        it("returns error on failure", async () => {
          mockFn(client, "get").mockRejectedValue(new Error("not found"));
          const result = await handlers.get(`protect_get_${deviceType}`)!({
            id: "x",
          });
          expectError(result);
        });
      });

      describe(`protect_update_${deviceType}`, () => {
        it(`updates ${deviceType} settings`, async () => {
          mockFn(client, "patch").mockResolvedValue({
            id: `${deviceType}1`,
            name: "Renamed",
          });
          const result = await handlers.get(`protect_update_${deviceType}`)!({
            id: `${deviceType}1`,
            settings: { name: "Renamed" },
          });
          expectSuccess(result, "Renamed");
          expect(mockFn(client, "patch")).toHaveBeenCalledWith(
            `/${plural}/${deviceType}1`,
            { name: "Renamed" }
          );
        });

        it("returns error on failure", async () => {
          mockFn(client, "patch").mockRejectedValue(new Error("forbidden"));
          const result = await handlers.get(`protect_update_${deviceType}`)!({
            id: `${deviceType}1`,
            settings: {},
          });
          expectError(result);
        });

        it("returns dry-run preview without calling client", async () => {
          mockFn(client, "patch").mockClear();
          const result = await handlers.get(`protect_update_${deviceType}`)!({
            id: `${deviceType}1`,
            settings: { name: "Test" },
            dryRun: true,
          });
          const data = JSON.parse(result.content[0].text);
          expect(data.dryRun).toBe(true);
          expect(data.action).toBe("PATCH");
          expect(data.path).toBe(`/${plural}/${deviceType}1`);
          expect(mockFn(client, "patch")).not.toHaveBeenCalled();
        });

        it("has write annotations", () => {
          expect(configs.get(`protect_update_${deviceType}`)!.annotations).toEqual({
            readOnlyHint: false,
            destructiveHint: false,
          });
        });
      });
    });
  }
});

describe("device tools - read-only mode", () => {
  const { server, handlers } = createMockServer();
  const client = createMockClient();
  registerDeviceTools(server, client, true);

  const deviceTypes = ["light", "sensor", "chime", "viewer"] as const;

  for (const deviceType of deviceTypes) {
    const plural = `${deviceType}s`;

    it(`registers read-only ${deviceType} tools`, () => {
      expect(handlers.has(`protect_list_${plural}`)).toBe(true);
      expect(handlers.has(`protect_get_${deviceType}`)).toBe(true);
    });

    it(`does not register write ${deviceType} tools`, () => {
      expect(handlers.has(`protect_update_${deviceType}`)).toBe(false);
    });
  }
});
