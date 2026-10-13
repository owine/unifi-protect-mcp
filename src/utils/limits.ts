import { STDIO_DEFAULT_MAX_BUFFER_SIZE } from "@modelcontextprotocol/sdk/shared/stdio.js";
import { DEFAULT_REQUEST_TIMEOUT_MSEC } from "@modelcontextprotocol/sdk/shared/protocol.js";

/**
 * Payload ceilings, all derived from what one MCP stdio message can carry.
 *
 * Over stdio each JSON-RPC message is one line, and the SDK's reader closes
 * the transport once a line exceeds STDIO_DEFAULT_MAX_BUFFER_SIZE: an SDK
 * client disconnects (every later call fails with "Not connected"), and this
 * server's own transport closing ends the process. So nothing this server
 * returns may exceed that, and what it accepts is checked before it could.
 */

/** Room kept for the JSON-RPC envelope and the rest of a result around its payload. */
const ENVELOPE_BYTES = 64 * 1024;

/** Base64 encodes every 3 bytes as 4 characters. */
const BASE64_CHARS_PER_BYTE = 4 / 3;

/** The largest payload, in bytes or base64 characters, one message can carry. */
const MAX_PAYLOAD = STDIO_DEFAULT_MAX_BUFFER_SIZE - ENVELOPE_BYTES;

/** A result carries a JSON response twice: as text and as structuredContent. */
export const MAX_JSON_BYTES = Math.floor(MAX_PAYLOAD / 2);

/** A snapshot reaches the client base64-encoded. */
export const MAX_SNAPSHOT_BYTES = Math.floor(MAX_PAYLOAD / BASE64_CHARS_PER_BYTE);

/** An upload arrives from the client base64-encoded. */
export const MAX_UPLOAD_BASE64_CHARS = MAX_PAYLOAD;

/**
 * How much larger than one message the server's own stdio reader accepts.
 * An upload over MAX_UPLOAD_BASE64_CHARS then still reaches input validation
 * and is refused with a message, instead of closing the transport and taking
 * the server down mid-session. Only a message beyond this still does that.
 */
const READ_HEADROOM = 4;

/** The server's stdio read buffer (see READ_HEADROOM). */
export const SERVER_READ_BUFFER_BYTES = STDIO_DEFAULT_MAX_BUFFER_SIZE * READ_HEADROOM;

/**
 * How much of an error body is read. Only its start reaches the model, so a
 * proxy's error page or a runaway body is not buffered whole.
 */
export const MAX_ERROR_BODY_BYTES = 64 * 1024;

/** Protect answers JSON calls quickly; a longer wait means something is wrong. */
export const REQUEST_TIMEOUT_MS = 25_000;

/**
 * Time left for the MCP client between our timeout and its own, so the
 * server's error (which names the call, and says whether a write may have
 * landed) reaches the model instead of a bare client-side timeout.
 */
const CLIENT_TIMEOUT_MARGIN_MS = 15_000;

/**
 * Snapshots and uploads get the longest budget that still ends before the MCP
 * SDK client's default request timeout. It used to equal that timeout, so a
 * slow snapshot always lost the race.
 */
export const BINARY_TIMEOUT_MS = DEFAULT_REQUEST_TIMEOUT_MSEC - CLIENT_TIMEOUT_MARGIN_MS;
