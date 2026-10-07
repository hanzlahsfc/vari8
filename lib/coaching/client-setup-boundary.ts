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
  computeSelectionFingerprint,
  createClientSetupAssignment,
  listAssignableSetupClients,
  listAssignableTemplates,
  listClientSetups,
  resolveAssignSelection,
  resolveCancelSelection,
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
 *
 * Browser selection contract (P-016-R2): rendered choices carry display
 * labels, positional indices, and an opaque list fingerprint — never raw
 * client/setup/pin/template/version/member ids. Mutations submit index +
 * fingerprint; the service re-fetches the authorized list, verifies the
 * fingerprint, and maps the bounded index back to a server-side identity.
 * Stale/tampered input fails with `stale_selection`/`invalid_input` and
 * zero writes.
 */

export type ActionResult<T> =
  { ok: true; value: T } | { ok: false; message: string };

const DENIED = "You don't have access to do that.";
const INVALID = "Check the form details and try again.";
const GENERIC = "Something went wrong. Please try again in a moment.";
const OFF = "This feature is not available.";
const STALE =
  "The list changed while you were working — refresh and try again.";

const CODE_TO_MESSAGE: Record<string, string> = {
  invalid_input: INVALID,
  assignment_not_accessible: DENIED,
  assignment_not_active: "This assignment is no longer active.",
  client_not_eligible: "This client can't be assigned a template.",
  template_not_eligible: "This template can't be assigned right now.",
  assignment_conflict: "This client already has a current template assignment.",
  serialization_conflict: "A conflict occurred. Please try again.",
  stale_selection: STALE,
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

function boundedIndex(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= CLIENT_SETUP_LIMITS.indexMax
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

// ── Display-safe output types (no internal identifiers) ────────────────────

export type { TemplateAssignmentSummary };

export type SetupClientChoice = { name: string };
export type SetupTemplateChoice = {
  name: string;
  latestVersionSeq: number;
};

export type SetupRowList = {
  items: TemplateAssignmentSummary[];
  nextCursor: string | null;
  /** Opaque sha-256 of the caller's ordered authorized pin list — submitted
   * back with every cancel so the server can detect list drift. */
  fingerprint: string;
};

export type AssignFormChoices = {
  clients: SetupClientChoice[];
  templates: SetupTemplateChoice[];
  /** sha-256 over the ordered client-id list and template-id list — one
   * consistency token for the whole assign form. */
  listFingerprint: string;
};

export async function listClientSetupsForWorkspace(
  session: SessionLike,
  input: { workspaceId: string; limit?: number; cursor?: string },
  deps: { db?: PrismaClient } = {},
): Promise<ActionResult<SetupRowList>> {
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

export async function listAssignFormChoices(
  session: SessionLike,
  input: { workspaceId: string },
  deps: { db?: PrismaClient } = {},
): Promise<ActionResult<AssignFormChoices>> {
  if (!enabled()) return { ok: false, message: OFF };
  const workspaceId = boundedId(input?.workspaceId);
  if (workspaceId === null) return { ok: false, message: INVALID };
  try {
    const db = deps.db ?? prisma;
    const [clients, templates] = await Promise.all([
      listAssignableSetupClients(session, { workspaceId }, db),
      listAssignableTemplates(session, { workspaceId }, db),
    ]);
    return {
      ok: true,
      value: {
        clients: clients.map(({ name }) => ({ name })),
        templates: templates.map(({ name, latestVersionSeq }) => ({
          name,
          latestVersionSeq,
        })),
        listFingerprint: computeSelectionFingerprint(
          clients.map((c) => c.id),
          templates.map((t) => t.id),
        ),
      },
    };
  } catch (error) {
    return mapError(error);
  }
}

export async function assignTemplateFromAction(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientIndex: number;
    templateIndex: number;
    listFingerprint: string;
  },
  deps: { db?: PrismaClient } = {},
): Promise<ActionResult<{ assignmentId: string }>> {
  if (!enabled()) return { ok: false, message: OFF };
  const workspaceId = boundedId(input?.workspaceId);
  const clientIndex = boundedIndex(input?.clientIndex);
  const templateIndex = boundedIndex(input?.templateIndex);
  const fingerprint = boundedId(input?.listFingerprint);
  if (
    workspaceId === null ||
    clientIndex === null ||
    templateIndex === null ||
    fingerprint === null
  )
    return { ok: false, message: INVALID };
  const db = deps.db ?? prisma;
  try {
    const resolved = await resolveAssignSelection(
      session,
      {
        workspaceId,
        clientIndex,
        templateIndex,
        fingerprint,
      },
      db,
    );
    const value = await createClientSetupAssignment(
      session,
      {
        workspaceId,
        clientProfileId: resolved.clientProfileId,
        templateId: resolved.templateId,
      },
      db,
    );
    return { ok: true, value };
  } catch (error) {
    return mapError(error);
  }
}

export async function cancelSetupAssignmentFromAction(
  session: SessionLike,
  input: { workspaceId: string; pinIndex: number; rowFingerprint: string },
  deps: { db?: PrismaClient } = {},
): Promise<ActionResult<{ cancelled: true }>> {
  if (!enabled()) return { ok: false, message: OFF };
  const workspaceId = boundedId(input?.workspaceId);
  const pinIndex = boundedIndex(input?.pinIndex);
  const fingerprint = boundedId(input?.rowFingerprint);
  if (workspaceId === null || pinIndex === null || fingerprint === null)
    return { ok: false, message: INVALID };
  const db = deps.db ?? prisma;
  try {
    const { pinId } = await resolveCancelSelection(
      session,
      { workspaceId, pinIndex, fingerprint },
      db,
    );
    await cancelClientSetupAssignment(session, { workspaceId, pinId }, db);
    return { ok: true, value: { cancelled: true } };
  } catch (error) {
    return mapError(error);
  }
}
