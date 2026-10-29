/**
 * W2-T1 (R9/R10): member preference service behind the workspace settings
 * surface and the notification delivery gate.
 *
 * Preferences are rows keyed (workspaceId, memberId, key): each member owns
 * their notification choices, they persist server-side across sessions, and
 * they never leak across workspaces. A partial-array update writes only the
 * keys it is given and always answers with the full list - the proven
 * minimal write pattern from the Gain settings surface.
 *
 * Authorization happens at the route layer (own.read / own.write); every
 * function here takes the caller's own workspaceId + memberId and can only
 * touch that member's rows by construction.
 */
import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";

/** Closed key set - an unknown key is invalid input, never a stored row. */
export const PREFERENCE_KEYS = [
  "attention.unread_messages",
  "attention.priority_messages",
  "email.messages",
] as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

const KEY_SET: ReadonlySet<string> = new Set(PREFERENCE_KEYS);

export function isPreferenceKey(value: unknown): value is PreferenceKey {
  return typeof value === "string" && KEY_SET.has(value);
}

export type PreferenceItem = { key: PreferenceKey; enabled: boolean };

export class PreferenceError extends Error {
  constructor(readonly code: "invalid_input") {
    super(code);
    this.name = "PreferenceError";
  }
}

type ReadPrisma = Pick<PrismaClient, "memberPreference">;
type WritePrisma = Pick<PrismaClient, "memberPreference" | "$transaction">;
export type PreferenceReadDeps = { db?: ReadPrisma };
export type PreferenceDeps = { db?: WritePrisma };

function defaultList(): PreferenceItem[] {
  return PREFERENCE_KEYS.map((key) => ({ key, enabled: true }));
}

/**
 * The full preference list for one member: every known key, stored rows
 * overriding the default (enabled).
 */
export async function listMemberPreferences(
  workspaceId: string,
  memberId: string,
  deps: PreferenceReadDeps = {},
): Promise<PreferenceItem[]> {
  const db = deps.db ?? prisma;
  const rows = await db.memberPreference.findMany({
    where: { workspaceId, memberId },
    select: { key: true, enabled: true },
  });
  const stored = new Map(
    rows
      .filter((r) => isPreferenceKey(r.key))
      .map((r) => [r.key as PreferenceKey, r.enabled]),
  );
  return defaultList().map((item) =>
    stored.has(item.key)
      ? { key: item.key, enabled: stored.get(item.key)! }
      : item,
  );
}

/**
 * Partial-array write: each entry upserts one (member, key) row, unknown
 * keys or non-boolean values are rejected before any write, and the
 * response is the full list afterwards.
 */
export async function updateMemberPreferences(
  workspaceId: string,
  memberId: string,
  updates: readonly { key: unknown; enabled: unknown }[],
  deps: PreferenceDeps = {},
): Promise<PreferenceItem[]> {
  const db = deps.db ?? prisma;
  for (const u of updates) {
    if (!isPreferenceKey(u.key) || typeof u.enabled !== "boolean")
      throw new PreferenceError("invalid_input");
  }
  const ops = (updates as { key: PreferenceKey; enabled: boolean }[]).map((u) =>
    db.memberPreference.upsert({
      where: {
        workspaceId_memberId_key: { workspaceId, memberId, key: u.key },
      },
      create: { workspaceId, memberId, key: u.key, enabled: u.enabled },
      update: { enabled: u.enabled },
      select: { key: true, enabled: true },
    }),
  );
  if (ops.length > 0) await db.$transaction(ops);
  return listMemberPreferences(workspaceId, memberId, deps);
}

/**
 * Send-time check (R10): delivery reads the stored row at send time, not a
 * value captured when the UI rendered. A missing row means the default.
 */
export async function memberPreferenceEnabled(
  workspaceId: string,
  memberId: string,
  key: PreferenceKey,
  deps: PreferenceReadDeps = {},
): Promise<boolean> {
  const db = deps.db ?? prisma;
  const rows = await db.memberPreference.findMany({
    where: { workspaceId, memberId, key },
    select: { enabled: true },
  });
  return rows.length === 0 ? true : rows[0].enabled;
}
