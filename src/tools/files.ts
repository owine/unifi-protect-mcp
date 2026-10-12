import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProtectClient } from "../client.js";
import { formatSuccess, formatError } from "../utils/responses.js";
import { READ_ONLY, WRITE, formatDryRun } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
import { fileListOutputSchema } from "../schemas/misc.js";

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
        "List files of a given type (only 'animations' is currently supported — clips uploadable to G4 Doorbell screens). Returns array; each record (7.1.83 docs): name (server-generated), type, originalName, path.",
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
      description: "Upload a base64-encoded device asset file (sent as multipart/form-data)",
      inputSchema: {
        fileType: FILE_TYPE,
        base64Data: z.string().describe("Base64-encoded file content"),
        contentType: z
          .enum(UPLOAD_CONTENT_TYPES)
          .default("image/gif")
          .describe("MIME type of the file"),
        fileName: z
          .string()
          .min(1)
          .optional()
          .describe("Original file name to record (reported back as originalName)"),
        dryRun: z
          .boolean()
          .optional()
          .describe("If true, return what would happen without making changes"),
      },
      annotations: WRITE,
    },
    async ({ fileType, base64Data, contentType, fileName, dryRun }) => {
      try {
        const name = fileName ?? defaultFileName(contentType);
        if (dryRun) {
          return formatDryRun("POST", safePath`/files/${fileType}`, {
            contentType,
            fileName: name,
            dataLength: base64Data.length,
          });
        }
        const buffer = Buffer.from(base64Data, "base64");
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
