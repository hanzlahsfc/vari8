import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { AccessDeniedError, type SessionLike } from "../auth/guard";
import {
  CLIENT_SETUP_LIMITS,
  ClientSetupError,
  isClientSetupEnabled,
} from "./client-setup-gate";
import {
  cancelClientSetupAssignment,
  createClientSetupAssignment,
  listAssignableSetupClients,
  listAssignableTemplates,
  listClientSetups,
  type AssignableSetupClient,
  type AssignableTemplate,
  type TemplateAssignmentSummary,
} from "./client-setup";

/**
 * P-016 client-setup boundary — the single app-facing surface for the
 * guarded `client-setup` service (product-decisions #49–#57).
 *
 * Every entry point:
 *  1. checks `ENABLE_CLIENT_SETUP === "1"` FIRST, before binding any
 *     user-controlled input — a flag-off call never reaches the service,
 *     the database, or the audit trail;
 *  2. binds ids to bounded, well-formed strings;
 *  3. delegates to the service, which performs flag-independent
 *     authorization;
 *  4. maps failure codes to stable, non-disclosing user messages (the same
 *     message set regardless of whether the row exists, is foreign, or is
 *     denied);
 *  5. returns Result objects — it never throws for expected failures and
 *     never leaks service internals.
 */

export type ActionResult<T> =
  { ok: true; value: T } | { ok: false; message: string };

const DENIED = "You don't have access to do that.";
const INVALID = "Check the form details and try again.";
const GENERIC = "Something went wrong. Please try again in a moment.";
const OFF = "This feature is not available.";

const CODE_TO_MESSAGE: Record<string, string> = {
  invalid_input: INVALID,
  assignment_not_accessible: DENIED,
  assignment_not_active: "This assignment is no longer active.",
  client_not_eligible: "This client can't be assigned a template.",
  template_not_eligible: "This template can't be assigned right now.",
  assignment_conflict: "This client already has a current template assignment.",
  serialization_conflict: "A conflict occurred. Please try again.",
};

function isWellFormedString(value: string): boolean {
  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}

function boundedId(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= CLIENT_SETUP_LIMITS.idMax &&
    isWellFormedString(value)
    ? value
    : null;
}

function mapError(error: unknown): { ok: false; message: string } {
  if (error instanceof ClientSetupError) {
    return { ok: false, message: CODE_TO_MESSAGE[error.code] ?? GENERIC };
  }
  if (error instanceof AccessDeniedError) {
    return { ok: false, message: DENIED };
  }
  return { ok: false, message: GENERIC };
}

function enabled(): boolean {
  return isClientSetupEnabled(process.env.ENABLE_CLIENT_SETUP);
}

export type {
  AssignableSetupClient,
  AssignableTemplate,
  TemplateAssignmentSummary,
};

export async function listClientSetupsForWorkspace(
  session: SessionLike,
  input: { workspaceId: string; limit?: number; cursor?: string },
  deps: { db?: PrismaClient } = {},
): Promise<
  ActionResult<{
    items: TemplateAssignmentSummary[];
    nextCursor: string | null;
  }>
> {
  if (!enabled()) return { ok: false, message: OFF };
  const workspaceId = boundedId(input?.workspaceId);
  if (workspaceId === null) return { ok: false, message: INVALID };
  try {
    const value = await listClientSetups(
      session,
      { workspaceId, limit: input.limit, cursor: input.cursor },
      deps.db ?? prisma,
    );
    return { ok: true, value };
  } catch (error) {
    return mapError(error);
  }
}

export async function listAssignableClientsForSetup(
  session: SessionLike,
  input: { workspaceId: string; limit?: number; cursor?: string },
  deps: { db?: PrismaClient } = {},
): Promise<
  ActionResult<{ items: AssignableSetupClient[]; nextCursor: string | null }>
> {
  if (!enabled()) return { ok: false, message: OFF };
  const workspaceId = boundedId(input?.workspaceId);
  if (workspaceId === null) return { ok: false, message: INVALID };
  try {
    const value = await listAssignableSetupClients(
      session,
      { workspaceId, limit: input.limit, cursor: input.cursor },
      deps.db ?? prisma,
    );
    return { ok: true, value };
  } catch (error) {
    return mapError(error);
  }
}

export async function listAssignableTemplatesForSetup(
  session: SessionLike,
  input: { workspaceId: string },
  deps: { db?: PrismaClient } = {},
): Promise<ActionResult<AssignableTemplate[]>> {
  if (!enabled()) return { ok: false, message: OFF };
  const workspaceId = boundedId(input?.workspaceId);
  if (workspaceId === null) return { ok: false, message: INVALID };
  try {
    const value = await listAssignableTemplates(
      session,
      { workspaceId },
      deps.db ?? prisma,
    );
    return { ok: true, value };
  } catch (error) {
    return mapError(error);
  }
}

export async function assignTemplateFromAction(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string; templateId: string },
  deps: { db?: PrismaClient } = {},
): Promise<ActionResult<{ assignmentId: string }>> {
  if (!enabled()) return { ok: false, message: OFF };
  const workspaceId = boundedId(input?.workspaceId);
  const clientProfileId = boundedId(input?.clientProfileId);
  const templateId = boundedId(input?.templateId);
  if (workspaceId === null || clientProfileId === null || templateId === null)
    return { ok: false, message: INVALID };
  try {
    const value = await createClientSetupAssignment(
      session,
      { workspaceId, clientProfileId, templateId },
      deps.db ?? prisma,
    );
    return { ok: true, value };
  } catch (error) {
    return mapError(error);
  }
}

export async function cancelSetupAssignmentFromAction(
  session: SessionLike,
  input: { workspaceId: string; pinId: string },
  deps: { db?: PrismaClient } = {},
): Promise<ActionResult<{ cancelled: true }>> {
  if (!enabled()) return { ok: false, message: OFF };
  const workspaceId = boundedId(input?.workspaceId);
  const pinId = boundedId(input?.pinId);
  if (workspaceId === null || pinId === null)
    return { ok: false, message: INVALID };
  try {
    await cancelClientSetupAssignment(
      session,
      { workspaceId, pinId },
      deps.db ?? prisma,
    );
    return { ok: true, value: { cancelled: true } };
  } catch (error) {
    return mapError(error);
  }
}
