/**
 * Card 05a client store seam: one Conversation per (workspaceId,
 * clientProfileId), text-only client sends, send idempotency through the
 * (conversationId, clientRequestId) unique index.
 *
 * There is no `messages` RBAC resource yet, so this service does not go
 * through `authorize()`: ownership is bound by resolving the caller's own
 * ClientProfile inside the workspace: the same binding
 * `listOwnClientTasks` applies before its own-scope re-authorization. The
 * route layer's capability check (own.read / message.write) supplies the
 * role scope; a caller without a linked client profile is denied here.
 */
import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { AccessDeniedError } from "../auth/guard";
import { notifyStaffOfClientMessage } from "../email";

export class MessageError extends Error {
  constructor(
    public code: "invalid_input" | "not_available",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "MessageError";
  }
}

type SessionLike = { user?: { id?: string } } | null | undefined;

type PrismaLike = Pick<
  PrismaClient,
  | "clientProfile"
  | "conversation"
  | "message"
  | "messageDraft"
  | "messageRead"
  | "workspaceMember"
  | "$transaction"
>;

export type MessageDeps = {
  db?: PrismaLike;
  /**
   * W2-T1: notification fan-out after a NEW client message commits. The
   * default honours each staff member's `email.messages` preference at send
   * time; tests inject a spy. Failures inside the notifier never roll the
   * message back (it runs after the transaction commits).
   */
  notifyClientMessage?: (input: {
    workspaceId: string;
    clientProfileId: string;
  }) => Promise<unknown>;
};

export type MessageView = {
  id: string;
  body: string;
  senderKind: "CLIENT" | "STAFF";
  sentAt: string;
  clientRequestId: string;
};

const MAX_BODY = 4000;
const MAX_ID = 128;

function normalizeBody(raw: unknown): string {
  if (typeof raw !== "string") throw new MessageError("invalid_input");
  const body = raw.trim();
  if (body.length === 0 || body.length > MAX_BODY)
    throw new MessageError("invalid_input");
  return body;
}

function normalizeRequestId(raw: unknown): string {
  if (raw === undefined) return randomUUID();
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.length > MAX_ID ||
    !/^[A-Za-z0-9_-]+$/.test(raw)
  )
    throw new MessageError("invalid_input");
  return raw;
}

function userIdOf(session: SessionLike): string {
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", "messages", "read");
  return userId;
}

async function ownProfile(
  db: PrismaLike,
  workspaceId: string,
  userId: string,
  action: "read" | "write",
): Promise<{ id: string }> {
  if (
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    workspaceId.length > MAX_ID
  )
    throw new MessageError("invalid_input");
  const profile = await db.clientProfile.findFirst({
    where: { workspaceId, userId },
    select: { id: true },
  });
  if (!profile) throw new AccessDeniedError("not_owner", "messages", action);
  return profile;
}

type MessageRow = {
  id: string;
  body: string;
  senderKind: "CLIENT" | "STAFF";
  clientRequestId: string;
  sentAt: Date;
};

function toView(row: MessageRow): MessageView {
  return {
    id: row.id,
    body: row.body,
    senderKind: row.senderKind,
    sentAt: row.sentAt.toISOString(),
    clientRequestId: row.clientRequestId,
  };
}

/**
 * The caller's own thread. A client with no conversation yet reads an empty
 * thread. The first send creates the row, so a missing conversation is
 * `[]`, never an error. A caller with no linked client profile is denied.
 */
export async function listOwnMessages(
  session: SessionLike,
  input: { workspaceId: string },
  deps: MessageDeps = {},
): Promise<{ messages: MessageView[] }> {
  const db = deps.db ?? prisma;
  const userId = userIdOf(session);
  const profile = await ownProfile(db, input.workspaceId, userId, "read");
  const conversation = await db.conversation.findUnique({
    where: {
      workspaceId_clientProfileId: {
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
      },
    },
    select: { id: true },
  });
  if (!conversation) return { messages: [] };
  const rows = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: [{ sentAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      body: true,
      senderKind: true,
      clientRequestId: true,
      sentAt: true,
    },
  });
  return { messages: rows.map(toView) };
}

/**
 * Client-authored send. Idempotent: a supplied clientRequestId that already
 * has a durable row returns that row instead of inserting a second copy:
 * the retry the unique index exists for.
 */
export async function sendOwnMessage(
  session: SessionLike,
  input: { workspaceId: string; body: unknown; clientRequestId?: unknown },
  deps: MessageDeps = {},
): Promise<{ message: MessageView }> {
  const db = deps.db ?? prisma;
  const userId = userIdOf(session);
  const body = normalizeBody(input.body);
  const clientRequestId = normalizeRequestId(input.clientRequestId);
  const profile = await ownProfile(db, input.workspaceId, userId, "write");

  const result = await db.$transaction(async (tx) => {
    const conversation = await tx.conversation.upsert({
      where: {
        workspaceId_clientProfileId: {
          workspaceId: input.workspaceId,
          clientProfileId: profile.id,
        },
      },
      update: {},
      create: {
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
      },
      select: { id: true },
    });
    const existing = await tx.message.findUnique({
      where: {
        conversationId_clientRequestId: {
          conversationId: conversation.id,
          clientRequestId,
        },
      },
      select: {
        id: true,
        body: true,
        senderKind: true,
        clientRequestId: true,
        sentAt: true,
      },
    });
    if (existing) return { message: toView(existing), created: false };
    const row = await tx.message.create({
      data: {
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        senderKind: "CLIENT",
        senderUserId: userId,
        body,
        clientRequestId,
      },
      select: {
        id: true,
        body: true,
        senderKind: true,
        clientRequestId: true,
        sentAt: true,
      },
    });
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: row.sentAt },
    });
    return { message: toView(row), created: true };
  });

  // Notification fan-out runs after the commit boundary: a mail outage must
  // not roll a delivered message back, and the notifier itself contains
  // per-recipient failures.
  if (result.created) {
    const notify = deps.notifyClientMessage ?? notifyStaffOfClientMessage;
    try {
      await notify({
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
      });
    } catch {
      // Delivery failure is already logged inside the notifier; the send
      // result stands.
    }
  }
  return { message: result.message };
}

/* -------------------------------------------------------------------------
 * W2-A4 staff surface. The coach message center reads and writes the same
 * Conversation/Message/Draft/Read models the client thread uses. There is
 * still no messages RBAC resource, so staff binding mirrors ownProfile: the
 * caller must hold an ACTIVE workspace membership in a staff role
 * (WORKSPACE_OWNER or COACH). The route capability check supplies the
 * workspace scope; a client caller whose message.write scope is "own" is
 * rejected here.
 * ---------------------------------------------------------------------- */

const STAFF_ROLES = ["WORKSPACE_OWNER", "COACH"] as const;
const PREVIEW_LEN = 140;

async function staffMember(
  db: PrismaLike,
  workspaceId: string,
  userId: string,
  action: "read" | "write",
): Promise<{ id: string }> {
  if (
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    workspaceId.length > MAX_ID
  )
    throw new MessageError("invalid_input");
  const member = await db.workspaceMember.findFirst({
    where: {
      workspaceId,
      userId,
      status: "ACTIVE",
      role: { in: [...STAFF_ROLES] },
    },
    select: { id: true },
  });
  if (!member) throw new AccessDeniedError("role_denied", "messages", action);
  return member;
}

/** The client profile must live in this workspace; never leak across. */
async function staffClientProfile(
  db: PrismaLike,
  workspaceId: string,
  clientProfileId: string,
): Promise<{ id: string; userId: string | null }> {
  if (
    typeof clientProfileId !== "string" ||
    clientProfileId.length === 0 ||
    clientProfileId.length > MAX_ID
  )
    throw new MessageError("invalid_input");
  const profile = await db.clientProfile.findFirst({
    where: { id: clientProfileId, workspaceId },
    select: { id: true, userId: true },
  });
  if (!profile) throw new MessageError("not_available");
  return profile;
}

export type StaffConversationView = {
  clientProfileId: string;
  clientName: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  hasPriority: boolean;
};

export type StaffMessageView = MessageView & {
  /** CLIENT rows: read by the calling staff member. STAFF rows: read by the
   *  client. Mirrors the canvas Message.read flag. */
  read: boolean;
  priority: boolean;
  links: unknown;
};

type StaffMessageRow = MessageRow & {
  priority: boolean;
  links: unknown;
  senderKind: "CLIENT" | "STAFF";
};

function toStaffView(
  row: StaffMessageRow,
  readIds: ReadonlySet<string>,
): StaffMessageView {
  return {
    ...toView(row),
    read: readIds.has(row.id),
    priority: row.priority,
    links: row.links ?? null,
  };
}

/** Staff conversation list with per-thread unread counts for the caller. */
export async function listStaffConversations(
  session: SessionLike,
  input: { workspaceId: string },
  deps: MessageDeps = {},
): Promise<{ conversations: StaffConversationView[] }> {
  const db = deps.db ?? prisma;
  const userId = userIdOf(session);
  await staffMember(db, input.workspaceId, userId, "read");
  const conversations = await db.conversation.findMany({
    where: { workspaceId: input.workspaceId },
    select: {
      id: true,
      clientProfileId: true,
      lastMessageAt: true,
      clientProfile: { select: { name: true } },
      messages: {
        orderBy: [{ sentAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { body: true },
      },
    },
  });
  const views = await Promise.all(
    conversations.map(async (conv): Promise<StaffConversationView> => {
      const [unreadCount, priority] = await Promise.all([
        db.message.count({
          where: {
            conversationId: conv.id,
            senderKind: "CLIENT",
            reads: { none: { userId } },
          },
        }),
        db.message.findFirst({
          where: { conversationId: conv.id, priority: true },
          select: { id: true },
        }),
      ]);
      const last = conv.messages[0];
      return {
        clientProfileId: conv.clientProfileId,
        clientName: conv.clientProfile.name,
        lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
        lastMessagePreview: last ? last.body.slice(0, PREVIEW_LEN) : null,
        unreadCount,
        hasPriority: Boolean(priority),
      };
    }),
  );
  views.sort((a, b) => {
    const at = a.lastMessageAt ?? "";
    const bt = b.lastMessageAt ?? "";
    if (at !== bt) return bt.localeCompare(at);
    return a.clientName.localeCompare(b.clientName);
  });
  return { conversations: views };
}

async function staffThreadReads(
  db: Pick<PrismaClient, "messageRead">,
  rows: { id: string; senderKind: "CLIENT" | "STAFF" }[],
  staffUserId: string,
  clientUserId: string | null,
): Promise<ReadonlySet<string>> {
  const want = rows
    .filter((r) => (r.senderKind === "CLIENT" ? true : clientUserId !== null))
    .map((r) => r.id);
  if (want.length === 0) return new Set();
  const reads = await db.messageRead.findMany({
    where: {
      messageId: { in: want },
      userId: clientUserId ? { in: [staffUserId, clientUserId] } : staffUserId,
    },
    select: { messageId: true, userId: true },
  });
  const byClient = new Set(
    reads.filter((r) => r.userId === clientUserId).map((r) => r.messageId),
  );
  const byStaff = new Set(
    reads.filter((r) => r.userId === staffUserId).map((r) => r.messageId),
  );
  const map = new Map(rows.map((r) => [r.id, r.senderKind]));
  const out = new Set<string>();
  for (const r of reads) {
    const kind = map.get(r.messageId);
    if (kind === "CLIENT" && byStaff.has(r.messageId)) out.add(r.messageId);
    if (kind === "STAFF" && byClient.has(r.messageId)) out.add(r.messageId);
  }
  return out;
}

/** Staff thread read: messages plus the caller's saved draft. */
export async function getStaffThread(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  deps: MessageDeps = {},
): Promise<{
  clientProfileId: string;
  messages: StaffMessageView[];
  draft: { body: string; revision: number } | null;
}> {
  const db = deps.db ?? prisma;
  const userId = userIdOf(session);
  await staffMember(db, input.workspaceId, userId, "read");
  const profile = await staffClientProfile(
    db,
    input.workspaceId,
    input.clientProfileId,
  );
  const conversation = await db.conversation.findUnique({
    where: {
      workspaceId_clientProfileId: {
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
      },
    },
    select: { id: true },
  });
  if (!conversation)
    return { clientProfileId: profile.id, messages: [], draft: null };
  const [rows, draft] = await Promise.all([
    db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: [{ sentAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        body: true,
        senderKind: true,
        clientRequestId: true,
        sentAt: true,
        priority: true,
        links: true,
      },
    }),
    db.messageDraft.findUnique({
      where: {
        conversationId_authorUserId: {
          conversationId: conversation.id,
          authorUserId: userId,
        },
      },
      select: { body: true, revision: true },
    }),
  ]);
  const readIds = await staffThreadReads(db, rows, userId, profile.userId);
  return {
    clientProfileId: profile.id,
    messages: rows.map((r) => toStaffView(r, readIds)),
    draft: draft ? { body: draft.body, revision: draft.revision } : null,
  };
}

/** Staff-authored send into a client's thread. */
export async function sendStaffMessage(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    body: unknown;
    clientRequestId?: unknown;
  },
  deps: MessageDeps = {},
): Promise<{ message: StaffMessageView }> {
  const db = deps.db ?? prisma;
  const userId = userIdOf(session);
  const body = normalizeBody(input.body);
  const clientRequestId = normalizeRequestId(input.clientRequestId);
  await staffMember(db, input.workspaceId, userId, "write");
  const profile = await staffClientProfile(
    db,
    input.workspaceId,
    input.clientProfileId,
  );

  return db.$transaction(async (tx) => {
    const conversation = await tx.conversation.upsert({
      where: {
        workspaceId_clientProfileId: {
          workspaceId: input.workspaceId,
          clientProfileId: profile.id,
        },
      },
      update: {},
      create: {
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
      },
      select: { id: true },
    });
    const existing = await tx.message.findUnique({
      where: {
        conversationId_clientRequestId: {
          conversationId: conversation.id,
          clientRequestId,
        },
      },
      select: {
        id: true,
        body: true,
        senderKind: true,
        clientRequestId: true,
        sentAt: true,
        priority: true,
        links: true,
      },
    });
    if (existing) {
      const readIds = await staffThreadReads(
        tx,
        [existing],
        userId,
        profile.userId,
      );
      return { message: toStaffView(existing, readIds) };
    }
    const row = await tx.message.create({
      data: {
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        senderKind: "STAFF",
        senderUserId: userId,
        body,
        clientRequestId,
      },
      select: {
        id: true,
        body: true,
        senderKind: true,
        clientRequestId: true,
        sentAt: true,
        priority: true,
        links: true,
      },
    });
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: row.sentAt },
    });
    return { message: toStaffView(row, new Set()) };
  });
}

/** Idempotent staff mark-read on a client thread. */
export async function markStaffThreadRead(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  deps: MessageDeps = {},
): Promise<{ marked: number }> {
  const db = deps.db ?? prisma;
  const userId = userIdOf(session);
  await staffMember(db, input.workspaceId, userId, "write");
  const profile = await staffClientProfile(
    db,
    input.workspaceId,
    input.clientProfileId,
  );
  const conversation = await db.conversation.findUnique({
    where: {
      workspaceId_clientProfileId: {
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
      },
    },
    select: { id: true },
  });
  if (!conversation) return { marked: 0 };
  const unread = await db.message.findMany({
    where: {
      conversationId: conversation.id,
      senderKind: "CLIENT",
      reads: { none: { userId } },
    },
    select: { id: true },
  });
  if (unread.length === 0) return { marked: 0 };
  const result = await db.messageRead.createMany({
    data: unread.map((m) => ({
      messageId: m.id,
      userId,
      readAt: new Date(),
    })),
    skipDuplicates: true,
  });
  return { marked: result.count };
}

/** Staff draft save: one row per author per conversation. */
export async function saveStaffDraft(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string; body: unknown },
  deps: MessageDeps = {},
): Promise<{ draft: { body: string; revision: number } }> {
  const db = deps.db ?? prisma;
  const userId = userIdOf(session);
  if (typeof input.body !== "string" || input.body.length > MAX_BODY)
    throw new MessageError("invalid_input");
  await staffMember(db, input.workspaceId, userId, "write");
  const profile = await staffClientProfile(
    db,
    input.workspaceId,
    input.clientProfileId,
  );
  const conversation = await db.conversation.findUnique({
    where: {
      workspaceId_clientProfileId: {
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
      },
    },
    select: { id: true },
  });
  if (!conversation) throw new MessageError("not_available");
  const draft = await db.messageDraft.upsert({
    where: {
      conversationId_authorUserId: {
        conversationId: conversation.id,
        authorUserId: userId,
      },
    },
    update: { body: input.body, revision: { increment: 1 } },
    create: {
      workspaceId: input.workspaceId,
      conversationId: conversation.id,
      authorUserId: userId,
      body: input.body,
    },
    select: { body: true, revision: true },
  });
  return { draft };
}
