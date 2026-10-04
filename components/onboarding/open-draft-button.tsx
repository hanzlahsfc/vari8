"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveForm,
  openDraft,
} from "@/app/workspace/[workspaceId]/onboarding/actions";

const GENERIC_MESSAGE = "Something went wrong. Please try again in a moment.";

/**
 * P-008 ES-4a — closed-branch lifecycle controls.
 *
 * The editor page mounts this ONLY on the non-archived no-draft branch:
 * a published form with no open draft exposes exactly two mutation
 * controls — `open-draft` (reopen seeds a fresh draft from the latest
 * published definition) and `archive-form`. One shared pending scope
 * disables both controls while either action is in flight; a press
 * clears the standing alert; a typed rejection surfaces the boundary's
 * safe message and a transport rejection the generic message (never
 * internals, ids, or payload text) — state stays so an explicit retry
 * re-sends the same arguments and remains replay-safe. No automatic
 * retry is ever issued.
 *
 * On reopen success `router.refresh()` requests a client remount so the
 * seeded editor renders truthfully even when the action-side
 * revalidation was swallowed; on archive success `router.push()`
 * navigates to the canonical list. Both run OUTSIDE the action catch,
 * so a refresh or navigation failure can never misreport a committed
 * mutation. Archived forms never mount this component — reopen is not
 * offered on a permanently read-only surface.
 */
export function OpenDraftButton({
  workspaceId,
  formId,
}: {
  workspaceId: string;
  formId: string;
}) {
  const router = useRouter();
  const [alert, setAlert] = useState("");
  const [pending, startTransition] = useTransition();

  const reopen = () => {
    // Explicit pending guard — a press on a disabled control or a
    // double dispatch can never issue a second action call.
    if (pending) {
      return;
    }
    setAlert("");
    const formData = new FormData();
    formData.set("formId", formId);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof openDraft>>;
      try {
        result = await openDraft(workspaceId, formData);
      } catch {
        // Unknown outcome (a committed-but-lost response is possible):
        // generic alert only, an explicit retry stays replay-safe.
        setAlert(GENERIC_MESSAGE);
        return;
      }
      if (!result.ok) {
        setAlert(result.message);
        return;
      }
      // Outside the action catch — a refresh failure cannot misreport
      // the committed reopen as a failed mutation.
      router.refresh();
    });
  };

  const archive = () => {
    if (pending) {
      return;
    }
    setAlert("");
    const formData = new FormData();
    formData.set("formId", formId);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof archiveForm>>;
      try {
        result = await archiveForm(workspaceId, formData);
      } catch {
        setAlert(GENERIC_MESSAGE);
        return;
      }
      if (!result.ok) {
        setAlert(result.message);
        return;
      }
      // Outside the action catch — a navigation failure cannot
      // misreport the committed archive as a failed mutation.
      router.push(
        `/workspace/${encodeURIComponent(workspaceId)}/onboarding/forms`,
      );
    });
  };

  return (
    <>
      <div role="alert">{alert}</div>
      <button
        className="auth-button"
        data-testid="open-draft"
        disabled={pending}
        onClick={reopen}
        type="button"
      >
        Reopen draft
      </button>
      <button
        className="auth-button"
        data-testid="archive-form"
        disabled={pending}
        onClick={archive}
        type="button"
      >
        Archive
      </button>
    </>
  );
}
