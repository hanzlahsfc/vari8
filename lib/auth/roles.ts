import type { MemberRole } from "@prisma/client";

/**
 * PR-05 owner-decided role model (D10/D15, owner answers 3 + 6):
 * three visible workspace roles — owner, coach, client — enforced on the
 * server. This table is the source of truth; `docs/security/authorization-
 * model.md` is generated from it.
 *
 * Scope semantics per (capability, role):
 * - "workspace" — may act on any client/data in the workspace.
 * - "own"       — may act only on records owned by the caller.
 * - "deny"      — never.
 *
 * MemberRole mapping is deliberate and closed: ASSISTANT_COACH and SUPPORT are
 * legacy roles from Hanzlah's schema that map to no D15 role — they deny.
 */

export type Role = "owner" | "coach" | "client";
export const ROLES = ["owner", "coach", "client"] as const;

export type Capability =
  // Staff surfaces: roster, calendar, check-in board (D22).
  | "roster.read"
  // A client's plans: training, nutrition, habits, check-in schedule,
  // template assignment, dashboard layout (owner answer 3).
  | "plan.read"
  | "plan.write"
  // Client data: tracker values, check-in + onboarding submissions, feedback.
  | "clientData.read"
  // Own plans, dashboard, schedule, feedback.
  | "own.read"
  // Logging: tracker values, check-in submission, habit/task completion.
  | "own.write"
  // Private coach notes on a client (never shown to the client).
  | "notes.write"
  // Coach tasks on a client.
  | "tasks.manage"
  // Meal template library, parameter picks, saved meals, exercise library.
  | "library.manage"
  // Messaging: staff -> any client; client -> own coach conversation.
  | "message.write"
  // Appearance/preview editing.
  | "appearance.write"
  // Workspace membership administration. (member.remove is not in the
  // matrix — the canvas exposes no removal capability, per D10/owner Q3.)
  | "member.invite";

export type CapabilityScope = "workspace" | "own" | "deny";

/**
 * The decision matrix. Every cell is explicit — an unknown capability or role
 * never defaults to anything but a deny.
 */
export const CAPABILITY_MATRIX: Record<Capability, Record<Role, CapabilityScope>> = {
  "roster.read":      { owner: "workspace", coach: "workspace", client: "deny" },
  "plan.read":        { owner: "workspace", coach: "workspace", client: "own" },
  "plan.write":       { owner: "workspace", coach: "workspace", client: "deny" },
  "clientData.read":  { owner: "workspace", coach: "workspace", client: "own" },
  "own.read":         { owner: "own",       coach: "own",       client: "own" },
  "own.write":        { owner: "own",       coach: "own",       client: "own" },
  "notes.write":      { owner: "workspace", coach: "workspace", client: "deny" },
  "tasks.manage":     { owner: "workspace", coach: "workspace", client: "deny" },
  "library.manage":   { owner: "workspace", coach: "workspace", client: "deny" },
  "message.write":    { owner: "workspace", coach: "workspace", client: "own" },
  "appearance.write": { owner: "workspace", coach: "workspace", client: "deny" },
  "member.invite":    { owner: "workspace", coach: "workspace", client: "deny" },
};

export const CAPABILITIES = Object.keys(CAPABILITY_MATRIX) as Capability[];

export function capabilityScope(role: Role, capability: Capability): CapabilityScope {
  const row = CAPABILITY_MATRIX[capability];
  return row ? row[role] : "deny";
}

/** Closed mapping from the persisted member role to the D15 role name. */
export function memberRoleToRole(role: MemberRole): Role | null {
  switch (role) {
    case "WORKSPACE_OWNER":
      return "owner";
    case "COACH":
      return "coach";
    case "CLIENT":
      return "client";
    default:
      return null;
  }
}
