/**
 * W2-T1 member preference service: the server preference model behind the
 * workspace settings surface. Rows are keyed (workspaceId, memberId, key) so
 * notification choices are per member and survive sessions; a partial update
 * always answers with the full list (R10). Runs against an in-memory
 * deps.db fake - same seam the messages/tasks tests use.
 */
import { describe, expect, it } from "vitest";

import {
  PREFERENCE_KEYS,
  listMemberPreferences,
  memberPreferenceEnabled,
  updateMemberPreferences,
} from "../../lib/workspace/member-preferences";

type PrefRow = {
  id: string;
  workspaceId: string;
  memberId: string;
  key: string;
  enabled: boolean;
};

function fakeDb() {
  const rows: PrefRow[] = [];
  let seq = 0;
  const match = (
    r: PrefRow,
    w: { workspaceId: string; memberId: string; key: string },
  ) =>
    r.workspaceId === w.workspaceId &&
    r.memberId === w.memberId &&
    r.key === w.key;
  const db = {
    memberPreference: {
      findMany: async (args: {
        where: { workspaceId: string; memberId: string };
      }) =>
        rows.filter(
          (r) =>
            r.workspaceId === args.where.workspaceId &&
            r.memberId === args.where.memberId,
        ),
      upsert: async (args: {
        where: {
          workspaceId_memberId_key: {
            workspaceId: string;
            memberId: string;
            key: string;
          };
        };
        create:
          | PrefRow
          | {
              workspaceId: string;
              memberId: string;
              key: string;
              enabled: boolean;
            };
        update: { enabled: boolean };
      }) => {
        const w = args.where.workspaceId_memberId_key;
        const found = rows.find((r) => match(r, w));
        if (found) {
          found.enabled = args.update.enabled;
          return { ...found };
        }
        const row: PrefRow = {
          id: `pref-${++seq}`,
          workspaceId: w.workspaceId,
          memberId: w.memberId,
          key: w.key,
          enabled: (args.create as PrefRow).enabled,
        };
        rows.push(row);
        return { ...row };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { db, rows };
}

describe("member preference service", () => {
  it("returns the full key list with defaults when no rows exist", async () => {
    const { db } = fakeDb();
    const list = await listMemberPreferences("ws-1", "mem-1", {
      db: db as never,
    });
    expect(list).toEqual(
      PREFERENCE_KEYS.map((key) => ({ key, enabled: true })),
    );
    expect(list.length).toBeGreaterThanOrEqual(3);
  });

  it("persists a partial update and returns the full list", async () => {
    const { db, rows } = fakeDb();
    const list = await updateMemberPreferences(
      "ws-1",
      "mem-1",
      [{ key: "email.messages", enabled: false }],
      { db: db as never },
    );
    expect(list).toEqual(
      PREFERENCE_KEYS.map((key) => ({
        key,
        enabled: key === "email.messages" ? false : true,
      })),
    );
    expect(rows).toHaveLength(1);

    // A second session reads the persisted value back.
    const reread = await listMemberPreferences("ws-1", "mem-1", {
      db: db as never,
    });
    expect(reread.find((i) => i.key === "email.messages")?.enabled).toBe(false);
  });

  it("scopes preferences to the member, not the workspace", async () => {
    const { db } = fakeDb();
    await updateMemberPreferences(
      "ws-1",
      "mem-1",
      [{ key: "attention.unread_messages", enabled: false }],
      { db: db as never },
    );
    const other = await listMemberPreferences("ws-1", "mem-2", {
      db: db as never,
    });
    expect(
      other.find((i) => i.key === "attention.unread_messages")?.enabled,
    ).toBe(true);
  });

  it("rejects unknown keys and non-boolean values", async () => {
    const { db } = fakeDb();
    await expect(
      updateMemberPreferences(
        "ws-1",
        "mem-1",
        [{ key: "nope", enabled: true }],
        { db: db as never },
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      updateMemberPreferences(
        "ws-1",
        "mem-1",
        [{ key: "email.messages", enabled: "yes" }],
        { db: db as never },
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("memberPreferenceEnabled answers the stored value or the default", async () => {
    const { db } = fakeDb();
    await expect(
      memberPreferenceEnabled("ws-1", "mem-1", "email.messages", {
        db: db as never,
      }),
    ).resolves.toBe(true);
    await updateMemberPreferences(
      "ws-1",
      "mem-1",
      [{ key: "email.messages", enabled: false }],
      { db: db as never },
    );
    await expect(
      memberPreferenceEnabled("ws-1", "mem-1", "email.messages", {
        db: db as never,
      }),
    ).resolves.toBe(false);
  });
});
