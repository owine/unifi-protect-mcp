import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createMockServer, createMockClient } from "./tools/_helpers.js";
import { registerAllTools } from "../src/tools/index.js";
import { _DEVICE_CONFIGS } from "../src/tools/devices.js";
import { ARM_PROFILE_CONFIRM_FIELDS } from "../src/tools/arm-profiles.js";
import { serverInstructions } from "../src/instructions.js";

/**
 * Documentation drift: every fact the docs state about the tools, the
 * environment and the source tree is derived here from the code. The docs
 * state no counts, limits or pinned versions, because a number in prose goes
 * stale the day a tool or limit changes; the last block fails if one creeps
 * back in. If a rewrite stops a pattern below from matching, the test fails
 * loudly: update the pattern, do not delete the check.
 */

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");
const README = read("README.md");
const CLAUDE = read("CLAUDE.md");
const SECURITY = existsSync(join(root, "SECURITY.md")) ? read("SECURITY.md") : "";
const ENV_EXAMPLE = read(".env.example");

interface Tool {
  name: string;
  description: string;
  annotations: Record<string, unknown>;
  inputs: string[];
}

function registeredTools(readOnly: boolean): Tool[] {
  const { server, configs } = createMockServer();
  registerAllTools(server, createMockClient(), readOnly);
  return [...configs].map(([name, config]) => ({
    name,
    description: config.description ?? "",
    annotations: config.annotations ?? {},
    inputs: Object.keys(config.inputSchema ?? {}),
  }));
}

const tools = registeredTools(false);
const names = (pick: (tool: Tool) => boolean) => tools.filter(pick).map((tool) => tool.name).sort();

/** The README "## Tools" section, up to the next h2. */
function toolsSection(): string {
  const match = /^## Tools$([\s\S]*?)^## /m.exec(README);
  if (!match) throw new Error("README.md has no '## Tools' section");
  return match[1];
}

const rows = () =>
  [...toolsSection().matchAll(/^\| `(protect_[a-z_]+)` \| (.*)$/gm)].map((m) => ({ name: m[1], text: m[2] }));

describe("documentation drift", () => {
  describe("README tool tables", () => {
    it("document every registered tool exactly once, and no others", () => {
      const documented = rows().map((row) => row.name);
      expect(documented).toEqual([...new Set(documented)]);
      expect([...documented].sort()).toEqual(names(() => true));
    });

    it("mark exactly the destructiveHint tools DESTRUCTIVE", () => {
      const marked = rows().filter((row) => row.text.startsWith("**DESTRUCTIVE:**")).map((row) => row.name).sort();
      expect(marked).toEqual(names((tool) => tool.annotations.destructiveHint === true));
    });

    it("mark exactly the tools that take confirm", () => {
      const marked = rows().filter((row) => row.text.includes("`confirm: true`")).map((row) => row.name).sort();
      expect(marked).toEqual(names((tool) => tool.inputs.includes("confirm")));
    });

    it("mark exactly the list tools that page", () => {
      const marked = rows().filter((row) => row.text.includes("`limit`/`offset`")).map((row) => row.name).sort();
      expect(marked).toEqual(names((tool) => tool.inputs.includes("limit")));
    });
  });

  describe("tool descriptions", () => {
    it("say 'confirm: true' wherever the tool takes confirm", () => {
      expect(names((tool) => tool.inputs.includes("confirm") && !tool.description.includes("confirm: true"))).toEqual([]);
    });

    it("name every field-level confirm field", () => {
      const gated: [string, readonly string[]][] = [
        ..._DEVICE_CONFIGS.flatMap((device) =>
          device.confirmFields ? [[`protect_update_${device.singular}`, device.confirmFields] as [string, readonly string[]]] : []
        ),
        ["protect_update_arm_profile", ARM_PROFILE_CONFIRM_FIELDS],
      ];
      expect(gated.length).toBeGreaterThan(1);
      for (const [name, fields] of gated) {
        const description = tools.find((tool) => tool.name === name)?.description ?? "";
        expect(fields.filter((field) => !description.includes(field)), name).toEqual([]);
      }
    });
  });

  describe("count-free claims", () => {
    it("back 'every write tool accepts dryRun'", () => {
      expect(names((tool) => tool.annotations.readOnlyHint !== true && !tool.inputs.includes("dryRun"))).toEqual([]);
    });

    it("back 'every tool that takes confirm is DESTRUCTIVE'", () => {
      expect(names((tool) => tool.inputs.includes("confirm") && tool.annotations.destructiveHint !== true)).toEqual([]);
    });

    it("back 'read-only mode registers only the read tools'", () => {
      expect(registeredTools(true).map((tool) => tool.name).sort()).toEqual(names((tool) => tool.annotations.readOnlyHint === true));
    });
  });

  describe("environment and source tree", () => {
    it("document every env var config.ts reads, in the README table and .env.example, and no others", () => {
      const used = [...new Set([...read("src/config.ts").matchAll(/process\.env\.(UNIFI_PROTECT_[A-Z_]+)/g)].map((m) => m[1]))].sort();
      const inTable = [...new Set([...README.matchAll(/^\| `(UNIFI_PROTECT_[A-Z_]+)` \|/gm)].map((m) => m[1]))].sort();
      expect(inTable).toEqual(used);
      expect(used.filter((name) => !ENV_EXAMPLE.includes(name))).toEqual([]);
    });

    it("name every source file and script in CLAUDE.md's architecture map", () => {
      const files = [
        ...(readdirSync(join(root, "src"), { recursive: true }) as string[]).filter((file) => file.endsWith(".ts")),
        ...readdirSync(join(root, "scripts")),
      ].map((file) => basename(file));
      expect(files.filter((file) => !CLAUDE.includes(file))).toEqual([]);
    });

    it("link SECURITY.md from the README", () => {
      expect(SECURITY).not.toBe("");
      expect(README).toMatch(/SECURITY\.md/);
    });
  });

  describe("no stale-prone numbers", () => {
    const count = /\b\d+ (?:read |write |MCP )?tools\b|\(\d+ tools?\)|across \d+ domains|^#{2,3} .+\(\d+(?: total)?\)$/m;
    const limit = /\b\d[\d,.]*\s?(?:KiB|MiB|GiB|KB|MB|GB|bytes|characters|messages|tokens)\b/i;

    it.each([["README.md", README], ["CLAUDE.md", CLAUDE], ["SECURITY.md", SECURITY]])("keep counts and limits out of %s", (_file, text) => {
      expect(text).not.toMatch(count);
      expect(text).not.toMatch(limit);
    });

    it("keep the pinned Node version out of CLAUDE.md", () => {
      expect(CLAUDE).not.toMatch(/`\.nvmrc` \(\d/);
    });

    it.each([true, false])("state no numbers in the server instructions (readOnly=%s)", (readOnly) => {
      expect(serverInstructions(readOnly)).not.toMatch(/\d/);
    });
  });
});
