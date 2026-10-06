"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type {
  AssignableClient,
  AssignableForm,
  AssignmentSummary,
} from "@/lib/onboarding/assignments";
import {
  cancelAssignment,
  createAssignment,
  replaceAssignment,
} from "./actions";

const GENERIC = "Something went wrong. Please try again in a moment.";

/**
 * P-013 interactive surface — create panel + per-row lifecycle controls.
 * Rendered only with the flag on and only for owner/coach (canWrite);
 * assistants receive `canWrite: false` and get a read-only table.
 *
 * - Create picks a client + an ACTIVE published form; the server atomically
 *   resolves and pins the latest published version (the browser never picks
 *   a version).
 * - Replace appears only on ACTIVE rows pinned behind the form's latest
 *   published seq and requires an explicit confirm step; cancel likewise.
 * - One transition guards every control, so a pending action disables all
 *   competing lifecycle buttons — no double-submit.
 * - Failures surface the boundary's stable safe message in role="alert".
 */
export function AssignmentManager({
  workspaceId,
  canWrite,
  clients,
  forms,
  rows,
}: {
  workspaceId: string;
  canWrite: boolean;
  clients: AssignableClient[];
  forms: AssignableForm[];
  rows: AssignmentSummary[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** Two-step confirm state: which row + which action is awaiting confirm. */
  const [confirming, setConfirming] = useState<{
    id: string;
    kind: "replace" | "cancel";
  } | null>(null);

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    setConfirming(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.message ?? GENERIC);
          return;
        }
      } catch {
        setError(GENERIC);
        return;
      }
      router.refresh();
    });
  }

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    if (!formData.get("clientProfileId") || !formData.get("formId")) {
      setError("Choose a client and a form.");
      return;
    }
    run(() => createAssignment(workspaceId, formData));
  }

  const statusLabel: Record<AssignmentSummary["status"], string> = {
    ACTIVE: "Active",
    SUPERSEDED: "Superseded",
    CANCELLED: "Cancelled",
    COMPLETED: "Completed",
  };

  const dateOf = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

  return (
    <div className="assignment-manager">
      {canWrite ? (
        <section aria-label="Assign a form">
          <h2 className="assignment-manager__subtitle">Assign a form</h2>
          {clients.length === 0 || forms.length === 0 ? (
            <div
              className="empty-state"
              data-testid="assignment-pickers-empty"
              role="status"
            >
              <p>Nothing to assign yet.</p>
              <p>
                {clients.length === 0
                  ? "There are no eligible clients you can assign forms to."
                  : "There are no active forms with a published version."}
              </p>
            </div>
          ) : (
            <form
              className="assignment-create"
              onSubmit={onCreate}
              data-testid="assignment-create"
            >
              <label className="catalog-search__field" htmlFor="assign-client">
                Client
                <select
                  id="assign-client"
                  name="clientProfileId"
                  className="catalog-search__input"
                  required
                  disabled={pending}
                >
                  <option value="">Choose a client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="catalog-search__field" htmlFor="assign-form">
                Onboarding form
                <select
                  id="assign-form"
                  name="formId"
                  className="catalog-search__input"
                  required
                  disabled={pending}
                >
                  <option value="">Choose a form…</option>
                  {forms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} (version {f.latestVersionSeq})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="catalog-search__submit"
                disabled={pending}
              >
                Assign latest version
              </button>
            </form>
          )}
        </section>
      ) : null}

      {error !== null ? (
        <p
          className="assignment-manager__alert"
          role="alert"
          data-testid="assignment-alert"
        >
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div
          className="empty-state"
          data-testid="assignment-empty"
          role="status"
        >
          <p>No assignments to show.</p>
          <p>
            {canWrite
              ? "Assign a form above to create the first onboarding assignment."
              : "No onboarding assignments are visible to you."}
          </p>
        </div>
      ) : (
        <table className="catalog-table" data-testid="assignment-table">
          <thead>
            <tr>
              <th scope="col">Client</th>
              <th scope="col">Form</th>
              <th scope="col">Version</th>
              <th scope="col">Status</th>
              <th scope="col">Assigned</th>
              <th scope="col">Ended</th>
              {canWrite ? <th scope="col">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isConfirming = confirming?.id === row.id;
              const canReplace =
                canWrite &&
                row.status === "ACTIVE" &&
                row.latestVersionSeq !== null &&
                row.latestVersionSeq > row.versionSeq;
              const canCancel = canWrite && row.status === "ACTIVE";
              return (
                <tr key={row.id} data-testid="assignment-row">
                  <td>{row.clientName}</td>
                  <td>{row.formName}</td>
                  <td>v{row.versionSeq}</td>
                  <td>{statusLabel[row.status]}</td>
                  <td>{dateOf(row.assignedAt)}</td>
                  <td>{dateOf(row.endedAt)}</td>
                  {canWrite ? (
                    <td className="assignment-row__actions">
                      {isConfirming ? (
                        <div
                          className="assignment-confirm"
                          data-testid="assignment-confirm"
                        >
                          <span>
                            {confirming.kind === "cancel"
                              ? "Cancel this assignment?"
                              : `Replace with version ${row.latestVersionSeq}?`}
                          </span>
                          <button
                            type="button"
                            className="catalog-search__submit"
                            disabled={pending}
                            onClick={() =>
                              run(() => {
                                const fd = new FormData();
                                fd.set("assignmentId", row.id);
                                return confirming.kind === "cancel"
                                  ? cancelAssignment(workspaceId, fd)
                                  : replaceAssignment(workspaceId, fd);
                              })
                            }
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="assignment-button-secondary"
                            disabled={pending}
                            onClick={() => setConfirming(null)}
                          >
                            Back
                          </button>
                        </div>
                      ) : (
                        <>
                          {canReplace ? (
                            <button
                              type="button"
                              className="assignment-button-secondary"
                              disabled={pending}
                              onClick={() =>
                                setConfirming({ id: row.id, kind: "replace" })
                              }
                            >
                              Replace
                            </button>
                          ) : null}
                          {canCancel ? (
                            <button
                              type="button"
                              className="assignment-button-secondary"
                              disabled={pending}
                              onClick={() =>
                                setConfirming({ id: row.id, kind: "cancel" })
                              }
                            >
                              Cancel
                            </button>
                          ) : null}
                        </>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
