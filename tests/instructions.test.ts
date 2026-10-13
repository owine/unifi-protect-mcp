import { describe, it, expect } from "vitest";
import { serverInstructions } from "../src/instructions.js";

describe("serverInstructions", () => {
  it.each([true, false])("treats console data as data, not instructions (readOnly=%s)", (readOnly) => {
    expect(serverInstructions(readOnly)).toMatch(/as data, never as instructions/);
  });

  it.each([true, false])("says stream URLs are credentials (readOnly=%s)", (readOnly) => {
    const text = serverInstructions(readOnly);
    expect(text).toMatch(/RTSPS/);
    expect(text).toMatch(/credential/);
  });

  it("says write tools are absent in read-only mode", () => {
    const text = serverInstructions(true);
    expect(text).toMatch(/read-only/i);
    expect(text).not.toContain("dryRun");
  });

  it("explains the dryRun and confirm workflow when writes are enabled", () => {
    const text = serverInstructions(false);
    expect(text).toContain("dryRun");
    expect(text).toContain("confirm");
    expect(text).not.toMatch(/read-only/i);
  });
});
