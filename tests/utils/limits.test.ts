import { describe, it, expect } from "vitest";
import { STDIO_DEFAULT_MAX_BUFFER_SIZE } from "@modelcontextprotocol/sdk/shared/stdio.js";
import {
  MAX_JSON_BYTES,
  MAX_SNAPSHOT_BYTES,
  MAX_UPLOAD_BASE64_CHARS,
  SERVER_READ_BUFFER_BYTES,
} from "../../src/utils/limits.js";

/**
 * An MCP stdio peer drops the connection once one message exceeds the SDK's
 * read buffer, so every payload ceiling must leave room for the JSON-RPC
 * envelope inside one message.
 */
describe("payload ceilings fit one stdio message", () => {
  it("a snapshot, base64-encoded, fits", () => {
    expect(Math.ceil(MAX_SNAPSHOT_BYTES / 3) * 4).toBeLessThan(STDIO_DEFAULT_MAX_BUFFER_SIZE);
  });

  it("a JSON response, carried twice (text and structuredContent), fits", () => {
    expect(MAX_JSON_BYTES * 2).toBeLessThan(STDIO_DEFAULT_MAX_BUFFER_SIZE);
  });

  it("the server reads an over-limit upload far enough to reject it with a message", () => {
    expect(SERVER_READ_BUFFER_BYTES).toBeGreaterThan(STDIO_DEFAULT_MAX_BUFFER_SIZE);
    expect(MAX_UPLOAD_BASE64_CHARS).toBeLessThan(STDIO_DEFAULT_MAX_BUFFER_SIZE);
  });
});
