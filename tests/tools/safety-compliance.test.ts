import { describe, it, expect } from "vitest";
import { createMockServer, createMockClient } from "./_helpers.js";
import { registerAllTools } from "../../src/tools/index.js";

/**
 * Meta-test: programmatically verifies safety contracts across all tools.
 * Every tool must declare correct annotations and schema properties
 * matching its safety classification.
 */

interface ToolConfig {
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
}

function registerAll(readOnly: boolean) {
  const { server, configs } = createMockServer();
  const client = createMockClient();
  registerAllTools(server, client, readOnly);
  return { configs: configs as Map<string, ToolConfig> };
}

function hasSchemaField(config: ToolConfig, field: string): boolean {
  if (!config.inputSchema) return false;
  return field in config.inputSchema;
}

describe("safety compliance", () => {
  const { configs } = registerAll(false);

  describe("read-only tools", () => {
    const readOnlyTools = [...configs.entries()].filter(
      ([, c]) => c.annotations?.readOnlyHint === true
    );

    it("exist", () => {
      expect(readOnlyTools.length).toBeGreaterThan(0);
    });

    it.each(readOnlyTools)(
      "%s has readOnlyHint: true and destructiveHint: false",
      (name, config) => {
        expect(config.annotations, `${name} annotations`).toEqual(
          expect.objectContaining({ readOnlyHint: true, destructiveHint: false })
        );
      }
    );

    it.each(readOnlyTools)(
      "%s does NOT have dryRun in input schema",
      (name, config) => {
        expect(
          hasSchemaField(config, "dryRun"),
          `${name} should not have dryRun`
        ).toBe(false);
      }
    );

    it.each(readOnlyTools)(
      "%s does NOT have confirm in input schema",
      (name, config) => {
        expect(
          hasSchemaField(config, "confirm"),
          `${name} should not have confirm`
        ).toBe(false);
      }
    );
  });

  describe("write tools (non-destructive)", () => {
    const writeTools = [...configs.entries()].filter(
      ([, c]) =>
        c.annotations?.readOnlyHint === false &&
        c.annotations?.destructiveHint === false
    );

    it("exist", () => {
      expect(writeTools.length).toBeGreaterThan(0);
    });

    it.each(writeTools)(
      "%s has dryRun in input schema",
      (name, config) => {
        expect(
          hasSchemaField(config, "dryRun"),
          `${name} should have dryRun`
        ).toBe(true);
      }
    );
  });

  describe("destructive tools", () => {
    const destructiveTools = [...configs.entries()].filter(
      ([, c]) => c.annotations?.destructiveHint === true
    );

    it("exist", () => {
      expect(destructiveTools.length).toBeGreaterThan(0);
    });

    it.each(destructiveTools)(
      "%s has confirm or dryRun in input schema",
      (name, config) => {
        const hasConfirm = hasSchemaField(config, "confirm");
        const hasDryRun = hasSchemaField(config, "dryRun");
        expect(
          hasConfirm || hasDryRun,
          `${name} must have confirm or dryRun`
        ).toBe(true);
      }
    );

    it.each(destructiveTools)(
      "%s has readOnlyHint: false",
      (_name, config) => {
        expect(config.annotations?.readOnlyHint).toBe(false);
      }
    );
  });

  describe("write tools (all, readOnlyHint: false)", () => {
    const allWriteTools = [...configs.entries()].filter(
      ([, c]) => c.annotations?.readOnlyHint === false
    );

    it.each(allWriteTools)(
      "%s has dryRun or confirm in input schema",
      (name, config) => {
        const hasDryRun = hasSchemaField(config, "dryRun");
        const hasConfirm = hasSchemaField(config, "confirm");
        expect(
          hasDryRun || hasConfirm,
          `${name} must have dryRun or confirm`
        ).toBe(true);
      }
    );
  });

  describe("tool counts", () => {
    it("registers 33 tools in read-write mode", () => {
      const { configs: rwConfigs } = registerAll(false);
      expect(rwConfigs.size).toBe(33);
    });

    it("registers 17 tools in read-only mode", () => {
      const { configs: roConfigs } = registerAll(true);
      expect(roConfigs.size).toBe(17);
    });
  });

  describe("read-only mode registers only read-only tools", () => {
    const { configs: roConfigs } = registerAll(true);

    it.each([...roConfigs.entries()])(
      "%s has readOnlyHint: true in read-only mode",
      (_name, config) => {
        expect(config.annotations?.readOnlyHint).toBe(true);
      }
    );
  });
});
