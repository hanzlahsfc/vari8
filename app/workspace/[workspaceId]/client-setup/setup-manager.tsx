"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type {
  AssignableSetupClient,
  AssignableTemplate,
  TemplateAssignmentSummary,
} from "@/lib/coaching/client-setup-boundary";
import { assignTemplate, cancelSetupAssignment } from "./actions";

const GENERIC = "Something went wrong. Please try again in a moment.";

/**
 * P-016 interactive surface — assign panel + per-pin cancel control.
 * Rendered only with the flag on and only for owner/coach (canWrite);
 * assistants receive `canWrite: false` and get a read-only table.
 *
 * - Assign picks a client + an ACTIVE template; the server atomically
 *   resolves and pins the latest published version (the browser never picks
 *   a version and never sends one).
 * - Cancel appears only on ACTIVE rows and requires an explicit confirm
 *   step.
 * - One transition guards every control, so a pending action disables all
 *   competing lifecycle buttons — no double-submit.
 * - Failures surface the boundary's stable safe message in role="alert".
 */
export function SetupManager({
  workspaceId,
  canWrite,
  clients,
  templates,
  rows,
}: {
  workspaceId: string;
  canWrite: boolean;
  clients: AssignableSetupClient[];
  templates: AssignableTemplate[];
  rows: TemplateAssignmentSummary[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** Two-step confirm state: which row is awaiting cancel confirmation. */
  const [confirming, setConfirming] = useState<string | null>(null);

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
    if (!formData.get("clientProfileId") || !formData.get("templateId")) {
      setError("Choose a client and a template.");
      return;
    }
    run(() => assignTemplate(workspaceId, formData));
  }

  const statusLabel: Record<TemplateAssignmentSummary["status"], string> = {
    ACTIVE: "Active",
    SUPERSEDED: "Superseded",
    CANCELLED: "Cancelled",
  };

  const dateOf = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

  return (
    <div className="assignment-manager">
      {canWrite ? (
        <section aria-label="Assign a template">
          <h2 className="assignment-manager__subtitle">Assign a template</h2>
          {clients.length === 0 || templates.length === 0 ? (
            <div
              className="empty-state"
              data-testid="setup-pickers-empty"
              role="status"
            >
              <p>Nothing to assign yet.</p>
              <p>
                {clients.length === 0
                  ? "There are no eligible clients you can assign a template to."
                  : "There are no active templates with a published version."}
              </p>
            </div>
          ) : (
            <form
              className="assignment-create"
              onSubmit={onCreate}
              data-testid="setup-create"
            >
              <label className="catalog-search__field" htmlFor="setup-client">
                Client
                <select
                  id="setup-client"
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
              <label className="catalog-search__field" htmlFor="setup-template">
                Coaching template
                <select
                  id="setup-template"
                  name="templateId"
                  className="catalog-search__input"
                  required
                  disabled={pending}
                >
                  <option value="">Choose a template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (version {t.latestVersionSeq})
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
          data-testid="setup-alert"
        >
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="empty-state" data-testid="setup-empty" role="status">
          <p>No template assignments to show.</p>
          <p>
            {canWrite
              ? "Assign a template above to create the first template assignment."
              : "No template assignments are visible to you."}
          </p>
        </div>
      ) : (
        <table className="catalog-table" data-testid="setup-table">
          <thead>
            <tr>
              <th scope="col">Client</th>
              <th scope="col">Template</th>
              <th scope="col">Version</th>
              <th scope="col">Status</th>
              <th scope="col">Assigned</th>
              <th scope="col">Ended</th>
              {canWrite ? <th scope="col">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isConfirming = confirming === row.id;
              const canCancel = canWrite && row.status === "ACTIVE";
              return (
                <tr key={row.id} data-testid="setup-row">
                  <td>{row.clientName}</td>
                  <td>
                    {row.templateName}
                    {row.templateArchived ? " (archived)" : ""}
                  </td>
                  <td>v{row.versionSeq}</td>
                  <td>{statusLabel[row.status]}</td>
                  <td>{dateOf(row.assignedAt)}</td>
                  <td>{dateOf(row.endedAt)}</td>
                  {canWrite ? (
                    <td className="assignment-row__actions">
                      {isConfirming ? (
                        <div
                          className="assignment-confirm"
                          data-testid="setup-confirm"
                        >
                          <span>Cancel this assignment?</span>
                          <button
                            type="button"
                            className="catalog-search__submit"
                            disabled={pending}
                            onClick={() =>
                              run(() => {
                                const fd = new FormData();
                                fd.set("pinId", row.id);
                                return cancelSetupAssignment(workspaceId, fd);
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
                        canCancel && (
                          <button
                            type="button"
                            className="assignment-button-secondary"
                            disabled={pending}
                            onClick={() => setConfirming(row.id)}
                          >
                            Cancel
                          </button>
                        )
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
