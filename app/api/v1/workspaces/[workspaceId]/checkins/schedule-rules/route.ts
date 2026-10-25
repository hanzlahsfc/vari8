import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import {
  createCheckInScheduleRuleFromAction,
  listCheckInScheduleRulesForClient,
} from "@/lib/checkin/instances-boundary";

import { readBody, sessionOf, unwrap } from "../_result";

/**
 * GET  /api/v1/workspaces/:workspaceId/checkins/schedule-rules
 * POST /api/v1/workspaces/:workspaceId/checkins/schedule-rules
 *
 * One recurring weekly rule per weekday (D30: creating a rule never generates
 * occurrences; the explicit generate route does). `plan.read` is the matrix
 * cell for "check-in schedule"; the service re-authorizes the client scope.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const querySchema = z.object({ clientProfileId: z.string().min(1) });

const WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

const bodySchema = z.object({
  clientProfileId: z.string().min(1),
  formId: z.string().min(1),
  weekday: z.enum(WEEKDAYS),
  localTimeMinutes: z.number().int().min(0).max(1439),
  timezone: z.string().min(1).max(64),
  startDate: z.string().min(10).max(10),
  endDate: z.string().min(10).max(10).nullish(),
  replacesRuleId: z.string().min(1).nullish(),
});

export const GET = defineApiV1Route({
  capability: "plan.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrap(
      await listCheckInScheduleRulesForClient(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: query.clientProfileId,
      }),
    ),
});

export const POST = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrap(
      await createCheckInScheduleRuleFromAction(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: body.clientProfileId,
        formId: body.formId,
        weekday: body.weekday,
        localTimeMinutes: body.localTimeMinutes,
        timezone: body.timezone,
        startDate: body.startDate,
        endDate: body.endDate ?? null,
        replacesRuleId: body.replacesRuleId ?? undefined,
      }),
    );
  },
});
