// W2-A1: the workspace-level private note list the Notes screen syncs
// (coach/notes.tsx). Lives under client-detail because /notes is the staff
// per-note API. Same CoachNote rows with a null clientProfileId. notes.write
// is staff-only: clients and foreign-workspace members get a literal 403.
//
// PUT replaces the whole list - the canvas edits the collection in place.

import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import {
  listWorkspaceCoachNotes,
  writeWorkspaceCoachNotes,
} from "@/lib/workspace/client-detail";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

const putBodySchema = z.object({
  notes: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        text: z.string().min(1).max(4000),
        pinned: z.boolean().optional(),
      }),
    )
    .max(500),
});

export const GET = defineApiV1Route({
  capability: "notes.write",
  params: paramsSchema,
  handler: ({ workspace }) => listWorkspaceCoachNotes(workspace),
});

export const PUT = defineApiV1Route({
  capability: "notes.write",
  params: paramsSchema,
  handler: async ({ workspace, request }) => {
    const body = putBodySchema.parse(await request.json());
    return writeWorkspaceCoachNotes(workspace, body.notes);
  },
});
