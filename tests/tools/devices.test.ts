import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  createMockServer,
  createMockClient,
  mockFn,
  expectSuccess,
  expectError,
  parseInputSchema,
} from "./_helpers.js";
import { registerDeviceTools, _DEVICE_CONFIGS } from "../../src/tools/devices.js";

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
          expect(configs.get(`protect_list_${dev.plural}`)!.annotations).toMatchObject({
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
            settings: { name: "x" },
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

        it("rejects empty settings object", () => {
          const schema = parseInputSchema(configs, `protect_update_${dev.singular}`);
          const res = schema.safeParse({ id: `${dev.singular}1`, settings: {} });
          expect(res.success).toBe(false);
          expect(JSON.stringify(res.error?.issues)).toContain(
            "settings must include at least one field"
          );
        });

        it("accepts non-empty settings object", () => {
          const schema = parseInputSchema(configs, `protect_update_${dev.singular}`);
          expect(
            schema.safeParse({ id: `${dev.singular}1`, settings: { name: "x" } }).success
          ).toBe(true);
        });

        it("has destructive annotations", () => {
          expect(configs.get(`protect_update_${dev.singular}`)!.annotations).toMatchObject({
            readOnlyHint: false,
            destructiveHint: true,
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

describe("device tools - descriptions (7.3.70)", () => {
  const { server, configs } = createMockServer();
  const client = createMockClient();
  registerDeviceTools(server, client, false);

  const desc = (name: string) => configs.get(name)!.description!;
  const settingsDesc = (singular: string) => {
    const shape = configs.get(`protect_update_${singular}`)!.inputSchema as Record<string, z.ZodType>;
    return shape.settings.description!;
  };

  it("test DEVICES table matches _DEVICE_CONFIGS", () => {
    expect(_DEVICE_CONFIGS.map((c) => c.singular)).toEqual(DEVICES.map((d) => d.singular));
  });

  for (const cfg of _DEVICE_CONFIGS) {
    it(`${cfg.singular} returns text references 7.3.70, not 7.3.47`, () => {
      expect(cfg.returns).toContain("7.3.70");
      expect(cfg.returns).not.toContain("7.3.47");
      expect(desc(`protect_list_${cfg.plural}`)).toContain("7.3.70");
      expect(desc(`protect_get_${cfg.singular}`)).toContain("7.3.70");
    });
  }

  it("only link_station has a note", () => {
    const withNote = _DEVICE_CONFIGS.filter((c) => c.note !== undefined).map((c) => c.singular);
    expect(withNote).toEqual(["link_station"]);
  });

  it("link_station list/get descriptions include the non-alarm-hub gateway note", () => {
    expect(desc("protect_list_link_stations")).toContain("non-alarm-hub gateways");
    expect(desc("protect_get_link_station")).toContain("non-alarm-hub gateways");
    expect(desc("protect_list_link_stations")).toContain("protect_list_alarm_hubs");
  });

  it("other device descriptions do not include the gateway note", () => {
    for (const cfg of _DEVICE_CONFIGS.filter((c) => c.singular !== "link_station")) {
      expect(desc(`protect_list_${cfg.plural}`)).not.toContain("non-alarm-hub gateways");
      expect(desc(`protect_get_${cfg.singular}`)).not.toContain("non-alarm-hub gateways");
    }
  });

  it("descriptions without a note have no double space", () => {
    expect(desc("protect_list_lights")).toContain("UniFi Protect. Returns array;");
    expect(desc("protect_get_light")).toContain("by ID. Returns:");
  });

  it("sensor update hint marks leakSettings read-only and armProfileIds nullable", () => {
    const hint = settingsDesc("sensor");
    expect(hint).toContain("leakSettings is read-only");
    expect(hint).not.toMatch(/leakSettings \(object\)/);
    expect(hint).toContain("armProfileIds (array of up to 32 strings, or null)");
    expect(hint).toContain("409");
  });

  it("fob get description lists hasKeypad inside featureFlags and drops backlight fields", () => {
    const d = desc("protect_get_fob");
    expect(d).toContain("featureFlags (buttons[], hasKeypad)");
    expect(d).not.toContain("backlightEnabled");
    expect(d).not.toContain("backlightBrightness");
    expect(d).toContain("keypadSettings (beepEnabled, beepVolume)");
  });

  for (const singular of ["link_station", "alarm_hub"]) {
    it(`${singular} description nests deviceTamperStatus inside alarmHub`, () => {
      const d = desc(`protect_get_${singular}`);
      expect(d).toMatch(/alarmHub \([^]*deviceTamperStatus/);
      expect(d).not.toMatch(/lastEvent, alarmHub \(object\), deviceTamperStatus/);
      // deviceTamperStatus appears exactly once (inside alarmHub)
      expect(d.match(/deviceTamperStatus/g)).toHaveLength(1);
      const alarmHubStart = d.indexOf("alarmHub (");
      const threadStateStart = d.indexOf("threadState (");
      const tamperIdx = d.indexOf("deviceTamperStatus");
      expect(tamperIdx).toBeGreaterThan(alarmHubStart);
      expect(tamperIdx).toBeLessThan(threadStateStart);
    });
  }

  it("relay description lists outputs item keys including pulseDuration", () => {
    const d = desc("protect_get_relay");
    expect(d).toContain(
      "outputs (array of objects: id, name, type, delay, pulseDuration, state, rebootState"
    );
    expect(d).toContain("protect_activate_relay_output");
    expect(d).toContain("inputs (array of objects: id, name, state, actionTrigger, actionType, actionOutputId)");
  });
});
