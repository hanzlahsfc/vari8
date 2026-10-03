"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { createForm } from "../../actions";

/**
 * P-008 5C-1 create surface — a single `name` field bound to the reviewed
 * `createForm` server action (workspaceId is a bound first arg, never a form
 * field; no intake/answer inputs exist in this slice).
 *
 * Blank names are rejected locally AND by the action; every failure surfaces
 * the boundary's safe message in a role=alert region. Both controls disable
 * while the action is pending, so a double submit/Enter cannot produce a
 * second mutation request. Success navigates to the canonical editor route
 * (5C-2 dependency — not yet implemented, disclosed).
 */
export function CreateOnboardingForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    const name = formData.get("name");
    if (typeof name !== "string" || name.trim().length === 0) {
      setError("Enter a form name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof createForm>>;
      try {
        result = await createForm(workspaceId, formData);
      } catch {
        // Transport-level rejection (aborted/unreachable action POST) must
        // not escape the transition as an unhandled error — surface the
        // same generic message the boundary uses; no payload, no logging
        // of input values.
        setError("Something went wrong. Please try again in a moment.");
        return;
      }
      if (result.ok) {
        router.push(
          `/workspace/${workspaceId}/onboarding/forms/${result.value.formId}`,
        );
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form
      className="auth-form"
      data-testid="create-onboarding-form"
      onSubmit={onSubmit}
    >
      <label className="auth-field" htmlFor="onboarding-form-name">
        Form name
        <input
          autoComplete="off"
          className="auth-input"
          data-testid="form-name-input"
          disabled={pending}
          id="onboarding-form-name"
          name="name"
          type="text"
        />
      </label>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="auth-button" disabled={pending} type="submit">
        Create form
      </button>
    </form>
  );
}
