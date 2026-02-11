import { describe, it, expect } from "vitest";
import { formatSuccess, formatError } from "../../src/utils/responses.js";

describe("formatSuccess", () => {
  it("wraps data as JSON text content", () => {
    const result = formatSuccess({ id: "abc", name: "cam1" });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ id: "abc", name: "cam1" }, null, 2),
        },
      ],
    });
  });

  it("handles arrays", () => {
    const result = formatSuccess([1, 2, 3]);
    expect(result.content[0].text).toBe(JSON.stringify([1, 2, 3], null, 2));
  });

  it("handles null", () => {
    const result = formatSuccess(null);
    expect(result.content[0].text).toBe("null");
  });

  it("handles strings", () => {
    const result = formatSuccess("ok");
    expect(result.content[0].text).toBe('"ok"');
  });
});

describe("formatError", () => {
  it("extracts message from Error instances", () => {
    const result = formatError(new Error("something broke"));
    expect(result).toEqual({
      content: [{ type: "text", text: "Error: something broke" }],
      isError: true,
    });
  });

  it("converts non-Error values to string", () => {
    const result = formatError("raw string error");
    expect(result).toEqual({
      content: [{ type: "text", text: "Error: raw string error" }],
      isError: true,
    });
  });

  it("converts numbers to string", () => {
    const result = formatError(404);
    expect(result.content[0].text).toBe("Error: 404");
  });
});
