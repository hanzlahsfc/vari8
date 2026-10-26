// W2-A1: the workspace-wide client detail bundle the canvas hydrates once
// after its seed runs - every client's phases, coach notes and week notes,
// plus the workspace-level private note list. notes.write is staff-only, so
// clients and foreign-workspace members get a literal 403 at the gate.
//
// PUT is the same full replace as the per-client route, with the target
// client carried in the body as clientProfileId instead of the path.

import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import {
  readClientDetailBundle,
  writeClientDetail,
} from "@/lib/workspace/client-detail";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

const noteSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(4000),
  pinned: z.boolean().optional(),
});

const phaseSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationWeeks: z.number().int().min(1).max(52),
});

const putBodySchema = z.object({
  clientProfileId: z.string().min(1).max(64),
  phases: z.array(phaseSchema).max(24),
  internalNotes: z.array(noteSchema).max(500),
  generalNotes: z.array(noteSchema).max(500),
  weekNotes: z.record(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    z.string().max(4000),
  ),
});

export const GET = defineApiV1Route({
  capability: "notes.write",
  params: paramsSchema,
  handler: ({ workspace }) => readClientDetailBundle(workspace),
});

export const PUT = defineApiV1Route({
  capability: "notes.write",
  params: paramsSchema,
  handler: async ({ workspace, request }) => {
    const { clientProfileId, ...detail } = putBodySchema.parse(
      await request.json(),
    );
    return writeClientDetail(workspace, clientProfileId, detail);
  },
});
