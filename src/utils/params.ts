import { z } from "zod";

/**
 * Protect resource IDs are 24-character hex ObjectIds or UUIDs. The pattern
 * allows that charset with headroom, and nothing else: IDs are interpolated
 * into request paths, and while safePath encodes `/ ? # % \`, a bare `.` or
 * `..` survives encoding and URL parsing then folds it out of the path.
 */
const RESOURCE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** An Integration API resource ID, as returned by the list and get tools. */
export function resourceId() {
  return z.string().regex(RESOURCE_ID, "Use an ID returned by a list or get tool");
}

/**
 * Literal routes that sit beside /arm-profiles/{id}. An "ID" naming one would
 * reach that endpoint instead: PATCH /arm-profiles/settings is the set-current
 * call, which requires confirm, so update_arm_profile must not reach it.
 */
const ARM_PROFILE_ROUTES = new Set(["settings", "enable", "disable"]);

/** An arm profile ID: a resource ID that is not one of the literal routes beside it. */
export function armProfileId() {
  return resourceId().refine(
    (id) => !ARM_PROFILE_ROUTES.has(id),
    "Use an arm profile ID from protect_list_arm_profiles"
  );
}

/**
 * An alarm manager webhook ID. These are user-defined in the alarm manager,
 * so any text is allowed (safePath encodes it) except a bare dot segment.
 */
export function webhookId() {
  return z
    .string()
    .min(1)
    .refine((id) => id !== "." && id !== "..", "A webhook ID cannot be . or ..");
}
