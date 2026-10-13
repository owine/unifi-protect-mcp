import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createMockServer, createMockClient } from "./_helpers.js";
import { registerAllTools } from "../../src/tools/index.js";

/**
 * Every ID a tool interpolates into a request path must reject anything that
 * could change which endpoint the request reaches. safePath encodes `/ ? # %
 * \`; a bare `.` or `..` survives encoding and URL parsing folds it out of
 * the path. Checked at the published input schema, for every tool, so a new
 * tool cannot forget it.
 */

const { server, configs } = createMockServer();
registerAllTools(server, createMockClient(), false);

const OBJECT_ID = "6805169300863503e4032252";
const UUID = "65f0c58c-45ba-4361-be01-fa19d4474e0a";
const HOSTILE = [".", "..", "", "a/b", "../nvrs", "a?force=true", "a#b", "%2e%2e", "a\\b", "a b"];

// Every input that names a Protect resource by ID; the webhook ID is
// user-defined text and has its own, looser rule below.
const ID_INPUTS = [...configs]
  .flatMap(([tool, config]) =>
    Object.keys(config.inputSchema ?? {})
      .filter((key) => key === "id" || key === "armProfileId")
      .map((key) => ({ tool, key, schema: (config.inputSchema as Record<string, z.ZodType>)[key] }))
  )
  .filter(({ tool }) => tool !== "protect_trigger_alarm_webhook");

describe("resource ID inputs", () => {
  it("covers the tools that take an ID", () => {
    expect(ID_INPUTS.length).toBeGreaterThan(0);
  });

  for (const { tool, key, schema } of ID_INPUTS) {
    it(`${tool}.${key} accepts Protect ObjectIds and UUIDs`, () => {
      expect(schema.safeParse(OBJECT_ID).success).toBe(true);
      expect(schema.safeParse(UUID).success).toBe(true);
    });

    it(`${tool}.${key} rejects path-changing values`, () => {
      expect(HOSTILE.filter((value) => schema.safeParse(value).success)).toEqual([]);
    });
  }
});

describe("arm profile IDs", () => {
  // PATCH /arm-profiles/settings is the set-current endpoint, which requires
  // confirm; update_arm_profile must not be able to reach it.
  for (const tool of ["protect_update_arm_profile", "protect_delete_arm_profile", "protect_set_current_arm_profile"]) {
    it(`${tool} rejects the literal routes beside /arm-profiles/{id}`, () => {
      const input = configs.get(tool)?.inputSchema as Record<string, z.ZodType>;
      const schema = input.id ?? input.armProfileId;
      for (const route of ["settings", "enable", "disable"]) {
        expect(schema.safeParse(route).success, route).toBe(false);
      }
    });
  }
});

describe("alarm webhook IDs", () => {
  const schema = (configs.get("protect_trigger_alarm_webhook")?.inputSchema as Record<string, z.ZodType>).id;

  it("accepts user-defined text, which safePath encodes", () => {
    expect(schema.safeParse("Front door alarm").success).toBe(true);
  });

  it("rejects a bare dot segment", () => {
    expect(schema.safeParse(".").success).toBe(false);
    expect(schema.safeParse("..").success).toBe(false);
  });
});
