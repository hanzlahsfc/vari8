import type { ReactNode } from "react";

import "@/app/auth.css";

/**
 * O16: the auth routes keep their pages, fields, actions and copy, and stay
 * outside the canvas parity comparison, but render in the app's own panel
 * pattern and tokens (both pro-dark and pro-white).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">{children}</div>
    </div>
  );
}
