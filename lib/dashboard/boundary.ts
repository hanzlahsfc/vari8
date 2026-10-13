/**
 * DASHBOARD-I1 boundary — the only module the app layer touches. The
 * feature gate is checked FIRST (before session/DB work); every
 * service-domain error maps to a closed, non-disclosing vocabulary.
 */

import { AccessDeniedError } from "../auth/guard";
import { isClientDashboardEnabled } from "./gate";
import {
  DashboardError,
  readStaffDashboardLayout as serviceReadStaff,
  readOwnDashboardLayout as serviceReadOwn,
  updateClientDashboardLayout as serviceUpdate,
  type DashboardDeps,
  type StaffDashboardLayout,
  type UpdateDashboardInput,
} from "./service";
import type { DashboardConfig } from "./config-schema";

export type DashboardSafeResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code:
        | "denied"
        | "invalid_input"
        | "not_available"
        | "conflict"
        | "serialization_conflict";
      message: string;
    };

const CLOSED_MESSAGES: Record<
  Extract<DashboardSafeResult<never>, { ok: false }>["code"],
  string
> = {
  denied: "You don’t have access to this dashboard.",
  invalid_input: "The dashboard configuration wasn’t valid.",
  not_available: "This dashboard isn’t available.",
  conflict: "The dashboard changed — reload to continue.",
  serialization_conflict: "The dashboard changed — please try again.",
};

function fail<T>(code: keyof typeof CLOSED_MESSAGES): DashboardSafeResult<T> {
  return { ok: false, code, message: CLOSED_MESSAGES[code] };
}

function mapError<T>(error: unknown): DashboardSafeResult<T> {
  if (error instanceof AccessDeniedError) return fail("denied");
  if (error instanceof DashboardError) {
    if (error.code === "conflict") return fail("conflict");
    if (error.code === "serialization_conflict")
      return fail("serialization_conflict");
    if (error.code === "invalid_input") return fail("invalid_input");
    return fail("not_available");
  }
  return fail("not_available");
}

async function guard<T>(
  env: {
    ENABLE_CLIENT_DASHBOARD?: string;
    APP_ENV?: string;
    NODE_ENV?: string;
  },
  fn: () => Promise<T>,
): Promise<DashboardSafeResult<T>> {
  if (!isClientDashboardEnabled(env)) return fail("not_available");
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return mapError(error);
  }
}

type Session = { user?: { id?: string } } | null | undefined;

export type ClientDashboardLayout = {
  layoutId: string;
  config: DashboardConfig;
  updatedAt: string;
};

export async function readStaffDashboardLayout(
  session: Session,
  input: { workspaceId: string; clientProfileId: string },
  deps: DashboardDeps = {},
): Promise<DashboardSafeResult<{ layout: StaffDashboardLayout | null }>> {
  return guard(process.env, () =>
    serviceReadStaff(session as never, input, deps),
  );
}

export async function readOwnDashboardLayout(
  session: Session,
  input: { workspaceId: string },
  deps: DashboardDeps = {},
): Promise<DashboardSafeResult<{ layout: ClientDashboardLayout | null }>> {
  return guard(process.env, () =>
    serviceReadOwn(session as never, input, deps),
  );
}

export async function updateClientDashboardLayoutFromAction(
  session: Session,
  input: UpdateDashboardInput,
  deps: DashboardDeps = {},
): Promise<DashboardSafeResult<{ revision: number; config: DashboardConfig }>> {
  return guard(process.env, () => serviceUpdate(session as never, input, deps));
}
