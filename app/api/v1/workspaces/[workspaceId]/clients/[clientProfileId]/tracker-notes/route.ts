import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { writeStaffTrackerNote } from "@/lib/daily-entry/service";

import {
  readBody,
  sessionOf,
  unwrapDailyEntry,
} from "../../../daily-entries/_result";

/**
 * PUT/DELETE /api/v1/workspaces/:workspaceId/clients/:clientProfileId/tracker-notes
 *
 * W2-FE2 staff coach notes on the tracker span. A body carrying
 * `parameterKey` writes the per-cell TrackerComment; omitting it writes the
 * per-day TrackerDayNote. An empty (or absent) body deletes the note.
 * notes.write admits staff members at the v1 layer; the service then applies
 * the authoritative coachNotes/write matrix (assigned COACH scope only,
 * owners denied per rbac.ts D10) and enforces client coherence.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
});

const bodySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  parameterKey: z.string().min(1).nullish(),
  body: z.string().max(2000).nullish(),
});

export const PUT = defineApiV1Route({
  capability: "notes.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapDailyEntry(
      writeStaffTrackerNote(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        entryDate: body.entryDate,
        parameterKey: body.parameterKey ?? null,
        body: body.body ?? null,
      }),
    );
  },
});

export const DELETE = defineApiV1Route({
  capability: "notes.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapDailyEntry(
      writeStaffTrackerNote(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        entryDate: body.entryDate,
        parameterKey: body.parameterKey ?? null,
        body: null,
      }),
    );
  },
});
