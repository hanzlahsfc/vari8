"use client";

import { useActionState } from "react";

import { signUpCoach } from "./actions";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpCoach, undefined);

  return (
    <form action={formAction} className="auth-form">
      <label className="auth-field">
        <span>Your name</span>
        <input
          className="auth-input"
          type="text"
          name="name"
          autoComplete="name"
          required
        />
      </label>
      <label className="auth-field">
        <span>Workspace name</span>
        <input
          className="auth-input"
          type="text"
          name="workspaceName"
          required
        />
      </label>
      <label className="auth-field">
        <span>Email</span>
        <input
          className="auth-input"
          type="email"
          name="email"
          autoComplete="username"
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
          required
        />
      </label>
      <button className="auth-button" type="submit" disabled={pending}>
        Create workspace
      </button>
      {state?.error ? (
        <p className="auth-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
