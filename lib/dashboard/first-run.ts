import type { PrismaClient } from "@prisma/client";

import { authorize, type SessionLike } from "../auth/guard";
import { prisma } from "../db";
import {
  createPrismaAuthorizationRepo,
  type PrismaLike,
} from "../workspace/access";

/**
 * W2-T4 (R1) - derived first-run checklist flags for the coach workspace.
 *
 * Every flag derives live from existing workspace rows; nothing is persisted.
 * The read re-authorizes `workspaceSettings/read` - the same staff shell gate
 * the workspace overview page applies - so the service is safe to call from
 * both the page and the flag-read route. Flags are workspace-level existence
 * bits (counts only); no client names, ids, or health data leave the service.
 *
 * Flag sources on this base:
 *   hasClient - a non-archived ClientProfile exists (the T3 invite flow
 *     creates them on this base via `lib/workspace/invitations.ts`; the
 *     invite-issue UI lands with w2-t3).
 *   hasForm   - an ACTIVE CheckInForm or OnboardingForm exists (the existing
 *     check-ins/forms and onboarding/forms surfaces).
 *   hasPlan   - any plan record exists: ClientPlan, MealPlan,
 *     TrainingProgram, IifymPlan or SupplementPlan.
 */
export type FirstRunFlags = {
  hasClient: boolean;
  hasForm: boolean;
  hasPlan: boolean;
};

export type FirstRunChecklist = FirstRunFlags & {
  completed: number;
  total: number;
  visible: boolean;
};

export const FIRST_RUN_TOTAL = 3;

/** Pure mount-condition + progress derivation the page and card share. */
export function deriveFirstRunChecklist(
  flags: FirstRunFlags,
): FirstRunChecklist {
  const completed =
    (flags.hasClient ? 1 : 0) +
    (flags.hasForm ? 1 : 0) +
    (flags.hasPlan ? 1 : 0);
  return {
    ...flags,
    completed,
    total: FIRST_RUN_TOTAL,
    visible: completed < FIRST_RUN_TOTAL,
  };
}

/**
 * Authorize the staff workspace read, then derive the three flags from
 * workspace-scoped counts. Denials propagate as `AccessDeniedError`; callers
 * map it to the route/page denial shape.
 */
export async function readFirstRunFlags(
  session: SessionLike,
  input: { workspaceId: string },
  client: PrismaLike = prisma,
): Promise<FirstRunFlags> {
  await authorize(
    session,
    {
      resource: "workspaceSettings",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(client),
  );
  const where = { workspaceId: input.workspaceId };
  const [
    clients,
    checkInForms,
    onboardingForms,
    clientPlans,
    mealPlans,
    trainingPrograms,
    iifymPlans,
    supplementPlans,
  ] = await Promise.all([
    client.clientProfile.count({
      where: { ...where, archivedAt: null },
    }),
    client.checkInForm.count({ where: { ...where, status: "ACTIVE" } }),
    client.onboardingForm.count({ where: { ...where, status: "ACTIVE" } }),
    client.clientPlan.count({ where }),
    client.mealPlan.count({ where }),
    client.trainingProgram.count({ where }),
    client.iifymPlan.count({ where }),
    client.supplementPlan.count({ where }),
  ]);
  return {
    hasClient: clients > 0,
    hasForm: checkInForms + onboardingForms > 0,
    hasPlan:
      clientPlans +
        mealPlans +
        trainingPrograms +
        iifymPlans +
        supplementPlans >
      0,
  };
}

export async function readFirstRunChecklist(
  session: SessionLike,
  input: { workspaceId: string },
  client: PrismaClient | PrismaLike = prisma,
): Promise<FirstRunChecklist> {
  const flags = await readFirstRunFlags(session, input, client);
  return deriveFirstRunChecklist(flags);
}
