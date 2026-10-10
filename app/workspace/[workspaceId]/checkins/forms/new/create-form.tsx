"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { createCheckInForm } from "../../actions";

/**
 * P-025-A create surface — a single `name` field bound to the
 * `createCheckInForm` server action (workspaceId is a bound first arg,
 * never a form field; no client/instance/submission inputs exist in this
 * slice).
 *
 * Blank names are rejected locally AND by the action; every failure
 * surfaces the boundary's safe message in a role=alert region. Both
 * controls disable while the action is pending. Success navigates to the
 * canonical editor route.
 */
export function CreateCheckInForm({ workspaceId }: { workspaceId: string }) {
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
      let result: Awaited<ReturnType<typeof createCheckInForm>>;
      try {
        result = await createCheckInForm(workspaceId, formData);
      } catch {
        // Transport-level rejection — surface the same generic message the
        // boundary uses; no payload, no logging of input values.
        setError("Something went wrong. Please try again in a moment.");
        return;
      }
      if (result.ok) {
        router.push(
          `/workspace/${workspaceId}/checkins/forms/${result.value.formId}`,
        );
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form
      className="auth-form"
      data-testid="create-checkin-form"
      onSubmit={onSubmit}
    >
      <label className="auth-field" htmlFor="checkin-form-name">
        Check-In form name
        <input
          autoComplete="off"
          className="auth-input"
          data-testid="checkin-form-name-input"
          disabled={pending}
          id="checkin-form-name"
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
