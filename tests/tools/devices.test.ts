import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient, mockFn } from "./_helpers.js";
import { registerDeviceTools } from "../../src/tools/devices.js";

describe("device tools", () => {
  const deviceTypes = ["light", "sensor", "chime", "viewer"] as const;

  for (const deviceType of deviceTypes) {
    const plural = `${deviceType}s`;
    const label = deviceType.charAt(0).toUpperCase() + deviceType.slice(1);

    describe(`${deviceType} CRUD`, () => {
      const { server, handlers } = createMockServer();
      const client = createMockClient();
      registerDeviceTools(server, client);

      describe(`protect_list_${plural}`, () => {
        it(`lists all ${plural}`, async () => {
          const items = [{ id: `${deviceType}1` }];
          mockFn(client, "get").mockResolvedValue(items);
          const result = await handlers.get(`protect_list_${plural}`)!({});
          expect(result.content[0].text).toContain(`${deviceType}1`);
          expect(mockFn(client, "get")).toHaveBeenCalledWith(`/${plural}`);
        });

        it("returns error on failure", async () => {
          mockFn(client, "get").mockRejectedValue(new Error("fail"));
          const result = await handlers.get(`protect_list_${plural}`)!({});
          expect(result.isError).toBe(true);
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
          expect(result.content[0].text).toContain(`My ${label}`);
          expect(mockFn(client, "get")).toHaveBeenCalledWith(
            `/${plural}/${deviceType}1`
          );
        });

        it("returns error on failure", async () => {
          mockFn(client, "get").mockRejectedValue(new Error("not found"));
          const result = await handlers.get(`protect_get_${deviceType}`)!({
            id: "x",
          });
          expect(result.isError).toBe(true);
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
          expect(result.content[0].text).toContain("Renamed");
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
          expect(result.isError).toBe(true);
        });
      });
    });
  }
});
