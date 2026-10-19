import { z } from "zod";
import type { ToolRegistrar } from "./registrar.js";
import { ProtectClient } from "../client.js";
import { formatSuccess } from "../utils/responses.js";
import { READ_ONLY, WRITE, formatDryRun, dryRunInput } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
import { PAGING_NOTE, pageOf, pagingInput } from "../utils/paging.js";
import { MAX_UPLOAD_BASE64_CHARS } from "../utils/limits.js";
import { fileListOutputSchema, fileOutputSchema } from "../schemas/misc.js";

// The only asset file type the API accepts (path param `assetFileType`).
const FILE_TYPE = z
  .literal("animations")
  .describe("Asset file type (only 'animations' is supported)");

const UPLOAD_CONTENT_TYPES = [
  "image/gif",
  "image/jpeg",
  "image/png",
  "audio/mpeg",
  "audio/mp4",
  "audio/wave",
  "audio/x-caf",
] as const;

export function registerFileTools(
  server: ToolRegistrar,
  client: ProtectClient,
  readOnly: boolean
) {
  server.registerTool(
    "protect_list_files",
    {
      description:
        "List device asset files (only 'animations' is supported — clips uploadable to G4 Doorbell screens). Returns array; each record (verified live 7.3.70): id, name (server-generated), type, originalName, path, size, createdAt, updatedAt, metadata. An image upload (verified for GIF) later gains a derived <name>.gif preview record, created asynchronously, so a listing taken right after the upload may show only the stored image." + PAGING_NOTE,
      inputSchema: { fileType: FILE_TYPE, ...pagingInput },
      outputSchema: fileListOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ fileType, limit, offset }) => {
      const data = await client.get(safePath`/files/${fileType}`);
      return formatSuccess(pageOf(data, limit, offset));
    }
  );

  if (readOnly) return;

  server.registerTool(
    "protect_upload_file",
    {
      description:
        "Upload a base64-encoded device asset file (sent as multipart/form-data). Observed for GIF image uploads: Protect stores the image as PNG (appending the stored extension to originalName) and a few seconds later creates a separate <name>.gif preview asset, which protect_list_files shows once it exists. Audio uploads have not been observed. Returns: id, name (server-generated), type, originalName, path, size, createdAt, updatedAt, metadata.",
      inputSchema: {
        fileType: FILE_TYPE,
        base64Data: z
          .string()
          .min(1)
          .max(MAX_UPLOAD_BASE64_CHARS, "File too large to send in one MCP message")
          .describe("Base64-encoded file content (a data: URL prefix is accepted and stripped)"),
        contentType: z
          .enum(UPLOAD_CONTENT_TYPES)
          .default("image/gif")
          .describe("MIME type of the file"),
        fileName: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Original file name to record. Reported back as originalName, with the stored extension appended when Protect converts the file (e.g. welcome.gif → welcome.gif.png)"
          ),
        dryRun: dryRunInput(),
      },
      outputSchema: fileOutputSchema,
      annotations: WRITE,
    },
    async ({ fileType, base64Data, contentType, fileName, dryRun }) => {
      const name = fileName ?? defaultFileName(contentType);
      const base64 = normalizeBase64(base64Data);
      if (dryRun) {
        return formatDryRun("POST", safePath`/files/${fileType}`, {
          contentType,
          fileName: name,
          byteLength: Buffer.byteLength(base64, "base64"),
        });
      }
      const data = await client.postFile(
        safePath`/files/${fileType}`,
        Buffer.from(base64, "base64"),
        contentType,
        name
      );
      return formatSuccess(data);
    }
  );
}

const EXTENSIONS: Record<(typeof UPLOAD_CONTENT_TYPES)[number], string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wave": "wav",
  "audio/x-caf": "caf",
};

function defaultFileName(contentType: (typeof UPLOAD_CONTENT_TYPES)[number]): string {
  return `upload.${EXTENSIONS[contentType]}`;
}

const DATA_URL_PREFIX = /^data:[^,]*;base64,/i;
/** Base64 encodes every 3 bytes as a group of 4 characters. */
const BASE64_GROUP_LENGTH = 4;
/** Standard or URL-safe base64 (one alphabet, not mixed), padded or not. */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$|^[A-Za-z0-9_-]+={0,2}$/;

/**
 * Strip whitespace and a data: URL prefix, then reject anything that is not
 * well-formed base64. Buffer.from(x, "base64") skips characters it cannot
 * decode and ignores a dangling final character, so malformed input would
 * otherwise upload as corrupt bytes with no error. Whitespace goes first, so
 * a prefix after a leading line break is still found.
 */
function normalizeBase64(input: string): string {
  const cleaned = input.replace(/\s+/g, "").replace(DATA_URL_PREFIX, "");
  // Padded input comes in whole groups; unpadded input can end in a partial
  // group of 2 or 3 characters, but never a lone character (remainder 1).
  const remainder = cleaned.length % BASE64_GROUP_LENGTH;
  const wellFormed =
    BASE64.test(cleaned) &&
    (cleaned.endsWith("=") ? remainder === 0 : remainder !== 1);
  if (!wellFormed) {
    throw new Error(
      "base64Data is not valid base64 (expected A-Z, a-z, 0-9 with + and / or - and _, correctly = padded, or a data: URL)"
    );
  }
  return cleaned;
}
