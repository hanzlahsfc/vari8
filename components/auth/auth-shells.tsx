import type { ReactNode } from "react";

import "@/components/canvas/coach/coach.css";
import "@/components/canvas/ethereal/ethereal-shell.css";
import "@/app/auth.css";
import { AppearanceProvider } from "@/lib/canvas/ethereal-appearance";

/**
 * O17: the two looks an auth route can wear. Both keep the #130 card layout
 * (`.auth-screen` + `.auth-card` from app/auth.css); the difference is the
 * canvas root underneath, which is what every colour and the type come from.
 *
 * - Coach shell: `.coach-root` + coach.css, unchanged from O16.
 * - Client shell: the same root `/me` mounts (AppearanceProvider renders
 *   `appearance-root eg-root` with data-mode and the theme variables) plus the
 *   `eg-auth` bridge in auth.css. No colour is declared here.
 *
 * `/invite` picks between them from the invitation's own role; `/me/login`,
 * `/me/reset-request` and `/me/reset` always use the client shell.
 */
export function CoachAuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-screen coach-root">
      <div className="auth-card">{children}</div>
    </div>
  );
}

export function ClientAuthShell({ children }: { children: ReactNode }) {
  return (
    <AppearanceProvider>
      <div className="auth-screen eg-auth">
        <div className="auth-card">{children}</div>
      </div>
    </AppearanceProvider>
  );
}
