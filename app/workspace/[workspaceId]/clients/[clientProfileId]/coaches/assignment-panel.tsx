"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { AssignmentSummary } from "@/lib/workspace/clients";
import {
  assignCoachAction,
  removeCoachAssignmentAction,
  setPrimaryCoachAction,
  type CoachAssignmentActionState,
} from "./actions";

const GENERIC = "Something went wrong. Please try again in a moment.";

export type AssignableMember = {
  memberId: string;
  displayName: string;
  role: string;
};

const ROLE_LABEL: Record<string, string> = {
  WORKSPACE_OWNER: "Owner",
  COACH: "Coach",
  ASSISTANT_COACH: "Assistant coach",
};

/**
 * SOLO-COACH-I1 — explicit assign / set-primary / remove controls for a
 * client's coach assignments (decision 111). Owner-only admission happens
 * on the page; every action re-authorizes inside the service transaction,
 * so these controls are advisory only. One transition guards all controls
 * — no double-submit; remove requires an explicit confirm step.
 */
export function AssignmentPanel({
  workspaceId,
  clientProfileId,
  rows,
  members,
}: {
  workspaceId: string;
  clientProfileId: string;
  rows: AssignmentSummary[];
  members: AssignableMember[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);

  const nameOf = (memberId: string) =>
    members.find((m) => m.memberId === memberId)?.displayName ??
    "Former member";

  function run(
    action: (
      prev: CoachAssignmentActionState,
      formData: FormData,
    ) => Promise<CoachAssignmentActionState>,
    formData: FormData,
  ) {
    setError(null);
    setConfirmingRemove(null);
    startTransition(async () => {
      try {
        const result = await action({ ok: "idle" }, formData);
        if (result.ok !== true) {
          setError(result.ok === false ? result.message : GENERIC);
          return;
        }
      } catch {
        setError(GENERIC);
        return;
      }
      router.refresh();
    });
  }

  function withIds(formData: FormData, coachMemberId?: string) {
    formData.set("workspaceId", workspaceId);
    formData.set("clientProfileId", clientProfileId);
    if (coachMemberId !== undefined)
      formData.set("coachMemberId", coachMemberId);
    return formData;
  }

  function onAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    if (!formData.get("coachMemberId") || !formData.get("role")) {
      setError("Choose a member and a role.");
      return;
    }
    run(assignCoachAction, withIds(formData));
  }

  const activeRows = rows.filter((r) => r.status === "ACTIVE");
  const removedRows = rows.filter((r) => r.status === "REMOVED");

  return (
    <section aria-label="Coach assignments">
      {error !== null ? (
        <p className="daily-errors" role="alert" data-testid="assign-error">
          {error}
        </p>
      ) : null}

      {activeRows.length === 0 ? (
        <div
          className="empty-state"
          data-testid="coach-assignments-empty"
          role="status"
        >
          <p>No coaches assigned.</p>
          <p>
            This client has no coach assignments yet. Assign a member below to
            grant them review access for this client.
          </p>
        </div>
      ) : (
        <table className="catalog-table" data-testid="coach-assignments-table">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Role</th>
              <th scope="col">Assigned</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {activeRows.map((row) => (
              <tr key={row.id} data-testid="coach-assignment-row">
                <td>{nameOf(row.coachMemberId)}</td>
                <td>{row.role}</td>
                <td>{row.assignedAt.toISOString().slice(0, 10)}</td>
                <td>
                  {row.role !== "PRIMARY" ? (
                    <button
                      type="button"
                      className="catalog-search__submit"
                      disabled={pending}
                      data-testid={`set-primary-${row.coachMemberId}`}
                      onClick={() =>
                        run(
                          setPrimaryCoachAction,
                          withIds(new FormData(), row.coachMemberId),
                        )
                      }
                    >
                      Set primary
                    </button>
                  ) : null}
                  {confirmingRemove === row.id ? (
                    <>
                      <button
                        type="button"
                        className="catalog-search__submit"
                        disabled={pending}
                        data-testid={`confirm-remove-${row.coachMemberId}`}
                        onClick={() =>
                          run(
                            removeCoachAssignmentAction,
                            withIds(new FormData(), row.coachMemberId),
                          )
                        }
                      >
                        Confirm remove
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setConfirmingRemove(null)}
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      data-testid={`remove-${row.coachMemberId}`}
                      onClick={() => setConfirmingRemove(row.id)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={onAssign} data-testid="assign-coach-form">
        <h2 className="assignment-manager__subtitle">Assign a coach</h2>
        <label>
          Member
          <select
            name="coachMemberId"
            required
            disabled={pending}
            data-testid="assign-member-select"
          >
            <option value="">Choose a member</option>
            {members.map((m) => (
              <option key={m.memberId} value={m.memberId}>
                {m.displayName} ({ROLE_LABEL[m.role] ?? m.role})
              </option>
            ))}
          </select>
        </label>
        <label>
          Role
          <select
            name="role"
            required
            disabled={pending}
            data-testid="assign-role-select"
          >
            <option value="COACH">Coach</option>
            <option value="PRIMARY">Primary coach</option>
          </select>
        </label>
        <button
          type="submit"
          className="catalog-search__submit"
          disabled={pending}
          data-testid="assign-submit"
        >
          {pending ? "Assigning…" : "Assign"}
        </button>
      </form>

      {removedRows.length > 0 ? (
        <details data-testid="coach-assignments-removed">
          <summary>Past assignments</summary>
          <ul>
            {removedRows.map((row) => (
              <li key={row.id}>
                {nameOf(row.coachMemberId)} — {row.role}, removed
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
