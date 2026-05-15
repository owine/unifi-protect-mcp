import { describe, it, expect } from "vitest";
import { formatSuccess, formatError } from "../../src/utils/responses.js";

describe("formatSuccess", () => {
  it("wraps data as JSON text content and structured content", () => {
    const data = { id: "abc", name: "cam1" };
    const result = formatSuccess(data);
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
      structuredContent: data,
    });
  });

  it("wraps arrays under `result` so structuredContent stays an object", () => {
    const result = formatSuccess([1, 2, 3]);
    expect(result.content[0].text).toBe(JSON.stringify([1, 2, 3], null, 2));
    expect(result.structuredContent).toEqual({ result: [1, 2, 3] });
  });

  it("wraps null under `result`", () => {
    const result = formatSuccess(null);
    expect(result.content[0].text).toBe("null");
    expect(result.structuredContent).toEqual({ result: null });
  });

  it("wraps primitives under `result`", () => {
    const result = formatSuccess("ok");
    expect(result.content[0].text).toBe('"ok"');
    expect(result.structuredContent).toEqual({ result: "ok" });
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
