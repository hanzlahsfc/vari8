import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";

/**
 * Removes ONLY the reserved S1-H E2E rows created by `global-setup.ts`
 * (workspaces by reserved slug, users by reserved email). No broad deletes.
 */
export default async function globalTeardown(): Promise<void> {
  const url = e2eDatabaseUrl();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const emails = [
      E2E.owner,
      E2E.coach,
      E2E.client,
      E2E.assistant,
      E2E.support,
      E2E.nonmember,
      E2E.deactivated,
    ];
    const slugs = [E2E.workspaceSlug, E2E.workspaceBSlug];
    const workspaces = await prisma.workspace.findMany({
      where: { slug: { in: slugs } },
      select: { id: true },
    });
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const workspaceIds = workspaces.map((w) => w.id);
    const userIds = users.map((u) => u.id);

    // P-014: template reference rows/versions/templates and parameters
    // Restrict-reference members + workspaces — delete before members.
    await prisma.coachingTemplateVersionParameter.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.coachingTemplateVersion.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.coachingTemplate.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.parameterDefinition.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    // P-008: form versions/forms Restrict-reference members and workspaces —
    // delete fixture-owned definitions before members/workspaces.
    await prisma.onboardingFormVersion.deleteMany({
      where: { form: { workspaceId: { in: workspaceIds } } },
    });
    await prisma.onboardingForm.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    // P-025: Check-In rows Restrict-reference workspaces, profiles,
    // versions, and members — children first, then instances, then the
    // version/form definitions.
    await prisma.checkInReview.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.checkInSubmissionAnswer.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.checkInSubmission.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.checkInInstance.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.checkInFormVersion.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.checkInForm.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    // DailyEntry fixture rows — values, pointer, revisions, entries —
    // Restrict-reference workspaces/profiles/templates/members.
    await prisma.dailyEntryRevisionValue.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.dailyEntry.updateMany({
      where: { workspaceId: { in: workspaceIds } },
      data: { currentRevisionId: null },
    });
    await prisma.dailyEntryRevision.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.dailyEntry.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    // Consent + setup + assignment + profile rows Restrict-reference the
    // workspace and members — delete before members/workspaces.
    await prisma.consentRecord.deleteMany({
      where: { clientProfile: { workspaceId: { in: workspaceIds } } },
    });
    await prisma.clientSetupPin.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.clientSetup.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.clientAssignment.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    // CLIENT-TASKS-I1-R3: task rows RESTRICT-profile — drop them before
    // the profile sweep so teardown cannot die on a leftover task.
    await prisma.clientTask.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.clientProfile.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.workspaceMember.deleteMany({
      where: {
        OR: [
          { workspaceId: { in: workspaceIds } },
          { userId: { in: userIds } },
        ],
      },
    });
    // Defensive: `AuditEvent.subjectUserId`/`AccessToken.userId` are Restrict.
    // The shell creates neither today, but delete reserved-user dependents
    // first so teardown stays robust if later slices add them.
    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { workspaceId: { in: workspaceIds } },
          { subjectUserId: { in: userIds } },
          { actorUserId: { in: userIds } },
        ],
      },
    });
    await prisma.accessToken.deleteMany({
      where: {
        OR: [{ userId: { in: userIds } }, { createdByUserId: { in: userIds } }],
      },
    });
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await prisma.$disconnect();
  }
}
