import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient, mockFn, expectSuccess, expectError } from "./_helpers.js";
import { registerDeviceTools } from "../../src/tools/devices.js";

interface Device {
  urlPath: string;  // URL path segment
  singular: string; // tool-name singular (snake_case)
  plural: string;   // tool-name plural
  label: string;
}

const DEVICES: Device[] = [
  { urlPath: "lights", singular: "light", plural: "lights", label: "Light" },
  { urlPath: "sensors", singular: "sensor", plural: "sensors", label: "Sensor" },
  { urlPath: "chimes", singular: "chime", plural: "chimes", label: "Chime" },
  { urlPath: "viewers", singular: "viewer", plural: "viewers", label: "Viewer" },
  { urlPath: "sirens", singular: "siren", plural: "sirens", label: "Siren" },
  { urlPath: "fobs", singular: "fob", plural: "fobs", label: "Fob" },
  { urlPath: "relays", singular: "relay", plural: "relays", label: "Relay" },
  { urlPath: "speakers", singular: "speaker", plural: "speakers", label: "Speaker" },
  { urlPath: "bridges", singular: "bridge", plural: "bridges", label: "Bridge" },
  { urlPath: "link-stations", singular: "link_station", plural: "link_stations", label: "Link station" },
  { urlPath: "alarm-hubs", singular: "alarm_hub", plural: "alarm_hubs", label: "Alarm hub" },
];

describe("device tools", () => {
  for (const dev of DEVICES) {
    describe(`${dev.label} CRUD`, () => {
      const { server, handlers, configs } = createMockServer();
      const client = createMockClient();
      registerDeviceTools(server, client, false);

      describe(`protect_list_${dev.plural}`, () => {
        it(`lists all ${dev.plural}`, async () => {
          const items = [{ id: `${dev.singular}1` }];
          mockFn(client, "get").mockResolvedValue(items);
          const result = await handlers.get(`protect_list_${dev.plural}`)!({});
          expectSuccess(result, `${dev.singular}1`);
          expect(mockFn(client, "get")).toHaveBeenCalledWith(`/${dev.urlPath}`);
        });

        it("returns error on failure", async () => {
          mockFn(client, "get").mockRejectedValue(new Error("fail"));
          const result = await handlers.get(`protect_list_${dev.plural}`)!({});
          expectError(result);
        });

        it("has read-only annotations", () => {
          expect(configs.get(`protect_list_${dev.plural}`)!.annotations).toEqual({
            readOnlyHint: true,
            destructiveHint: false,
          });
        });
      });

      describe(`protect_get_${dev.singular}`, () => {
        it(`gets ${dev.singular} by ID`, async () => {
          mockFn(client, "get").mockResolvedValue({
            id: `${dev.singular}1`,
            name: `My ${dev.label}`,
          });
          const result = await handlers.get(`protect_get_${dev.singular}`)!({
            id: `${dev.singular}1`,
          });
          expectSuccess(result, `My ${dev.label}`);
          expect(mockFn(client, "get")).toHaveBeenCalledWith(
            `/${dev.urlPath}/${dev.singular}1`
          );
        });

        it("returns error on failure", async () => {
          mockFn(client, "get").mockRejectedValue(new Error("not found"));
          const result = await handlers.get(`protect_get_${dev.singular}`)!({ id: "x" });
          expectError(result);
        });
      });

      describe(`protect_update_${dev.singular}`, () => {
        it(`updates ${dev.singular} settings`, async () => {
          mockFn(client, "patch").mockResolvedValue({
            id: `${dev.singular}1`,
            name: "Renamed",
          });
          const result = await handlers.get(`protect_update_${dev.singular}`)!({
            id: `${dev.singular}1`,
            settings: { name: "Renamed" },
          });
          expectSuccess(result, "Renamed");
          expect(mockFn(client, "patch")).toHaveBeenCalledWith(
            `/${dev.urlPath}/${dev.singular}1`,
            { name: "Renamed" }
          );
        });

        it("returns error on failure", async () => {
          mockFn(client, "patch").mockRejectedValue(new Error("forbidden"));
          const result = await handlers.get(`protect_update_${dev.singular}`)!({
            id: `${dev.singular}1`,
            settings: {},
          });
          expectError(result);
        });

        it("returns dry-run preview without calling client", async () => {
          mockFn(client, "patch").mockClear();
          const result = await handlers.get(`protect_update_${dev.singular}`)!({
            id: `${dev.singular}1`,
            settings: { name: "Test" },
            dryRun: true,
          });
          const data = JSON.parse(result.content[0].text);
          expect(data.dryRun).toBe(true);
          expect(data.action).toBe("PATCH");
          expect(data.path).toBe(`/${dev.urlPath}/${dev.singular}1`);
          expect(mockFn(client, "patch")).not.toHaveBeenCalled();
        });

        it("has write annotations", () => {
          expect(configs.get(`protect_update_${dev.singular}`)!.annotations).toEqual({
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

  for (const dev of DEVICES) {
    it(`registers read-only ${dev.singular} tools`, () => {
      expect(handlers.has(`protect_list_${dev.plural}`)).toBe(true);
      expect(handlers.has(`protect_get_${dev.singular}`)).toBe(true);
    });

    it(`does not register write ${dev.singular} tools`, () => {
      expect(handlers.has(`protect_update_${dev.singular}`)).toBe(false);
    });
  }
});
