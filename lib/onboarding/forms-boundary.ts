import type { PrismaClient } from "@prisma/client";

import type { SessionLike } from "../auth/guard";
import type { FormDefinition, FormSummary } from "./forms";

/**
 * P-008 server boundary — the ONLY app-facing entry to onboarding form
 * operations (slice 5A). `app/**` files must never import `./forms` directly.
 *
 * INTERFACE SCAFFOLD: real signatures and types; every body throws an UNTYPED
 * error until the implementation increments land. No guard/delegation/error
 * mapping behavior exists yet.
 */

export type ActionResult<T> =
  { ok: true; value: T } | { ok: false; message: string };

export type BoundaryDeps = { db?: PrismaClient };

export async function saveDraftFromAction(
  _session: SessionLike,
  _input: {
    workspaceId: string;
    formId: string;
    expectedRevision: number;
    draftJson: string;
    name?: string;
  },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ revision: number; definition: FormDefinition }>> {
  throw new Error("not implemented (slice 5A increment)");
}

export async function openDraftFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; formId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ revision: number; definition: FormDefinition }>> {
  throw new Error("not implemented (slice 5A increment)");
}

export async function publishFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; formId: string; expectedRevision: number },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ versionSeq: number }>> {
  throw new Error("not implemented (slice 5A increment)");
}

export async function archiveFormFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; formId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ formId: string }>> {
  throw new Error("not implemented (slice 5A increment)");
}

export async function createFormFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; name: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ formId: string }>> {
  throw new Error("not implemented (slice 5A increment)");
}

export async function listFormsForWorkspace(
  _session: SessionLike,
  _input: { workspaceId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ forms: FormSummary[] }>> {
  throw new Error("not implemented (slice 5A increment)");
}

export async function getFormForWorkspace(
  _session: SessionLike,
  _input: { workspaceId: string; formId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<unknown>> {
  throw new Error("not implemented (slice 5A increment)");
}
