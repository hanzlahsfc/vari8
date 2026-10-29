/**
 * Card 05a messages service: own-thread binding (deny without a linked
 * client profile), empty thread when no conversation exists, CLIENT send
 * creation, and clientRequestId idempotent retry returning the durable row.
 * Runs against an in-memory deps.db fake - same seam the tasks tests use.
 */
import { describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { listOwnMessages, sendOwnMessage } from "../../lib/messages/service";

type Row = {
  id: string;
  workspaceId: string;
  conversationId: string;
  senderKind: "CLIENT" | "STAFF";
  senderUserId: string;
  body: string;
  clientRequestId: string;
  sentAt: Date;
};

function fakeDb() {
  const profiles = new Map<string, { id: string }>();
  const conversations = new Map<string, { id: string }>();
  const messages: Row[] = [];
  let seq = 0;
  const nextId = () => `row-${++seq}`;
  const pick = (row: Row) => ({
    id: row.id,
    body: row.body,
    senderKind: row.senderKind,
    clientRequestId: row.clientRequestId,
    sentAt: row.sentAt,
  });
  const db = {
    clientProfile: {
      findFirst: async (args: {
        where: { workspaceId: string; userId: string };
      }) =>
        profiles.get(`${args.where.workspaceId}:${args.where.userId}`) ?? null,
    },
    conversation: {
      findUnique: async (args: {
        where: {
          workspaceId_clientProfileId: {
            workspaceId: string;
            clientProfileId: string;
          };
        };
      }) =>
        conversations.get(
          `${args.where.workspaceId_clientProfileId.workspaceId}:${args.where.workspaceId_clientProfileId.clientProfileId}`,
        ) ?? null,
      upsert: async (args: {
        where: {
          workspaceId_clientProfileId: {
            workspaceId: string;
            clientProfileId: string;
          };
        };
        create: { workspaceId: string; clientProfileId: string };
      }) => {
        const key = `${args.where.workspaceId_clientProfileId.workspaceId}:${args.where.workspaceId_clientProfileId.clientProfileId}`;
        const found = conversations.get(key);
        if (found) return found;
        const created = { id: nextId() };
        conversations.set(key, created);
        return created;
      },
      update: async () => ({}),
    },
    message: {
      findUnique: async (args: {
        where: {
          conversationId_clientRequestId: {
            conversationId: string;
            clientRequestId: string;
          };
        };
      }) =>
        messages.find(
          (row) =>
            row.conversationId ===
              args.where.conversationId_clientRequestId.conversationId &&
            row.clientRequestId ===
              args.where.conversationId_clientRequestId.clientRequestId,
        ) ?? null,
      findMany: async (args: { where: { conversationId: string } }) =>
        messages
          .filter((row) => row.conversationId === args.where.conversationId)
          .map(pick),
      create: async (args: {
        data: Omit<Row, "id" | "sentAt"> & { sentAt?: Date };
      }) => {
        const row: Row = {
          id: nextId(),
          sentAt: new Date("2026-10-26T12:00:00Z"),
          ...args.data,
        };
        messages.push(row);
        return row;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db, profiles, messages };
}

const client = { user: { id: "user-1" } };
const staff = { user: { id: "user-2" } };

describe("listOwnMessages", () => {
  it("denies a caller with no linked client profile in the workspace", async () => {
    const { db, profiles } = fakeDb();
    profiles.set("ws-1:user-1", { id: "cp-1" });
    await expect(
      listOwnMessages(staff, { workspaceId: "ws-1" }, { db: db as never }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("returns an empty thread when the client has no conversation yet", async () => {
    const { db, profiles } = fakeDb();
    profiles.set("ws-1:user-1", { id: "cp-1" });
    await expect(
      listOwnMessages(client, { workspaceId: "ws-1" }, { db: db as never }),
    ).resolves.toEqual({ messages: [] });
  });
});

describe("sendOwnMessage", () => {
  it("rejects empty and oversized bodies as invalid_input", async () => {
    const { db, profiles } = fakeDb();
    profiles.set("ws-1:user-1", { id: "cp-1" });
    for (const body of ["", "   ", "x".repeat(4001)]) {
      await expect(
        sendOwnMessage(
          client,
          { workspaceId: "ws-1", body },
          { db: db as never },
        ),
      ).rejects.toMatchObject({ code: "invalid_input" });
    }
  });

  it("creates the conversation on first send and stamps CLIENT kind", async () => {
    const { db, profiles, messages } = fakeDb();
    profiles.set("ws-1:user-1", { id: "cp-1" });
    const result = await sendOwnMessage(
      client,
      { workspaceId: "ws-1", body: "  coach, quick question  " },
      { db: db as never },
    );
    expect(result.message.senderKind).toBe("CLIENT");
    expect(result.message.body).toBe("coach, quick question");
    expect(messages).toHaveLength(1);
    const listed = await listOwnMessages(
      client,
      { workspaceId: "ws-1" },
      { db: db as never },
    );
    expect(listed.messages).toHaveLength(1);
    expect(listed.messages[0].id).toBe(result.message.id);
  });

  it("a retry with the same clientRequestId returns the durable row, not a duplicate", async () => {
    const { db, profiles, messages } = fakeDb();
    profiles.set("ws-1:user-1", { id: "cp-1" });
    const first = await sendOwnMessage(
      client,
      { workspaceId: "ws-1", body: "hello", clientRequestId: "req-9" },
      { db: db as never },
    );
    const retry = await sendOwnMessage(
      client,
      { workspaceId: "ws-1", body: "hello", clientRequestId: "req-9" },
      { db: db as never },
    );
    expect(retry.message.id).toBe(first.message.id);
    expect(messages).toHaveLength(1);
  });

  it("notifies staff only when a new message row commits, not on idempotent replay", async () => {
    const { db, profiles } = fakeDb();
    profiles.set("ws-1:user-1", { id: "cp-1" });
    const calls: { workspaceId: string; clientProfileId: string }[] = [];
    const deps = {
      db: db as never,
      notifyClientMessage: async (input: {
        workspaceId: string;
        clientProfileId: string;
      }) => {
        calls.push(input);
      },
    };
    await sendOwnMessage(
      client,
      { workspaceId: "ws-1", body: "ping", clientRequestId: "req-10" },
      deps,
    );
    expect(calls).toEqual([{ workspaceId: "ws-1", clientProfileId: "cp-1" }]);
    await sendOwnMessage(
      client,
      { workspaceId: "ws-1", body: "ping", clientRequestId: "req-10" },
      deps,
    );
    expect(calls).toHaveLength(1);
  });
});
