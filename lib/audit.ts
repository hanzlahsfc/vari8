import { Prisma, PrismaClient } from "@prisma/client";

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
  "invalid_input" | "audit_metadata_forbidden" | "audit_write_failed";

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
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Resource types audit events may reference (closed set for this slice). */
export const AUDIT_RESOURCE_TYPES = ["consent", "client_assignment"] as const;
export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[number];

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

const META_VALIDATORS: Record<keyof AuditMeta, (v: unknown) => boolean> = {
  kind: isStructuralString,
  version: isStructuralString,
  changed: (v) => typeof v === "boolean",
  count: (v) =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1_000_000,
  role: (v) => v === "PRIMARY" || v === "COACH",
  status: (v) => v === "ACTIVE" || v === "REMOVED",
};

/**
 * Fail-closed metadata allowlist. Unknown keys, forbidden value shapes, nested
 * objects, and non-plain inputs all throw `audit_metadata_forbidden`.
 */
export function sanitizeAuditMeta(meta?: AuditMeta): AuditMeta | undefined {
  if (meta === undefined) return undefined;
  if (meta === null || typeof meta !== "object" || Array.isArray(meta))
    throw new AuditError("audit_metadata_forbidden");
  const proto = Object.getPrototypeOf(meta);
  if (proto !== Object.prototype && proto !== null)
    throw new AuditError("audit_metadata_forbidden");
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    const validator = (META_VALIDATORS as Record<string, unknown>)[key];
    if (typeof validator !== "function")
      throw new AuditError("audit_metadata_forbidden");
    if (!(validator as (v: unknown) => boolean)(value))
      throw new AuditError("audit_metadata_forbidden");
    clean[key] = value;
  }
  return clean as AuditMeta;
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
  workspaceId: string;
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
