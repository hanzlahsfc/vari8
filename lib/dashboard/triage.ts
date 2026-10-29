/**
 * W2-T5 (R11): workspace-wide coach attention triage. The roster's
 * needsAttention read model run against real workspace rows. Rows are
 * derived, never persisted; every cause clears itself the moment the
 * underlying record changes (submission, review, cancellation,
 * completion, read).
 *
 * Authorization mirrors `listWorkspaceClientRoster`: the /api/v1 route
 * layer resolves membership, ACTIVE workspace and the `roster.read`
 * capability scope; this service trusts that typed context and only
 * performs the scoped read. On this base there is no staff training-flag
 * column, so `trainingFlags` derives as 0. The sibling flag source is
 * recorded for the consolidation pass.
 */

import type { PrismaClient } from "@prisma/client";

import type { ApiViewer, ApiWorkspaceContext } from "@/lib/api/v1";
import { buildTriageRows, type TriageRow } from "@/lib/canvas/attention";
import { prisma } from "@/lib/db";
import { serverTodayUtc, taskDueState } from "@/lib/tasks/date";

export type AttentionTriageItem = {
  clientProfileId: string;
  name: string;
} & Omit<TriageRow, "clientId" | "name">;

export type AttentionTriageResult = { items: AttentionTriageItem[] };

export type TriagePrismaLike = Pick<
  PrismaClient,
  "clientProfile" | "checkInInstance" | "clientTask" | "message"
>;

export type AttentionTriageDeps = {
  db?: TriagePrismaLike;
  now?: Date;
};

export async function listWorkspaceAttentionTriage(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  deps: AttentionTriageDeps = {},
): Promise<AttentionTriageResult> {
  const db = deps.db ?? prisma;
  const now = deps.now ?? new Date();
  const today = serverTodayUtc(now);

  const profiles = await db.clientProfile.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      archivedAt: null,
      // Same defense-in-depth as the roster: an "own" scope only ever
      // matches the caller's profile. roster.read currently denies
      // clients outright, so this is a guard, not new scope.
      ...(workspace.scope === "own" ? { userId: viewer.userId } : {}),
    },
    select: { id: true, name: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (profiles.length === 0) return { items: [] };
  const clientIds = profiles.map((profile) => profile.id);

  const [instances, tasks, unread] = await Promise.all([
    db.checkInInstance.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        clientProfileId: { in: clientIds },
        cancelledAt: null,
      },
      select: {
        clientProfileId: true,
        dueAt: true,
        submissions: {
          select: { id: true, reviews: { select: { id: true }, take: 1 } },
          take: 1,
        },
      },
    }),
    db.clientTask.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        clientProfileId: { in: clientIds },
        status: "OPEN",
      },
      select: { clientProfileId: true, dueDate: true },
    }),
    db.message.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        senderKind: "CLIENT",
        conversation: { clientProfileId: { in: clientIds } },
        reads: { none: { userId: viewer.userId } },
      },
      select: { conversation: { select: { clientProfileId: true } } },
    }),
  ]);

  const signals = new Map(
    profiles.map((profile) => [
      profile.id,
      {
        clientId: profile.id,
        name: profile.name,
        checkInOverdue: false,
        awaitingFeedbackCount: 0,
        unreadCount: 0,
        openTaskCount: 0,
        overdueTaskCount: 0,
        trainingFlags: 0,
      },
    ]),
  );
  for (const instance of instances) {
    const row = signals.get(instance.clientProfileId);
    if (!row) continue;
    const submission = instance.submissions[0];
    if (!submission) {
      if (instance.dueAt.getTime() < now.getTime()) row.checkInOverdue = true;
    } else if (submission.reviews.length === 0) {
      row.awaitingFeedbackCount += 1;
    }
  }
  for (const task of tasks) {
    const row = signals.get(task.clientProfileId);
    if (!row) continue;
    const dueDate = task.dueDate.toISOString().slice(0, 10);
    if (taskDueState(dueDate, today) === "overdue") row.overdueTaskCount += 1;
    else row.openTaskCount += 1;
  }
  for (const entry of unread) {
    const row = signals.get(entry.conversation.clientProfileId);
    if (row) row.unreadCount += 1;
  }

  return {
    items: buildTriageRows([...signals.values()]).map((row) => ({
      clientProfileId: row.clientId,
      name: row.name,
      reasons: row.reasons,
      priority: row.priority,
      attentionCount: row.attentionCount,
    })),
  };
}
