import type { ReactNode } from "react";

import "@/app/auth.css";

/**
 * O16: the auth routes keep their pages, fields, actions and copy, and stay
 * outside the canvas parity comparison, but wear the canvas look. auth.css
 * declares the canvas tokens on .auth-screen only and maps html[data-theme]
 * onto the canvas dark and light sets, so pro-dark and pro-white both work
 * and the app shell is untouched.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">{children}</div>
    </div>
  );
}
