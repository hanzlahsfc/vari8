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
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";

import { ApiError, type ApiWorkspaceContext } from "@/lib/api/v1";
import { prisma } from "@/lib/db";
import type { PrismaLike } from "./access";

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
type WritePrisma =
  Pick<PrismaClient, "memberPreference"> | Prisma.TransactionClient;
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
  if (ops.length > 0) {
    // deps.db set means the caller owns the atomic boundary (e.g. settings
    // PATCH) - run the ops sequentially inside it; otherwise self-contain.
    if (deps.db) for (const op of ops) await op;
    else await prisma.$transaction(ops);
  }
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

/**
 * PR-M2 (D25) — workspace appearance/preferences and the member's sidebar
 * state. Authorization (membership, ACTIVE workspace, capability scope) is
 * resolved by the /api/v1 route helper; these functions trust that typed
 * context and perform the scoped read or write only.
 *
 * The wire shape speaks the canvas vocabulary (lowercase mode/font/density
 * ids from `frontend/src/lib/ethereal-appearance.tsx` and the coach
 * `preferences` object in `frontend/src/components/coach/model.ts`) so the
 * PR-W10 wiring maps one to one. Values are stored on the Prisma enums.
 *
 * Input is unvalidated `unknown` at the boundary and parsed with Zod inside
 * the service: a ZodError thrown here surfaces as 400 invalid_input through
 * the route helper, before any write.
 */

export const appearanceModeInput = z.enum(["light", "dark"]);
export const appearanceFontInput = z.enum([
  "sans",
  "serif",
  "condensed",
  "mono",
  "rounded",
]);
export const appearanceDensityInput = z.enum(["comfortable", "compact"]);

// The canvas normalizes to `#RRGGBB` uppercase before persisting
// (appearance-controls.tsx); the column CHECK requires ^#[0-9A-Fa-f]{6}$.
export const accentInput = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .transform((value) => value.toUpperCase());

// Defensive bound at the trust boundary; the canvas input has no maxlength.
const AVAILABILITY_MAX = 500;

export const workspacePreferencesPatchSchema = z.strictObject({
  mode: appearanceModeInput.optional(),
  accent: accentInput.optional(),
  font: appearanceFontInput.optional(),
  density: appearanceDensityInput.optional(),
  logoMediaId: z.string().min(1).max(64).nullable().optional(),
  availability: z.string().max(AVAILABILITY_MAX).optional(),
  notifications: z.boolean().optional(),
  priorityNotifications: z.boolean().optional(),
});
export type WorkspacePreferencesPatch = z.infer<
  typeof workspacePreferencesPatchSchema
>;

export const sidebarPatchSchema = z.strictObject({
  sidebarCollapsed: z.boolean(),
});

export type AppearanceModeWire = z.infer<typeof appearanceModeInput>;
export type AppearanceFontWire = z.infer<typeof appearanceFontInput>;
export type AppearanceDensityWire = z.infer<typeof appearanceDensityInput>;

export type WorkspacePreferences = {
  mode: AppearanceModeWire;
  accent: string;
  font: AppearanceFontWire;
  density: AppearanceDensityWire;
  logoMediaId: string | null;
  availability: string;
  notifications: boolean;
  priorityNotifications: boolean;
};

export type SidebarState = { sidebarCollapsed: boolean };

const MODE_FROM_DB = { LIGHT: "light", DARK: "dark" } as const;
const MODE_TO_DB = { light: "LIGHT", dark: "DARK" } as const;
const FONT_FROM_DB = {
  SANS: "sans",
  SERIF: "serif",
  CONDENSED: "condensed",
  MONO: "mono",
  ROUNDED: "rounded",
} as const;
const FONT_TO_DB = {
  sans: "SANS",
  serif: "SERIF",
  condensed: "CONDENSED",
  mono: "MONO",
  rounded: "ROUNDED",
} as const;
const DENSITY_FROM_DB = {
  COMFORTABLE: "comfortable",
  COMPACT: "compact",
} as const;
const DENSITY_TO_DB = {
  comfortable: "COMFORTABLE",
  compact: "COMPACT",
} as const;

const PREFERENCES_SELECT = {
  appearanceMode: true,
  appearanceAccent: true,
  appearanceFont: true,
  appearanceDensity: true,
  logoMediaId: true,
  availabilityText: true,
  notificationsEnabled: true,
  priorityNotificationsEnabled: true,
} as const;

type PreferencesRow = {
  appearanceMode: keyof typeof MODE_FROM_DB;
  appearanceAccent: string;
  appearanceFont: keyof typeof FONT_FROM_DB;
  appearanceDensity: keyof typeof DENSITY_FROM_DB;
  logoMediaId: string | null;
  availabilityText: string;
  notificationsEnabled: boolean;
  priorityNotificationsEnabled: boolean;
};

function toWire(row: PreferencesRow): WorkspacePreferences {
  return {
    mode: MODE_FROM_DB[row.appearanceMode],
    accent: row.appearanceAccent,
    font: FONT_FROM_DB[row.appearanceFont],
    density: DENSITY_FROM_DB[row.appearanceDensity],
    logoMediaId: row.logoMediaId,
    availability: row.availabilityText,
    notifications: row.notificationsEnabled,
    priorityNotifications: row.priorityNotificationsEnabled,
  };
}

/** Read the workspace's appearance and preference state (staff only — the
 * route gates on `appearance.write`; D15 denies clients). */
export async function getWorkspacePreferences(
  workspace: ApiWorkspaceContext,
  client: PrismaLike = prisma,
): Promise<WorkspacePreferences> {
  const row = await client.workspace.findUnique({
    where: { id: workspace.workspaceId },
    select: PREFERENCES_SELECT,
  });
  // A missing workspace row after the membership check is a data fault,
  // not a permission problem - 404, matching the client appearance read.
  if (!row) throw new ApiError(404, "not_found");
  return toWire(row);
}

/** Apply a partial preferences patch; only the keys present are written. */
export async function updateWorkspacePreferences(
  workspace: ApiWorkspaceContext,
  input: unknown,
  client: PrismaLike = prisma,
): Promise<WorkspacePreferences> {
  const patch = workspacePreferencesPatchSchema.parse(input);
  const data: Record<string, unknown> = {};
  if (patch.mode !== undefined) data.appearanceMode = MODE_TO_DB[patch.mode];
  if (patch.accent !== undefined) data.appearanceAccent = patch.accent;
  if (patch.font !== undefined) data.appearanceFont = FONT_TO_DB[patch.font];
  if (patch.density !== undefined)
    data.appearanceDensity = DENSITY_TO_DB[patch.density];
  if (patch.availability !== undefined)
    data.availabilityText = patch.availability;
  if (patch.notifications !== undefined)
    data.notificationsEnabled = patch.notifications;
  if (patch.priorityNotifications !== undefined)
    data.priorityNotificationsEnabled = patch.priorityNotifications;
  if (patch.logoMediaId !== undefined) {
    // Logo objects live behind the media port (D20); a non-null id must
    // reference a media object owned by this workspace — a foreign or
    // missing id is a 400, never a dangling or cross-tenant reference.
    if (patch.logoMediaId === null) {
      data.logoMediaId = null;
    } else {
      const media = await client.mediaObject.findFirst({
        where: { id: patch.logoMediaId, workspaceId: workspace.workspaceId },
        select: { id: true },
      });
      if (!media) throw new ApiError(400, "invalid_input");
      data.logoMediaId = patch.logoMediaId;
    }
  }
  const row = await client.workspace.update({
    where: { id: workspace.workspaceId },
    data,
    select: PREFERENCES_SELECT,
  });
  return toWire(row);
}

/** Read the caller's own sidebar collapsed flag on this workspace. */
export async function getSidebarState(
  workspace: ApiWorkspaceContext,
  client: PrismaLike = prisma,
): Promise<SidebarState> {
  const member = await client.workspaceMember.findUnique({
    where: { id: workspace.memberId },
    select: { sidebarCollapsed: true },
  });
  return { sidebarCollapsed: member?.sidebarCollapsed ?? false };
}

/** Write the caller's own sidebar collapsed flag (member-scoped, own.write). */
export async function updateSidebarState(
  workspace: ApiWorkspaceContext,
  input: unknown,
  client: PrismaLike = prisma,
): Promise<SidebarState> {
  const { sidebarCollapsed } = sidebarPatchSchema.parse(input);
  await client.workspaceMember.update({
    // memberId resolves to the caller's ACTIVE membership of THIS workspace
    // in the route helper — the flag can never land on a foreign member row.
    where: { id: workspace.memberId },
    data: { sidebarCollapsed },
  });
  return { sidebarCollapsed };
}
