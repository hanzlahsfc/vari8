/**
 * W2-T5 coach attention triage. Shared needsAttention derivation and the
 * workspace service that surfaces it. Written RED before the modules exist.
 *
 * The derivation must stay identical to the roster's logic: the same signal
 * set produces the same predicate, reasons, counts and priority, and a cause
 * that clears (the overdue instance cancelled, the review written, the task
 * completed, the message read) removes the row from the result.
 */
import { describe, expect, it } from "vitest";

import {
  attentionCount,
  attentionPriority,
  attentionReasons,
  attentionSignalsFrom,
  buildTriageRows,
  needsAttention,
} from "@/lib/canvas/attention";
import {
  listWorkspaceAttentionTriage,
  type TriagePrismaLike,
} from "@/lib/dashboard/triage";

const NOW = new Date("2026-10-27T09:00:00Z");

describe("attentionSignalsFrom", () => {
  it("maps the roster client shape onto the shared signals", () => {
    expect(
      attentionSignalsFrom({
        checkInStatus: "overdue",
        checkIns: [{ status: "feedback sent" }],
        unreadCount: 2,
        clientTasks: [{ status: "open" }, { status: "overdue" }],
        trainingFlags: 1,
      }),
    ).toEqual({
      checkInOverdue: true,
      awaitingFeedbackCount: 0,
      unreadCount: 2,
      openTaskCount: 1,
      overdueTaskCount: 1,
      trainingFlags: 1,
    });
  });
});

describe("needsAttention derivation parity", () => {
  const quiet = {
    checkInOverdue: false,
    awaitingFeedbackCount: 0,
    unreadCount: 0,
    openTaskCount: 0,
    overdueTaskCount: 0,
    trainingFlags: 0,
  };

  it("is false on a clean client and true on each single cause", () => {
    expect(needsAttention(quiet)).toBe(false);
    expect(needsAttention({ ...quiet, checkInOverdue: true })).toBe(true);
    expect(needsAttention({ ...quiet, awaitingFeedbackCount: 1 })).toBe(true);
    expect(needsAttention({ ...quiet, unreadCount: 1 })).toBe(true);
    expect(needsAttention({ ...quiet, openTaskCount: 1 })).toBe(true);
    expect(needsAttention({ ...quiet, trainingFlags: 1 })).toBe(true);
  });

  it("reports the overdue check-in reason and counts a check-in cause once", () => {
    const signals = { ...quiet, checkInOverdue: true };
    expect(attentionReasons(signals)).toEqual(["check-in overdue"]);
    expect(attentionPriority(signals)).toBe(4);
    expect(attentionCount(signals)).toBe(1);
  });

  it("prefers awaiting feedback over the overdue label like the roster", () => {
    const signals = {
      ...quiet,
      checkInOverdue: true,
      awaitingFeedbackCount: 1,
    };
    expect(attentionReasons(signals)).toEqual([
      "check-in awaiting feedback",
    ]);
    expect(attentionPriority(signals)).toBe(5);
    expect(attentionCount(signals)).toBe(1);
  });

  it("lists every cause in roster order", () => {
    const signals = {
      checkInOverdue: true,
      awaitingFeedbackCount: 0,
      unreadCount: 2,
      openTaskCount: 1,
      overdueTaskCount: 3,
      trainingFlags: 1,
    };
    expect(attentionReasons(signals)).toEqual([
      "check-in overdue",
      "2 unread messages",
      "3 overdue tasks",
      "1 pending task",
      "1 training flag",
    ]);
    expect(attentionCount(signals)).toBe(1 + 2 + 1 + 3 + 1);
  });
});

describe("buildTriageRows", () => {
  const client = (
    clientId: string,
    name: string,
    signals: Parameters<typeof needsAttention>[0],
  ) => ({ clientId, name, ...signals });

  it("keeps only clients needing attention and orders by priority, count, name", () => {
    const rows = buildTriageRows([
      client("c-quiet", "Zed Quiet", {
        checkInOverdue: false,
        awaitingFeedbackCount: 0,
        unreadCount: 0,
        openTaskCount: 0,
        overdueTaskCount: 0,
        trainingFlags: 0,
      }),
      client("c-tasks", "Ann Tasks", {
        checkInOverdue: false,
        awaitingFeedbackCount: 0,
        unreadCount: 0,
        openTaskCount: 0,
        overdueTaskCount: 2,
        trainingFlags: 0,
      }),
      client("c-overdue", "Bob Overdue", {
        checkInOverdue: true,
        awaitingFeedbackCount: 0,
        unreadCount: 0,
        openTaskCount: 0,
        overdueTaskCount: 0,
        trainingFlags: 0,
      }),
    ]);
    expect(rows.map((row) => row.clientId)).toEqual([
      "c-overdue",
      "c-tasks",
    ]);
    expect(rows[0].reasons).toEqual(["check-in overdue"]);
  });

  it("returns no rows once every cause is cleared", () => {
    expect(
      buildTriageRows([
        client("c-clear", "Cleared Client", {
          checkInOverdue: false,
          awaitingFeedbackCount: 0,
          unreadCount: 0,
          openTaskCount: 0,
          overdueTaskCount: 0,
          trainingFlags: 0,
        }),
      ]),
    ).toEqual([]);
  });
});

function fakeDb(rows: {
  profiles?: unknown[];
  instances?: unknown[];
  tasks?: unknown[];
  messages?: unknown[];
}) {
  const state = {
    profiles: rows.profiles ?? [],
    instances: rows.instances ?? [],
    tasks: rows.tasks ?? [],
    messages: rows.messages ?? [],
  };
  const applyWhere = (items: unknown[], where: Record<string, unknown>) =>
    items.filter((item) => {
      const row = item as Record<string, unknown>;
      if ("clientProfileId" in where) {
        const wanted = where.clientProfileId as { in?: string[] };
        if (wanted?.in && !wanted.in.includes(row.clientProfileId as string))
          return false;
      }
      if ("archivedAt" in where && where.archivedAt === null && row.archivedAt)
        return false;
      if ("cancelledAt" in where && where.cancelledAt === null && row.cancelledAt)
        return false;
      if ("status" in where && row.status !== where.status) return false;
      if ("senderKind" in where && row.senderKind !== where.senderKind)
        return false;
      if ("userId" in where && row.userId !== where.userId) return false;
      if (
        "reads" in where &&
        (where.reads as { none?: { userId?: string } }).none
      ) {
        const reader = (where.reads as { none: { userId: string } }).none
          .userId;
        const reads = (row.reads as { userId: string }[] | undefined) ?? [];
        if (reads.some((read) => read.userId === reader)) return false;
      }
      if ("conversation" in where) {
        const convo = where.conversation as { clientProfileId?: { in?: string[] } };
        const inIds = convo.clientProfileId?.in;
        const convoRow = row.conversation as { clientProfileId?: string };
        if (inIds && !inIds.includes(convoRow?.clientProfileId ?? ""))
          return false;
      }
      return true;
    });
  return {
    clientProfile: {
      findMany: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(applyWhere(state.profiles, where)),
    },
    checkInInstance: {
      findMany: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(applyWhere(state.instances, where)),
    },
    clientTask: {
      findMany: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(applyWhere(state.tasks, where)),
    },
    message: {
      findMany: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(applyWhere(state.messages, where)),
    },
  } as unknown as TriagePrismaLike;
}

const viewer = { userId: "coach-user", email: "c@example.com", name: "Coach" };
const workspace = {
  workspaceId: "ws-1",
  memberId: "member-1",
  role: "coach" as const,
  scope: "workspace" as const,
};

describe("listWorkspaceAttentionTriage", () => {
  it("reports a client whose scheduled check-in is past due", async () => {
    const db = fakeDb({
      profiles: [{ id: "cp-1", name: "Emma Anders", archivedAt: null }],
      instances: [
        {
          clientProfileId: "cp-1",
          dueAt: new Date("2026-10-20T07:00:00Z"),
          cancelledAt: null,
          submissions: [],
        },
      ],
    });
    const result = await listWorkspaceAttentionTriage(viewer, workspace, {
      db,
      now: NOW,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      clientProfileId: "cp-1",
      name: "Emma Anders",
      reasons: ["check-in overdue"],
      priority: 4,
    });
  });

  it("drops the row once the overdue instance is gone", async () => {
    const db = fakeDb({
      profiles: [{ id: "cp-1", name: "Emma Anders", archivedAt: null }],
      instances: [
        {
          clientProfileId: "cp-1",
          dueAt: new Date("2026-10-20T07:00:00Z"),
          cancelledAt: new Date("2026-10-26T08:00:00Z"),
          submissions: [],
        },
      ],
    });
    const result = await listWorkspaceAttentionTriage(viewer, workspace, {
      db,
      now: NOW,
    });
    expect(result.items).toEqual([]);
  });

  it("drops the overdue row once the client has submitted", async () => {
    const db = fakeDb({
      profiles: [{ id: "cp-1", name: "Emma Anders", archivedAt: null }],
      instances: [
        {
          clientProfileId: "cp-1",
          dueAt: new Date("2026-10-20T07:00:00Z"),
          cancelledAt: null,
          submissions: [{ id: "sub-1", reviews: [{ id: "rev-1" }] }],
        },
      ],
    });
    const result = await listWorkspaceAttentionTriage(viewer, workspace, {
      db,
      now: NOW,
    });
    expect(result.items).toEqual([]);
  });

  it("flags an unreviewed submission as awaiting feedback", async () => {
    const db = fakeDb({
      profiles: [{ id: "cp-1", name: "Emma Anders", archivedAt: null }],
      instances: [
        {
          clientProfileId: "cp-1",
          dueAt: new Date("2026-10-20T07:00:00Z"),
          cancelledAt: null,
          submissions: [{ id: "sub-1", reviews: [] }],
        },
      ],
    });
    const result = await listWorkspaceAttentionTriage(viewer, workspace, {
      db,
      now: NOW,
    });
    expect(result.items[0].reasons).toEqual([
      "check-in awaiting feedback",
    ]);
  });

  it("joins tasks and unread messages into the same derivation", async () => {
    const db = fakeDb({
      profiles: [{ id: "cp-1", name: "Emma Anders", archivedAt: null }],
      tasks: [
        {
          clientProfileId: "cp-1",
          status: "OPEN",
          dueDate: new Date("2026-10-21T00:00:00Z"),
        },
        {
          clientProfileId: "cp-1",
          status: "OPEN",
          dueDate: new Date("2026-11-02T00:00:00Z"),
        },
        {
          clientProfileId: "cp-1",
          status: "COMPLETED",
          dueDate: new Date("2026-10-01T00:00:00Z"),
        },
      ],
      messages: [
        {
          senderKind: "CLIENT",
          conversation: { clientProfileId: "cp-1" },
          reads: [],
        },
        {
          senderKind: "CLIENT",
          conversation: { clientProfileId: "cp-1" },
          reads: [{ userId: "coach-user" }],
        },
      ],
    });
    const result = await listWorkspaceAttentionTriage(viewer, workspace, {
      db,
      now: NOW,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].reasons).toEqual([
      "1 unread message",
      "1 overdue task",
      "1 pending task",
    ]);
  });

  it("excludes archived clients and empty workspaces", async () => {
    const db = fakeDb({
      profiles: [
        { id: "cp-old", name: "Old Client", archivedAt: new Date() },
      ],
      instances: [
        {
          clientProfileId: "cp-old",
          dueAt: new Date("2026-10-20T07:00:00Z"),
          cancelledAt: null,
          submissions: [],
        },
      ],
    });
    const result = await listWorkspaceAttentionTriage(viewer, workspace, {
      db,
      now: NOW,
    });
    expect(result.items).toEqual([]);
  });
});
