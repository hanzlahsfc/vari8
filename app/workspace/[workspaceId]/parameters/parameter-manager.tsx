"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveParameter,
  classifyParameter,
  createParameter,
  updateParameter,
} from "./actions";

/**
 * P-014 parameter library manager — create / display-edit / archive for
 * workspace-shared parameter definitions. Semantic-lock messaging reflects
 * the post-publish state reported by the server (`publishedReferenced`);
 * the server remains the sole authority on what may change.
 *
 * P-020A: the classification control appears only while
 * ENABLE_PARAMETER_CLASSIFICATION=1 (the page supplies a selection context).
 * Classification assigns `GENERAL_HEALTH` or `CYCLE` once — it never enables
 * data collection and cannot be changed; the browser binds the target by
 * positional index + server fingerprint, never a raw parameter id.
 */
type ParameterRow = {
  id: string;
  key: string;
  kind: string;
  label: string;
  status: "ACTIVE" | "ARCHIVED";
  dataClassification: string | null;
  revision: number;
  publishedReferenced: boolean;
  updatedAt: string;
  /** Positional ordinal inside the authorized classification list — the only
   * binding the classification form submits. Never a database id. */
  classifyIndex?: number;
};

type ClassificationContext = {
  fingerprint: string;
};

const KINDS = [
  "MEASUREMENT",
  "RATING",
  "TIME",
  "DURATION",
  "OPTION",
  "TEXT",
] as const;

export function ParameterManager({
  parameters,
  workspaceId,
  classification,
}: {
  parameters: ParameterRow[];
  workspaceId: string;
  classification?: ClassificationContext;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]>("MEASUREMENT");
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [classifyChoice, setClassifyChoice] = useState<
    Record<string, "GENERAL_HEALTH" | "CYCLE">
  >({});

  function submitClassify(row: ParameterRow) {
    if (!classification || row.classifyIndex === undefined) {
      setError(
        "This list changed while you were deciding. Reload and try again.",
      );
      return;
    }
    const choice = classifyChoice[row.id] ?? "GENERAL_HEALTH";
    const body = new FormData();
    body.append("parameterIndex", String(row.classifyIndex));
    body.append("expectedRevision", String(row.revision));
    body.append("fingerprint", classification.fingerprint);
    body.append("classification", choice);
    startTransition(async () => {
      const r = await classifyParameter(workspaceId, body);
      if (r.ok) {
        setError(null);
        router.refresh();
      } else setError(r.message);
    });
  }

  function submitCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const label = String(fd.get("label") ?? "");
    const input: Record<string, unknown> = { kind, label };
    const helpText = String(fd.get("helpText") ?? "").trim();
    if (helpText) input.helpText = helpText;
    const unit = String(fd.get("unit") ?? "").trim();
    if (
      unit &&
      (kind === "MEASUREMENT" || kind === "TIME" || kind === "DURATION")
    )
      input.unit = unit;
    if (kind === "RATING")
      input.ratingScheme = String(fd.get("ratingScheme") ?? "");
    if (kind === "OPTION") {
      const options = String(fd.get("options") ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((label) => ({ label }));
      input.options = options;
    }
    const body = new FormData();
    body.append("input", JSON.stringify(input));
    startTransition(async () => {
      const r = await createParameter(workspaceId, body);
      if (r.ok) {
        setError(null);
        (e.target as HTMLFormElement).reset();
        router.refresh();
      } else setError(r.message);
    });
  }

  function submitRename(row: ParameterRow, label: string, helpText: string) {
    const body = new FormData();
    body.append("parameterId", row.id);
    body.append("expectedRevision", String(row.revision));
    body.append("input", JSON.stringify({ label, helpText: helpText || null }));
    startTransition(async () => {
      const r = await updateParameter(workspaceId, body);
      if (r.ok) {
        setError(null);
        setEditId(null);
        router.refresh();
      } else setError(r.message);
    });
  }

  function submitArchive(row: ParameterRow) {
    const body = new FormData();
    body.append("parameterId", row.id);
    startTransition(async () => {
      const r = await archiveParameter(workspaceId, body);
      if (r.ok) {
        setError(null);
        setConfirmArchive(null);
        router.refresh();
      } else setError(r.message);
    });
  }

  return (
    <div className="catalog-page" data-testid="parameters-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Workspace</p>
        <h1 className="app-title">Parameter Library</h1>
        <p className="app-lede">
          Reusable workspace parameters for coaching templates. Definitions only
          — no client data or assignments live here.
        </p>
      </header>

      {error ? (
        <p className="auth-error" role="alert" data-testid="parameter-error">
          {error}
        </p>
      ) : null}

      <form
        className="auth-form"
        data-testid="create-parameter-form"
        onSubmit={submitCreate}
      >
        <h2>New parameter</h2>
        <label className="auth-field" htmlFor="param-kind">
          Kind
          <select
            className="auth-input"
            id="param-kind"
            name="kind"
            onChange={(e) => setKind(e.target.value as typeof kind)}
            value={kind}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="auth-field" htmlFor="param-label">
          Label
          <input
            className="auth-input"
            id="param-label"
            maxLength={120}
            name="label"
            required
            type="text"
          />
        </label>
        {(kind === "MEASUREMENT" || kind === "TIME" || kind === "DURATION") && (
          <label className="auth-field" htmlFor="param-unit">
            Unit
            <input
              className="auth-input"
              id="param-unit"
              maxLength={120}
              name="unit"
              type="text"
            />
          </label>
        )}
        {kind === "RATING" && (
          <label className="auth-field" htmlFor="param-scheme">
            Rating scheme
            <select
              className="auth-input"
              id="param-scheme"
              name="ratingScheme"
            >
              <option value="SCALE_1_10">1–10 scale</option>
              <option value="SCALE_1_5">1–5 scale</option>
              <option value="WORD_LABELS">Word labels</option>
            </select>
          </label>
        )}
        {kind === "OPTION" && (
          <label className="auth-field" htmlFor="param-options">
            Options (one per line)
            <textarea
              className="auth-input"
              id="param-options"
              name="options"
              rows={4}
            />
          </label>
        )}
        <label className="auth-field" htmlFor="param-help">
          Help text (optional)
          <input
            className="auth-input"
            id="param-help"
            maxLength={500}
            name="helpText"
            type="text"
          />
        </label>
        <button
          className="auth-button"
          data-testid="create-parameter"
          disabled={pending}
          type="submit"
        >
          Create parameter
        </button>
      </form>

      {parameters.length === 0 ? (
        <div className="empty-state" data-testid="parameters-empty">
          <p className="app-lede">No parameters yet.</p>
        </div>
      ) : (
        <table className="catalog-table" data-testid="parameters-table">
          <thead>
            <tr>
              <th scope="col">Label</th>
              <th scope="col">Kind</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {parameters.map((row) => (
              <tr key={row.id} data-testid={`parameter-row`}>
                <td>
                  {editId === row.id ? (
                    <EditRow
                      onCancel={() => setEditId(null)}
                      onSave={(label, help) => submitRename(row, label, help)}
                      row={row}
                    />
                  ) : (
                    row.label
                  )}
                </td>
                <td>{row.kind}</td>
                <td>
                  <span data-testid="parameter-status">{row.status}</span>
                  {row.publishedReferenced ? (
                    <span
                      className="auth-hint"
                      data-testid="semantic-lock-badge"
                    >
                      {" "}
                      — in use by a published template; units, ratings, and
                      options are locked
                    </span>
                  ) : null}
                </td>
                <td>
                  {row.status === "ACTIVE" && editId !== row.id ? (
                    <>
                      <button
                        className="auth-button"
                        data-testid="edit-parameter"
                        disabled={pending}
                        onClick={() => setEditId(row.id)}
                        type="button"
                      >
                        Rename
                      </button>{" "}
                      {confirmArchive === row.id ? (
                        <>
                          <span data-testid="archive-confirm-text">
                            Archive permanently? This cannot be undone.
                          </span>{" "}
                          <button
                            className="auth-button"
                            data-testid="confirm-archive-parameter"
                            disabled={pending}
                            onClick={() => submitArchive(row)}
                            type="button"
                          >
                            Confirm archive
                          </button>{" "}
                          <button
                            className="auth-button"
                            onClick={() => setConfirmArchive(null)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="auth-button"
                          data-testid="archive-parameter"
                          disabled={pending}
                          onClick={() => setConfirmArchive(row.id)}
                          type="button"
                        >
                          Archive
                        </button>
                      )}
                    </>
                  ) : null}
                  {classification && row.status === "ACTIVE" ? (
                    row.dataClassification === null ? (
                      row.classifyIndex === undefined ? null : (
                        <div className="classification-control">
                          {" "}
                          <select
                            aria-label={`Data classification for ${row.label}`}
                            className="auth-input"
                            data-testid="classification-select"
                            id={`classification-select-${row.classifyIndex}`}
                            onChange={(e) =>
                              setClassifyChoice((c) => ({
                                ...c,
                                [row.id]: e.target.value as
                                  "GENERAL_HEALTH" | "CYCLE",
                              }))
                            }
                            value={classifyChoice[row.id] ?? "GENERAL_HEALTH"}
                          >
                            <option value="GENERAL_HEALTH">
                              General health
                            </option>
                            <option value="CYCLE">Cycle</option>
                          </select>{" "}
                          <button
                            className="auth-button"
                            data-testid="classify-parameter"
                            disabled={pending}
                            onClick={() => submitClassify(row)}
                            type="button"
                          >
                            Classify
                          </button>{" "}
                          <span className="auth-hint">
                            One-time label; does not enable data collection.
                          </span>
                        </div>
                      )
                    ) : (
                      <span
                        className="auth-hint"
                        data-testid="classification-state"
                      >
                        {" "}
                        Classified: {row.dataClassification} — immutable
                      </span>
                    )
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EditRow({
  row,
  onSave,
  onCancel,
}: {
  row: ParameterRow;
  onSave: (label: string, helpText: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(row.label);
  return (
    <span>
      <label className="auth-field" htmlFor="edit-parameter-label">
        Label
        <input
          className="auth-input"
          data-testid="edit-parameter-label"
          id="edit-parameter-label"
          maxLength={120}
          onChange={(e) => setLabel(e.target.value)}
          type="text"
          value={label}
        />
      </label>
      <button
        className="auth-button"
        data-testid="save-parameter-edit"
        onClick={() => onSave(label, "")}
        type="button"
      >
        Save
      </button>{" "}
      <button className="auth-button" onClick={onCancel} type="button">
        Cancel
      </button>
    </span>
  );
}
