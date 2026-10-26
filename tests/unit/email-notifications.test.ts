/**
 * W2-T1 (R10): notification delivery honours the member preference at send
 * time. The gate is the stored row, not a value captured when the UI
 * rendered: a member who toggled "email.messages" off is skipped, a member
 * who left it on (or never touched it) is delivered. Mail adapter failures
 * are contained per recipient - one bad delivery never drops another
 * member's notification and never fails the producer call.
 */
import { describe, expect, it } from "vitest";

import {
  notifyStaffOfClientMessage,
  sendMemberNotificationMail,
} from "../../lib/email";

type PrefRow = {
  workspaceId: string;
  memberId: string;
  key: string;
  enabled: boolean;
};

function fakeDb(opts: {
  members: {
    id: string;
    workspaceId: string;
    role: string;
    status: string;
    user: { email: string; status: string };
  }[];
  prefs?: PrefRow[];
  workspaceName?: string;
  clientName?: string;
}) {
  const prefs = opts.prefs ?? [];
  return {
    memberPreference: {
      findMany: async (args: {
        where: { workspaceId: string; memberId: string; key?: string };
      }) =>
        prefs.filter(
          (p) =>
            p.workspaceId === args.where.workspaceId &&
            p.memberId === args.where.memberId &&
            (args.where.key === undefined || p.key === args.where.key),
        ),
    },
    workspaceMember: {
      findMany: async (args: {
        where: { workspaceId: string; status: string; role: { in: string[] } };
      }) =>
        opts.members.filter(
          (m) =>
            m.workspaceId === args.where.workspaceId &&
            m.status === args.where.status &&
            args.where.role.in.includes(m.role),
        ),
    },
    workspace: {
      findUnique: async (args: { where: { id: string } }) =>
        args.where.id === "ws-1"
          ? { name: opts.workspaceName ?? "Studio" }
          : null,
    },
    clientProfile: {
      findFirst: async (args: {
        where: { id: string; workspaceId: string };
      }) => ({
        id: args.where.id,
        name: opts.clientName ?? "Client One",
      }),
    },
  };
}

const STAFF = [
  {
    id: "mem-owner",
    workspaceId: "ws-1",
    role: "WORKSPACE_OWNER",
    status: "ACTIVE",
    user: { email: "owner@example.test", status: "ACTIVE" },
  },
  {
    id: "mem-coach",
    workspaceId: "ws-1",
    role: "COACH",
    status: "ACTIVE",
    user: { email: "coach@example.test", status: "ACTIVE" },
  },
];

describe("sendMemberNotificationMail", () => {
  it("sends when the member has no stored row (default enabled)", async () => {
    const sent: unknown[] = [];
    const db = fakeDb({ members: STAFF });
    const result = await sendMemberNotificationMail(
      {
        workspaceId: "ws-1",
        memberId: "mem-owner",
        key: "email.messages",
        message: { to: "owner@example.test", subject: "s", text: "t" },
      },
      { db: db as never, send: async (m) => void sent.push(m) },
    );
    expect(result).toBe("sent");
    expect(sent).toHaveLength(1);
  });

  it("skips when the member disabled the notification type", async () => {
    const sent: unknown[] = [];
    const db = fakeDb({
      members: STAFF,
      prefs: [
        {
          workspaceId: "ws-1",
          memberId: "mem-owner",
          key: "email.messages",
          enabled: false,
        },
      ],
    });
    const result = await sendMemberNotificationMail(
      {
        workspaceId: "ws-1",
        memberId: "mem-owner",
        key: "email.messages",
        message: { to: "owner@example.test", subject: "s", text: "t" },
      },
      { db: db as never, send: async (m) => void sent.push(m) },
    );
    expect(result).toBe("skipped");
    expect(sent).toHaveLength(0);
  });
});

describe("notifyStaffOfClientMessage", () => {
  it("delivers to enabled staff and honours a disabled member", async () => {
    const sent: { to: string }[] = [];
    const db = fakeDb({
      members: STAFF,
      prefs: [
        {
          workspaceId: "ws-1",
          memberId: "mem-coach",
          key: "email.messages",
          enabled: false,
        },
      ],
      workspaceName: "Prime Studio",
      clientName: "Amara",
    });
    const delivered = await notifyStaffOfClientMessage(
      { workspaceId: "ws-1", clientProfileId: "cp-1" },
      { db: db as never, send: async (m) => void sent.push(m) },
    );
    expect(delivered).toBe(1);
    expect(sent.map((m) => m.to)).toEqual(["owner@example.test"]);
  });

  it("never notifies staff of another workspace", async () => {
    const sent: { to: string }[] = [];
    const db = fakeDb({
      members: [
        ...STAFF,
        {
          id: "mem-foreign",
          workspaceId: "ws-2",
          role: "WORKSPACE_OWNER",
          status: "ACTIVE",
          user: { email: "foreign@example.test", status: "ACTIVE" },
        },
      ],
    });
    await notifyStaffOfClientMessage(
      { workspaceId: "ws-1", clientProfileId: "cp-1" },
      { db: db as never, send: async (m) => void sent.push(m) },
    );
    expect(sent.map((m) => m.to)).not.toContain("foreign@example.test");
    expect(sent).toHaveLength(2);
  });

  it("contains a per-recipient send failure", async () => {
    const sent: { to: string }[] = [];
    const db = fakeDb({ members: STAFF });
    let first = true;
    const delivered = await notifyStaffOfClientMessage(
      { workspaceId: "ws-1", clientProfileId: "cp-1" },
      {
        db: db as never,
        send: async (m) => {
          if (first) {
            first = false;
            throw new Error("adapter down");
          }
          sent.push(m);
        },
      },
    );
    expect(delivered).toBe(1);
    expect(sent).toHaveLength(1);
  });
});
