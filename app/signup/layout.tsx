import type { ReactNode } from "react";

import "@/components/canvas/app/globals.css";
import "@/components/canvas/app/appearance.css";
import "@/app/auth.css";

/**
 * O16: the auth routes keep their behaviour and stay outside the canvas parity
 * comparison, but render inside the same shell as the rest of the app.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="appearance-root auth-screen">
      <div className="auth-card ap-screen">{children}</div>
    </div>
  );
}
