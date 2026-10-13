import { describe, it, expect } from "vitest";
import { STDIO_DEFAULT_MAX_BUFFER_SIZE } from "@modelcontextprotocol/sdk/shared/stdio.js";
import { DEFAULT_REQUEST_TIMEOUT_MSEC } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
  MAX_JSON_BYTES,
  MAX_RESULT_BYTES,
  MAX_SNAPSHOT_BYTES,
  MAX_UPLOAD_BASE64_CHARS,
  SERVER_READ_BUFFER_BYTES,
  BINARY_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
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

  // Necessary, not sufficient: escaping can still push a result over, which
  // the result guard in registerAllTools catches (see sdk-contract.test.ts).
  it("a JSON response, carried twice (text and structuredContent), fits before escaping", () => {
    expect(MAX_JSON_BYTES * 2).toBeLessThan(STDIO_DEFAULT_MAX_BUFFER_SIZE);
  });

  it("a whole result leaves room for the JSON-RPC envelope", () => {
    expect(MAX_RESULT_BYTES).toBeLessThan(STDIO_DEFAULT_MAX_BUFFER_SIZE);
  });

  it("the server reads an over-limit upload far enough to reject it with a message", () => {
    expect(SERVER_READ_BUFFER_BYTES).toBeGreaterThan(STDIO_DEFAULT_MAX_BUFFER_SIZE);
    expect(MAX_UPLOAD_BASE64_CHARS).toBeLessThan(STDIO_DEFAULT_MAX_BUFFER_SIZE);
  });
});

// A request that outlives the MCP client's own timeout loses the race: the
// client reports a bare timeout and the server's clearer error is never seen.
describe("request timeouts end before the MCP client gives up", () => {
  it.each([["JSON", REQUEST_TIMEOUT_MS], ["binary", BINARY_TIMEOUT_MS]])("%s requests", (_kind, timeout) => {
    expect(timeout).toBeLessThan(DEFAULT_REQUEST_TIMEOUT_MSEC);
  });
});
