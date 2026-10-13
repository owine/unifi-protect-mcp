import { z } from "zod";
import type { ToolRegistrar } from "./registrar.js";
import { ProtectClient } from "../client.js";
import { formatSuccess } from "../utils/responses.js";
import { READ_ONLY, WRITE, DESTRUCTIVE, formatDryRun, dryRunInput } from "../utils/safety.js";
import { safePath } from "../utils/url.js";
import { PAGING_NOTE, pageOf, pagingInput } from "../utils/paging.js";
import { resourceId } from "../utils/params.js";
import {
  liveviewListOutputSchema,
  liveviewOutputSchema,
} from "../schemas/misc.js";

// POST and PATCH both take the full liveview object; every field is required
// (7.3.70 docs). Slot item schema is not rendered in the docs, so slots pass
// through beyond the observed { cameras, cycleMode, cycleInterval }.
const liveviewSlotInput = z
  .object({
    cameras: z.array(z.string()).describe("Camera IDs shown in this slot"),
    cycleMode: z.string().describe('Cycle mode, e.g. "time" or "motion"'),
    cycleInterval: z.number().describe("Cycle interval in seconds"),
  })
  .loose();

const liveviewBody = z
  .object({
    id: resourceId().describe("Liveview ID"),
    modelKey: z.literal("liveview").describe('Must be "liveview"'),
    name: z.string().describe("Liveview name"),
    isDefault: z.boolean().describe("Whether this is the default liveview for all viewers"),
    isGlobal: z.boolean().describe("Whether this liveview is available to all users"),
    owner: z.string().describe("Owning user ID"),
    layout: z.number().min(1).max(26).describe("Number of slots (1-26)"),
    slots: z.array(liveviewSlotInput).describe("Per-slot cameras and cycling settings"),
  })
  .loose();

export function registerLiveviewTools(
  server: ToolRegistrar,
  client: ProtectClient,
  readOnly: boolean
) {
  server.registerTool(
    "protect_list_liveviews",
    {
      description:
        "List all live views (camera grid layouts shown on viewers / in the Protect UI). Returns array; each liveview includes (Integration API 7.3.70-verified): id, modelKey, name, isDefault, isGlobal, layout (number, slot count), owner (user ID), slots (array of {cameras: string[], cycleMode, cycleInterval}). NOTE: slots use a `cameras` string-array, not a single `cameraId`." + PAGING_NOTE,
      inputSchema: pagingInput,
      outputSchema: liveviewListOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ limit, offset }) => {
      const data = await client.get("/liveviews");
      return formatSuccess(pageOf(data, limit, offset));
    }
  );

  server.registerTool(
    "protect_get_liveview",
    {
      description:
        "Get details for a specific live view by ID. Returns: id, modelKey, name, isDefault, isGlobal, layout, owner, slots (each slot: cameras string[], cycleMode, cycleInterval). The full slot list is needed when updating because PATCH replaces the slots array.",
      inputSchema: { id: resourceId().describe("Liveview ID") },
      outputSchema: liveviewOutputSchema,
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const data = await client.get(safePath`/liveviews/${id}`);
      return formatSuccess(data);
    }
  );

  if (readOnly) return;

  server.registerTool(
    "protect_create_liveview",
    {
      description:
        "Create a new live view. Returns: the created liveview (same fields as protect_get_liveview).",
      inputSchema: {
        settings: liveviewBody.describe("Full liveview object (all fields required)"),
        dryRun: dryRunInput(),
      },
      outputSchema: liveviewOutputSchema,
      annotations: WRITE,
    },
    async ({ settings, dryRun }) => {
      if (dryRun) {
        return formatDryRun("POST", "/liveviews", settings);
      }
      const data = await client.post("/liveviews", settings);
      return formatSuccess(data);
    }
  );

  server.registerTool(
    "protect_update_liveview",
    {
      description:
        "Update an existing live view (full replacement via PUT-style PATCH — include all fields). Returns: the updated liveview.",
      inputSchema: {
        id: resourceId().describe("Liveview ID"),
        settings: liveviewBody.describe(
          "Full liveview object (all fields required — fetch it with protect_get_liveview first)"
        ),
        dryRun: dryRunInput(),
      },
      outputSchema: liveviewOutputSchema,
      annotations: DESTRUCTIVE,
    },
    async ({ id, settings, dryRun }) => {
      // The body is a full liveview object, so it carries its own id. A
      // mismatch means the caller copied the wrong liveview's body.
      if (settings.id !== id) {
        throw new Error(
          `settings.id (${settings.id}) does not match the liveview being updated (${id})`
        );
      }
      if (dryRun) {
        return formatDryRun("PATCH", safePath`/liveviews/${id}`, settings);
      }
      const data = await client.patch(safePath`/liveviews/${id}`, settings);
      return formatSuccess(data);
    }
  );
}
