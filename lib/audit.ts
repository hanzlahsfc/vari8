import { Prisma, PrismaClient, type MemberRole } from "@prisma/client";

import { prisma } from "./db";
import {
  AccessDeniedError,
  authorizeCollection,
  type AuthorizationContext,
  type SessionLike,
} from "./auth/guard";
import type { ConsentKind } from "./consent";
import {
  createPrismaAuthorizationRepo,
  type PrismaLike,
} from "./workspace/access";
import { normalizeLimit } from "./workspace/clients";

/**
 * S1-E metadata-only audit logging.
 *
 * Audit events describe committed mutations of the consent and client-assignment
 * services. `writeAuditEvent` accepts a transaction client ONLY — it cannot run
 * outside the mutation transaction and it never swallows errors, so a failed
 * audit write rolls the business mutation back with it (no audit ⇒ no mutation).
 *
 * Metadata is constrained by a closed allowlist (`AuditMeta`) re-enforced at
 * runtime. Health values, free text, names, credentials, tokens, secrets, request
 * bodies, or arbitrary blobs can never be written. `actorUserId`/`actorRole`/
 * `workspaceId` come from the revalidated authorization context, never from
 * caller-supplied fields.
 *
 * Events are written only for `changed: true` mutations with `result: ALLOW`;
 * denied or failed attempts write nothing (denied-attempt auditing is deferred —
 * see docs/tasks/s1-e-audit.md). No route/action exposes audit or the audited
 * mutations; `assert*ExternallyExposable` still fails closed.
 */

export type AuditErrorCode =
  | "invalid_input"
  | "audit_metadata_forbidden"
  | "audit_write_failed"
  | "audit_not_wired_for_external_use";

export class AuditError extends Error {
  constructor(readonly code: AuditErrorCode) {
    super(code);
    this.name = "AuditError";
  }
}

export const AUDIT_ACTIONS = [
  "READ",
  "CREATE",
  "UPDATE",
  "DELETE",
  "EXPORT",
  "GRANT",
  "REVOKE",
  "INVITE",
  "ASSIGN",
  "DENY",
  "LOGIN",
  "PASSWORD_RESET",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Resource types audit events may reference (closed set for this slice). */
export const AUDIT_RESOURCE_TYPES = [
  "consent",
  "client_assignment",
  "access_token",
  "user",
] as const;
export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[number];

/** S1-F2B: actions permitted on ACCOUNT-scoped rows (closed set). */
export const ACCOUNT_AUDIT_ACTIONS = ["PASSWORD_RESET"] as const;
/** S1-F2B: resource types permitted on ACCOUNT-scoped rows (closed set). */
export const ACCOUNT_AUDIT_RESOURCES = ["user", "access_token"] as const;

export type AuditMeta = {
  kind?: ConsentKind;
  version?: string;
  changed?: boolean;
  count?: number;
  role?: "PRIMARY" | "COACH";
  status?: "ACTIVE" | "REMOVED";
};

export type AuditEventInput = {
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string | null;
  subjectClientProfileId?: string | null;
  meta?: AuditMeta;
};

const FORBIDDEN_VALUE_SHAPES = [
  /@/, // email-shaped
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, // JWT-shaped
  /^bearer\s/i,
  /^[0-9a-f]{32,}$/i, // hex-token-shaped
];

/** Short flat structural string: no whitespace/email/token/blob shapes. */
function isStructuralString(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64)
    return false;
  return !FORBIDDEN_VALUE_SHAPES.some((shape) => shape.test(value));
}

// Map, not a plain object: `get` is intrinsically own-key only, so
// `Object.prototype` members (constructor, toString, hasOwnProperty, …) can
// never resolve as validators.
const META_VALIDATORS = new Map<keyof AuditMeta, (v: unknown) => boolean>([
  ["kind", isStructuralString],
  ["version", isStructuralString],
  ["changed", (v) => typeof v === "boolean"],
  [
    "count",
    (v) =>
      typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1_000_000,
  ],
  ["role", (v) => v === "PRIMARY" || v === "COACH"],
  ["status", (v) => v === "ACTIVE" || v === "REMOVED"],
]);

/**
 * Fail-closed metadata allowlist. Unknown keys — including `Object.prototype`
 * member names supplied as own keys — forbidden value shapes, nested objects,
 * and non-plain inputs all throw `audit_metadata_forbidden`. Any exception
 * raised while enumerating or validating (e.g. a throwing getter) is normalized
 * to the same structural error; no raw `TypeError` escapes.
 */
export function sanitizeAuditMeta(meta?: AuditMeta): AuditMeta | undefined {
  if (meta === undefined) return undefined;
  if (meta === null || typeof meta !== "object" || Array.isArray(meta))
    throw new AuditError("audit_metadata_forbidden");
  const proto = Object.getPrototypeOf(meta);
  if (proto !== Object.prototype && proto !== null)
    throw new AuditError("audit_metadata_forbidden");
  try {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      const validator = META_VALIDATORS.get(key as keyof AuditMeta);
      if (validator === undefined || validator(value) !== true)
        throw new AuditError("audit_metadata_forbidden");
      // defineProperty avoids `__proto__`/setter semantics: the key is already
      // allowlisted, but the clean object must never mutate its prototype.
      Object.defineProperty(clean, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return clean as AuditMeta;
  } catch (error) {
    if (error instanceof AuditError) throw error;
    throw new AuditError("audit_metadata_forbidden");
  }
}

/** Pure event construction from the authorized context (never caller fields). */
export function buildAuditEvent(
  context: AuthorizationContext,
  input: AuditEventInput,
): Prisma.AuditEventUncheckedCreateInput {
  if (
    typeof context.workspaceId !== "string" ||
    context.workspaceId.length === 0
  )
    throw new AuditError("invalid_input");
  if (
    !(AUDIT_ACTIONS as readonly string[]).includes(input.action) ||
    !(AUDIT_RESOURCE_TYPES as readonly string[]).includes(input.resourceType)
  )
    throw new AuditError("audit_metadata_forbidden");
  const meta = sanitizeAuditMeta(input.meta);
  return {
    scope: "WORKSPACE",
    workspaceId: context.workspaceId,
    actorUserId: context.userId,
    actorRole: context.workspaceRole ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    subjectClientProfileId: input.subjectClientProfileId ?? null,
    result: "ALLOW",
    reason: null,
    ip: null,
    ...(meta === undefined ? {} : { meta }),
  };
}

/**
 * Write an audit event inside the caller's transaction. Transaction-client only:
 * if this throws, the enclosing business mutation rolls back with it.
 */
export async function writeAuditEvent(
  tx: Prisma.TransactionClient,
  context: AuthorizationContext,
  input: AuditEventInput,
): Promise<void> {
  const data = buildAuditEvent(context, input);
  try {
    await tx.auditEvent.create({ data });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    )
      throw error;
    throw new AuditError("audit_write_failed");
  }
}

export type AuditEventRow = {
  id: string;
  workspaceId: string | null;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  subjectClientProfileId: string | null;
  result: string;
  reason: string | null;
  at: Date;
  ip: string | null;
  meta: unknown;
};

/**
 * Owner-scoped, bounded audit listing. `auditLog` reads are workspace-owner only
 * today: the collection guard already rejects `platform` scope, so platform-admin
 * access stays deferred until a platform path exists.
 */
export async function listAuditEvents(
  session: SessionLike,
  input: { workspaceId: string; limit?: number; cursor?: string },
  client: PrismaClient | PrismaLike = prisma,
): Promise<{ items: AuditEventRow[]; nextCursor: string | null }> {
  const ctx = await authorizeCollection(
    session,
    { resource: "auditLog", action: "read", workspaceId: input.workspaceId },
    createPrismaAuthorizationRepo(client),
  );
  // Owner-only matrix cell; fail closed on any other resolved scope.
  if (ctx.grantedScope !== "workspace")
    throw new AccessDeniedError("role_denied", "auditLog", "read");
  const take = normalizeLimit(input.limit);
  const where: Prisma.AuditEventWhereInput = {
    // S1-F2B: workspace listings are structurally scope-locked — account-owned
    // security events can never enter a tenant's audit listing.
    scope: "WORKSPACE",
    workspaceId: input.workspaceId,
  };
  if (input.cursor) where.id = { gt: input.cursor };
  const rows = await client.auditEvent.findMany({
    where,
    orderBy: { id: "asc" },
    take: take + 1,
  });
  const items = rows.slice(0, take);
  const nextCursor =
    rows.length > take ? (items[items.length - 1]?.id ?? null) : null;
  return { items, nextCursor };
}

// --- S1-F2B account-scoped security audit ------------------------------------
//
// Account events (password-reset activity today) belong to a user, not a
// workspace — `AuditEvent.workspaceId` stays null for them and the database
// CHECKs enforce the ownership shape. The account writer is a separate closed
// path: it does NOT weaken the workspace writer's context requirements, and it
// accepts only the reviewed action/resource sets above. A workspace is never
// fabricated for account-owned activity.

export type AccountAuditContext = {
  /** The account this event belongs to — required, maps to subjectUserId. */
  subjectUserId: string;
  /** Nullable: future unauthenticated reset requests have no actor. */
  actorUserId?: string | null;
  actorRole?: MemberRole | null;
};

export type AccountAuditEventInput = {
  action: (typeof ACCOUNT_AUDIT_ACTIONS)[number];
  resourceType: (typeof ACCOUNT_AUDIT_RESOURCES)[number];
  resourceId?: string | null;
  meta?: AuditMeta;
};

/**
 * Build an ACCOUNT-scoped audit row. Fails closed on any action/resource
 * outside the account allowlists or a missing/empty subject; metadata goes
 * through the same forbidden-shape allowlist as workspace events.
 */
export function buildAccountAuditEvent(
  context: AccountAuditContext,
  input: AccountAuditEventInput,
): Prisma.AuditEventUncheckedCreateInput {
  if (
    typeof context.subjectUserId !== "string" ||
    context.subjectUserId.length === 0
  )
    throw new AuditError("invalid_input");
  if (
    !(ACCOUNT_AUDIT_ACTIONS as readonly string[]).includes(input.action) ||
    !(ACCOUNT_AUDIT_RESOURCES as readonly string[]).includes(input.resourceType)
  )
    throw new AuditError("audit_metadata_forbidden");
  const meta = sanitizeAuditMeta(input.meta);
  return {
    scope: "ACCOUNT",
    workspaceId: null,
    subjectUserId: context.subjectUserId,
    actorUserId: context.actorUserId ?? null,
    actorRole: context.actorRole ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    result: "ALLOW",
    reason: null,
    ip: null,
    ...(meta === undefined ? {} : { meta }),
  };
}

/**
 * Write an account-scoped audit event inside the caller's transaction.
 * Transaction-client only — a failed write rolls the business mutation back
 * with it, exactly like the workspace writer.
 */
export async function writeAccountAuditEvent(
  tx: Prisma.TransactionClient,
  input: AccountAuditContext & AccountAuditEventInput,
): Promise<void> {
  const data = buildAccountAuditEvent(input, input);
  try {
    await tx.auditEvent.create({ data });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    )
      throw error;
    throw new AuditError("audit_write_failed");
  }
}

export type AccountAuditEventRow = {
  id: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: string;
  at: Date;
};

/**
 * Internal bounded account-event listing — NOT a user-facing security log and
 * NOT authorization. Subject-scoped by exact `subjectUserId` and hard-locked
 * to `scope: ACCOUNT`; default 25 / max 100 via the shared limit normalizer;
 * stable id cursor, deterministic ordering, minimal fields.
 */
export async function listAccountAuditEvents(
  input: { subjectUserId: string; limit?: number; cursor?: string },
  client: PrismaClient | PrismaLike = prisma,
): Promise<{ items: AccountAuditEventRow[]; nextCursor: string | null }> {
  if (
    typeof input.subjectUserId !== "string" ||
    input.subjectUserId.length === 0
  )
    throw new AuditError("invalid_input");
  const take = normalizeLimit(input.limit);
  const where: Prisma.AuditEventWhereInput = {
    scope: "ACCOUNT",
    subjectUserId: input.subjectUserId,
  };
  if (input.cursor) where.id = { gt: input.cursor };
  const rows = await client.auditEvent.findMany({
    where,
    orderBy: { id: "asc" },
    take: take + 1,
    select: {
      id: true,
      actorUserId: true,
      action: true,
      resourceType: true,
      resourceId: true,
      result: true,
      at: true,
    },
  });
  const items = rows.slice(0, take);
  const nextCursor =
    rows.length > take ? (items[items.length - 1]?.id ?? null) : null;
  return { items, nextCursor };
}
