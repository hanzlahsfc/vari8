import type { PrismaClient } from "@prisma/client";

/**
 * Fixture-scoped fixture sweep shared by `global-teardown.ts` and its
 * integration coverage. Deletes ONLY rows belonging to the supplied
 * workspace/user ids — never a broad sweep — in RESTRICT dependency order
 * (children before the profiles/members/workspaces/users they reference).
 * Every statement is a `deleteMany`, so the sweep is idempotent and safe
 * to re-run after a partial failure.
 */
export async function sweepFixtureWorkspaces(
  prisma: PrismaClient,
  workspaceIds: string[],
  userIds: string[],
): Promise<void> {
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
  // HABITS-I1-R2: habit rows RESTRICT the client profile (composite
  // coherence FK + RESTRICT), and logs/schedules RESTRICT their habit —
  // delete children first, then the habits, before the profile sweep.
  await prisma.habitLog.deleteMany({
    where: { habit: { workspaceId: { in: workspaceIds } } },
  });
  await prisma.habitSchedule.deleteMany({
    where: { habit: { workspaceId: { in: workspaceIds } } },
  });
  await prisma.habit.deleteMany({
    where: { workspaceId: { in: workspaceIds } },
  });
  // Client dashboard layouts RESTRICT the client profile — sweep them
  // before profiles or a leaked layout fails the whole teardown.
  await prisma.clientDashboardLayout.deleteMany({
    where: { workspaceId: { in: workspaceIds } },
  });
  // P694: voice/messaging fixtures create conversation graphs — sweep the
  // message/draft/read/attachment rows before the profile they key on.
  await prisma.messageDraftAttachment.deleteMany({
    where: { workspaceId: { in: workspaceIds } },
  });
  await prisma.messageDraft.deleteMany({
    where: { workspaceId: { in: workspaceIds } },
  });
  await prisma.messageRead.deleteMany({
    where: { message: { workspaceId: { in: workspaceIds } } },
  });
  await prisma.messageAttachment.deleteMany({
    where: { workspaceId: { in: workspaceIds } },
  });
  await prisma.message.deleteMany({
    where: { workspaceId: { in: workspaceIds } },
  });
  await prisma.conversation.deleteMany({
    where: { workspaceId: { in: workspaceIds } },
  });
  await prisma.mediaAssignment.deleteMany({
    where: { workspaceId: { in: workspaceIds } },
  });
  await prisma.mediaObject.deleteMany({
    where: { workspaceId: { in: workspaceIds } },
  });
  await prisma.clientProfile.deleteMany({
    where: { workspaceId: { in: workspaceIds } },
  });
  await prisma.workspaceMember.deleteMany({
    where: {
      OR: [{ workspaceId: { in: workspaceIds } }, { userId: { in: userIds } }],
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
}
