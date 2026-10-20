import type { ReactNode } from "react";

import "@/components/canvas/coach/coach.css";
import "@/app/auth.css";

/**
 * O16: the auth routes keep their pages, fields, actions and copy, and stay
 * outside the canvas parity comparison, but wear the canvas look. coach.css
 * plus the coach-root class give them the coach studio shell that / sends
 * every coach to, so tokens, type, inputs, focus ring and the page wash are
 * the canvas's own rules. auth.css only lays out the card and maps
 * html[data-theme] onto the canvas light set.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-screen coach-root">
      <div className="auth-card">{children}</div>
    </div>
  );
}
