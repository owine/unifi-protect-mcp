import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY, WRITE, formatDryRun } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
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
  server: McpServer,
  client: ProtectClient,
  readOnly: boolean
) {
  server.registerTool(
    "protect_list_files",
    {
      description:
        "List device asset files (only 'animations' is supported — clips uploadable to G4 Doorbell screens). Returns array; each record (verified live 7.3.70): id, name (server-generated), type, originalName, path, size, createdAt, updatedAt, metadata. An image upload (verified for GIF) later gains a derived <name>.gif preview record, created asynchronously, so a listing taken right after the upload may show only the stored image.",
      inputSchema: { fileType: FILE_TYPE },
      outputSchema: fileListOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ fileType }) => {
      try {
        const data = await client.get(safePath`/files/${fileType}`);
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
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
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      outputSchema: fileOutputSchema,
      annotations: WRITE,
    },
    async ({ fileType, base64Data, contentType, fileName, dryRun }) => {
      try {
        const name = fileName ?? defaultFileName(contentType);
        const buffer = decodeBase64(base64Data);
        if (dryRun) {
          return formatDryRun("POST", safePath`/files/${fileType}`, {
            contentType,
            fileName: name,
            byteLength: buffer.length,
          });
        }
        const data = await client.postFile(
          safePath`/files/${fileType}`,
          buffer,
          contentType,
          name
        );
        return formatSuccess(data);
      } catch (err) {
        return formatError(err);
      }
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
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$|^[A-Za-z0-9_-]+$/;

/**
 * Decode upload content strictly. Buffer.from(x, "base64") skips characters it
 * cannot decode, so a data: URL or a stray non-base64 string would otherwise
 * upload as corrupt bytes with no error.
 */
function decodeBase64(input: string): Buffer {
  const cleaned = input.replace(DATA_URL_PREFIX, "").replace(/\s+/g, "");
  if (!BASE64.test(cleaned)) {
    throw new Error(
      "base64Data is not valid base64 (expected A-Z, a-z, 0-9, + and /, optionally = padded, or a data: URL)"
    );
  }
  return Buffer.from(cleaned, "base64");
}
