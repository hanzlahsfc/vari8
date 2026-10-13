"use client";

import { useActionState, useEffect } from "react";

import { clearAllDashboardSlots } from "@/lib/dashboard/autosave-coordinator";

import { authenticate } from "./actions";

export function LoginForm() {
  // I1-R5 session boundary: sign-out/session-expiry lands here — drop any
  // retained dashboard drafts/queued work so a new session can never
  // replay the previous user's configuration.
  useEffect(() => {
    clearAllDashboardSlots();
  }, []);

  const [error, formAction, pending] = useActionState(authenticate, undefined);

  return (
    <form action={formAction} className="auth-form">
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
          autoComplete="current-password"
          required
        />
      </label>
      <button className="auth-button" type="submit" disabled={pending}>
        Sign in
      </button>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
