"use client";

import { useActionState } from "react";

import { requestReset, type ResetRequestState } from "./actions";

/**
 * Phase 3.2 reset-request form. The service's existence outcome is erased at
 * the boundary: success renders one generic message regardless of whether an
 * account exists; malformed email renders a field-level error only.
 */
export function ResetRequestForm() {
  const [state, formAction, pending] = useActionState<
    ResetRequestState,
    FormData
  >(requestReset, undefined);

  return (
    <form action={formAction} className="auth-form reset-form">
      <label className="auth-field">
        <span>Email</span>
        <input
          className="auth-input"
          type="email"
          name="email"
          autoComplete="email"
          required
        />
      </label>
      <button
        className="auth-button reset-form__submit"
        type="submit"
        disabled={pending}
      >
        Send reset link
      </button>
      {state?.message ? (
        <p
          className={state.ok ? "auth-success" : "auth-error"}
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
