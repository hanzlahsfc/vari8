"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveCheckInForm,
  openCheckInDraft,
} from "@/app/workspace/[workspaceId]/checkins/actions";

const GENERIC_MESSAGE = "Something went wrong. Please try again in a moment.";

/**
 * P-025-A — closed-branch lifecycle controls.
 *
 * The editor page mounts this ONLY on the non-archived no-draft branch:
 * a published form with no open draft exposes exactly two mutation
 * controls — `checkin-open-draft` (reopen seeds a fresh v2 draft from the
 * latest immutable published definition) and `checkin-archive-form`. One
 * shared pending scope disables both controls while either action is in
 * flight; a press clears the standing alert; a typed rejection surfaces
 * the boundary's safe message and a transport rejection the generic
 * message. No automatic retry is ever issued.
 *
 * On reopen success `router.refresh()` requests a client remount so the
 * seeded editor renders truthfully; on archive success `router.push()`
 * navigates to the canonical list. Both run OUTSIDE the action catch.
 * Archived forms never mount this component.
 */
export function CheckInOpenDraftButton({
  workspaceId,
  formId,
}: {
  workspaceId: string;
  formId: string;
}) {
  const router = useRouter();
  const [alert, setAlert] = useState("");
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  const reopen = () => {
    if (pending) {
      return;
    }
    setAlert("");
    const formData = new FormData();
    formData.set("formId", formId);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof openCheckInDraft>>;
      try {
        result = await openCheckInDraft(workspaceId, formData);
      } catch {
        // Unknown outcome (a committed-but-lost response is possible):
        // generic alert only; no retry is ever issued automatically.
        setAlert(GENERIC_MESSAGE);
        return;
      }
      if (!result.ok) {
        setAlert(result.message);
        return;
      }
      router.refresh();
    });
  };

  const archive = () => {
    if (pending) {
      return;
    }
    // Two-step destructive confirmation (same pattern as the open-draft
    // editor path): first press arms, second press commits. Arming never
    // performs any mutation.
    if (!archiveConfirm) {
      setArchiveConfirm(true);
      return;
    }
    setArchiveConfirm(false);
    setAlert("");
    const formData = new FormData();
    formData.set("formId", formId);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof archiveCheckInForm>>;
      try {
        result = await archiveCheckInForm(workspaceId, formData);
      } catch {
        setAlert(GENERIC_MESSAGE);
        return;
      }
      if (!result.ok) {
        setAlert(result.message);
        return;
      }
      router.push(
        `/workspace/${encodeURIComponent(workspaceId)}/checkins/forms`,
      );
    });
  };

  return (
    <>
      <div aria-live="polite" data-testid="checkin-alert" role="alert">
        {alert}
      </div>
      <button
        className="auth-button"
        data-testid="checkin-open-draft"
        disabled={pending}
        onClick={reopen}
        type="button"
      >
        Reopen draft
      </button>
      {archiveConfirm ? (
        <>
          <button
            className="auth-button"
            data-testid="checkin-archive-confirm"
            disabled={pending}
            onClick={archive}
            type="button"
          >
            Confirm archive
          </button>
          <button
            data-testid="checkin-archive-cancel"
            disabled={pending}
            onClick={() => setArchiveConfirm(false)}
            type="button"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          className="auth-button"
          data-testid="checkin-archive-form"
          disabled={pending}
          onClick={archive}
          type="button"
        >
          Archive
        </button>
      )}
    </>
  );
}
