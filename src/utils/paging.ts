import { z } from "zod";

/**
 * Optional paging for list tools. Protect's list endpoints return every item,
 * so a large site can produce a result bigger than a host will pass to the
 * model; these slice it server-side. With neither given, a list tool returns
 * exactly what Protect returned.
 */
export const pagingInput = {
  limit: z.number().int().min(1).optional().describe("Return at most this many items"),
  offset: z.number().int().min(0).optional().describe("Skip this many items first (default 0)"),
};

/** Appended to every list tool's description. */
export const PAGING_NOTE =
  " On a large site, use limit and offset to page; a paged result also returns totalCount and offset.";

/** The page of a list that limit/offset select, or the list unchanged when neither is set. */
export function pageOf(data: unknown, limit: number | undefined, offset: number | undefined): unknown {
  if ((limit === undefined && offset === undefined) || !Array.isArray(data)) return data;
  const start = offset ?? 0;
  return {
    result: data.slice(start, limit === undefined ? undefined : start + limit),
    totalCount: data.length,
    offset: start,
  };
}
