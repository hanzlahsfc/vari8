// W2-A1: the coach's client detail surface - profile core plus the owned
// collections (phases, private/general coach notes with the pin flag, and
// per-week timeline notes). GET and PUT both gate on notes.write, which the
// D15 matrix denies to clients outright and which requires ACTIVE staff
// membership in the addressed workspace, so a foreign-workspace coach gets a
// literal 403 before any row is touched.
//
// PUT is a full replace of the owned collections: the canvas edits them
// in place and the service reconciles the payload inside one transaction.

import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import {
  readClientDetail,
  writeClientDetail,
} from "@/lib/workspace/client-detail";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1).max(64),
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
  handler: ({ workspace, params }) =>
    readClientDetail(workspace, params.clientProfileId),
});

export const PUT = defineApiV1Route({
  capability: "notes.write",
  params: paramsSchema,
  handler: async ({ workspace, params, request }) => {
    const body = putBodySchema.parse(await request.json());
    return writeClientDetail(workspace, params.clientProfileId, body);
  },
});
