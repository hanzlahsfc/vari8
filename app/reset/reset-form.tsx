"use client";

import { useActionState } from "react";

import { completeReset, type ResetActionState } from "./actions";

/**
 * Phase 3.2 reset-completion form. The bearer token authenticates the reset —
 * no session is needed, and any existing sessions are invalidated by the
 * service's sessionVersion increment.
 */
export function ResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<
    ResetActionState,
    FormData
  >(completeReset, undefined);

  return (
    <form action={formAction} className="auth-form reset-form">
      <input type="hidden" name="token" value={token} />
      <label className="auth-field">
        <span>New password</span>
        <input
          className="auth-input"
          type="password"
          name="password"
          autoComplete="new-password"
          aria-describedby="reset-password-hint"
          required
        />
      </label>
      <p id="reset-password-hint" className="auth-hint">
        At least 10 characters and at least one digit (0–9).
      </p>
      <button
        className="auth-button reset-form__submit"
        type="submit"
        disabled={pending}
      >
        Set new password
      </button>
      {state?.error ? (
        <p className="auth-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
