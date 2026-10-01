"use client";

import { useActionState } from "react";

import { acceptInvite, type InviteActionState } from "./actions";

/**
 * Phase 3.1 invite-acceptance form. `needsAccount` selects the two service
 * paths: anonymous visitors create their account here (name + policy-bound
 * password), while a signed-in user only confirms — the service still
 * enforces that the session identity matches the invited email.
 */
export function InviteForm({
  workspaceId,
  token,
  needsAccount,
}: {
  workspaceId: string;
  token: string;
  needsAccount: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    InviteActionState,
    FormData
  >(acceptInvite, undefined);

  return (
    <form action={formAction} className="auth-form invite-form">
      <input type="hidden" name="workspace" value={workspaceId} />
      <input type="hidden" name="token" value={token} />
      {needsAccount ? (
        <>
          <label className="auth-field">
            <span>Your name</span>
            <input
              className="auth-input"
              type="text"
              name="name"
              autoComplete="name"
              defaultValue={state?.name ?? ""}
              required
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              className="auth-input"
              type="password"
              name="password"
              autoComplete="new-password"
              aria-describedby="invite-password-hint"
              required
            />
          </label>
          <p id="invite-password-hint" className="auth-hint">
            At least 10 characters and at least one digit (0–9).
          </p>
        </>
      ) : null}
      <button
        className="auth-button invite-form__submit"
        type="submit"
        disabled={pending}
      >
        {needsAccount ? "Create account and join" : "Accept invitation"}
      </button>
      {state?.error ? (
        <p className="auth-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
