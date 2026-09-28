"use client";

import { useActionState } from "react";

import { authenticate } from "./actions";

export function LoginForm() {
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
