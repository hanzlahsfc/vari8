import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import {
  readStaffCheckInCalendar,
  scheduleCheckInInstanceFromAction,
} from "@/lib/checkin/instances-boundary";

import { readBody, sessionOf, unwrap } from "../_result";

/**
 * GET  /api/v1/workspaces/:workspaceId/checkins/instances
 * POST /api/v1/workspaces/:workspaceId/checkins/instances
 *
 * GET is the bounded calendar read the board renders from (max 95 days). POST
 * is the one-off staff instance behind "add extra date"; CLIENT is denied by
 * the capability matrix before the service runs (owner ruling O4: clients may
 * not start a custom check-in).
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const querySchema = z.object({
  clientProfileId: z.string().min(1),
  from: z.string().min(10).max(40),
  to: z.string().min(10).max(40),
});

const bodySchema = z.object({
  clientProfileId: z.string().min(1),
  formId: z.string().min(1),
  formVersionId: z.string().min(1),
  dueAt: z.string().min(10).max(40),
  dueTz: z.string().min(1).max(64).nullish(),
  coachNote: z.string().max(2000).nullish(),
});

export const GET = defineApiV1Route({
  capability: "plan.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrap(
      await readStaffCheckInCalendar(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: query.clientProfileId,
        from: query.from,
        to: query.to,
      }),
    ),
});

export const POST = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrap(
      await scheduleCheckInInstanceFromAction(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: body.clientProfileId,
        formId: body.formId,
        formVersionId: body.formVersionId,
        dueAt: body.dueAt,
        dueTz: body.dueTz ?? null,
        coachNote: body.coachNote ?? null,
      }),
    );
  },
});
