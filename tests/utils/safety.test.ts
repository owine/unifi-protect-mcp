import { describe, it, expect } from "vitest";
import {
  READ_ONLY,
  WRITE,
  DESTRUCTIVE,
  formatDryRun,
  requireConfirmation,
} from "../../src/utils/safety.js";

describe("annotation constants", () => {
  it("READ_ONLY is read-only and non-destructive", () => {
    expect(READ_ONLY).toEqual({ readOnlyHint: true, destructiveHint: false });
  });

  it("WRITE is non-read-only and non-destructive", () => {
    expect(WRITE).toEqual({ readOnlyHint: false, destructiveHint: false });
  });

  it("DESTRUCTIVE is non-read-only and destructive", () => {
    expect(DESTRUCTIVE).toEqual({ readOnlyHint: false, destructiveHint: true });
  });
});

describe("formatDryRun", () => {
  it("returns standard preview without body", () => {
    const result = formatDryRun("GET", "/cameras");
    const data = JSON.parse(result.content[0].text);
    expect(data).toEqual({ dryRun: true, action: "GET", path: "/cameras" });
  });

  it("includes body when provided", () => {
    const result = formatDryRun("PATCH", "/cameras/1", { name: "new" });
    const data = JSON.parse(result.content[0].text);
    expect(data).toEqual({
      dryRun: true,
      action: "PATCH",
      path: "/cameras/1",
      body: { name: "new" },
    });
  });

  it("is not marked as error", () => {
    const result = formatDryRun("POST", "/test");
    expect(result).not.toHaveProperty("isError");
  });
});

describe("requireConfirmation", () => {
  it("returns null when confirm is true", () => {
    expect(requireConfirmation(true, "delete thing")).toBeNull();
  });

  it("returns error result when confirm is false", () => {
    const result = requireConfirmation(false, "delete thing");
    expect(result).not.toBeNull();
    expect(result!.isError).toBe(true);
    expect(result!.content[0].text).toContain("confirm");
    expect(result!.content[0].text).toContain("delete thing");
  });
});
