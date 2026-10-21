import type { ReactNode } from "react";

import { ClientAuthShell } from "@/components/auth/auth-shells";

/** O17: the client auth routes wear the shell the client screen /me mounts. */
export default function MeAuthLayout({ children }: { children: ReactNode }) {
  return <ClientAuthShell>{children}</ClientAuthShell>;
}
