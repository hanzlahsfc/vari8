/**
 * Card 05a client store seam: one Conversation per (workspaceId,
 * clientProfileId), text-only client sends, send idempotency through the
 * (conversationId, clientRequestId) unique index.
 *
 * There is no `messages` RBAC resource yet, so this service does not go
 * through `authorize()`: ownership is bound by resolving the caller's own
 * ClientProfile inside the workspace — the same binding
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
  "clientProfile" | "conversation" | "message" | "$transaction"
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
 * thread — the first send creates the row — so a missing conversation is
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
 * has a durable row returns that row instead of inserting a second copy —
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
