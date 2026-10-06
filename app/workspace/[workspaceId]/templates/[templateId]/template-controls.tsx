"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { archiveTemplate, openTemplateDraft } from "../actions";

/**
 * P-014 — closed-draft controls: reopen (seeded from the latest version)
 * and terminal archive with an explicit confirmation step. Pending actions
 * disable competing controls to prevent double submission.
 */
export function TemplateControls({
  templateId,
  workspaceId,
}: {
  templateId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function submitOpen() {
    const body = new FormData();
    body.append("templateId", templateId);
    startTransition(async () => {
      const r = await openTemplateDraft(workspaceId, body);
      if (r.ok) router.refresh();
      else setError(r.message);
    });
  }

  function submitArchive() {
    const body = new FormData();
    body.append("templateId", templateId);
    startTransition(async () => {
      const r = await archiveTemplate(workspaceId, body);
      if (r.ok) router.refresh();
      else setError(r.message);
    });
  }

  return (
    <div data-testid="template-controls">
      {error ? (
        <p className="auth-error" role="alert" data-testid="template-error">
          {error}
        </p>
      ) : null}
      <button
        className="auth-button"
        data-testid="open-draft"
        disabled={pending}
        onClick={submitOpen}
        type="button"
      >
        Reopen draft
      </button>{" "}
      {confirming ? (
        <span data-testid="archive-confirm">
          <span data-testid="archive-confirm-text">
            Archive permanently? Versions stay readable but the template can
            never be edited again.
          </span>{" "}
          <button
            className="auth-button"
            data-testid="confirm-archive-template"
            disabled={pending}
            onClick={submitArchive}
            type="button"
          >
            Confirm archive
          </button>{" "}
          <button
            className="auth-button"
            onClick={() => setConfirming(false)}
            type="button"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          className="auth-button"
          data-testid="archive-template"
          disabled={pending}
          onClick={() => setConfirming(true)}
          type="button"
        >
          Archive
        </button>
      )}
    </div>
  );
}
