// W2-A2 staff training-program surface.
import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import {
  readStaffTrainingPrograms,
  saveTrainingProgramDraft,
} from "@/lib/trainingprogram/service";

import { readBody, sessionOf, unwrapTraining } from "./_result";

/**
 * GET /api/v1/workspaces/:workspaceId/clients/:clientProfileId/training-programs
 *
 * Staff program list, lifecycle-unfiltered (drafts, pending, cancelled,
 * dead, superseded with truthful labels). Keyset by
 * (createdAt, id) via ?cursorCreatedAt=&cursorId=. `plan.read` gates
 * the route; the service re-authorizes under locks. A foreign-workspace
 * caller never reaches the service: the member check returns 403.
 *
 * PUT: save the shared boundary draft under `expectedRevision` CAS.
 * Revision 0 creates the program container (title, startDate,
 * weekCount, fieldConfig required); later revisions update in place.
 * Locked past weeks and the published start anchor reject on write.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
});

const querySchema = z.object({
  cursorCreatedAt: z.string().min(1).optional(),
  cursorId: z.string().min(1).optional(),
});

const bodySchema = z.object({
  programId: z.string().min(1).optional(),
  expectedRevision: z.number().int().min(0),
  title: z.string().min(1).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  weekCount: z.number().int().min(1).optional(),
  fieldConfig: z.unknown().optional(),
  timezone: z.string().min(1).optional(),
  draft: z.unknown(),
});

export const GET = defineApiV1Route({
  capability: "plan.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrapTraining(
      readStaffTrainingPrograms(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        cursor:
          query.cursorCreatedAt !== undefined && query.cursorId !== undefined
            ? { createdAt: query.cursorCreatedAt, id: query.cursorId }
            : undefined,
      }),
    ),
});

export const PUT = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapTraining(
      saveTrainingProgramDraft(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        programId: body.programId,
        expectedRevision: body.expectedRevision,
        title: body.title,
        startDate: body.startDate,
        weekCount: body.weekCount,
        fieldConfig: body.fieldConfig,
        timezone: body.timezone,
        draft: body.draft,
      }),
    );
  },
});
