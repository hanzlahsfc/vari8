import type { Metadata } from "next";

import { ClientTracker } from "@/components/canvas/ethereal/client-tracker/client-tracker";
import "@/components/canvas/ethereal/ethereal-shell.css";
import { AppearanceProvider } from "@/lib/canvas/ethereal-appearance";

import { requireClientAccess } from "../require-canvas-access";

export const metadata: Metadata = {
  title: "Tracker — Ethereal workspace",
  description: "Your daily tracker.",
};

/** Server-local YYYY-MM-DD: the tracker bounds navigation at "today". */
function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * PR-W1 client home (S11-18, T04): the canvas standalone tracker bound to the
 * viewer's own `ClientProfile`. Identity and the per-profile storage key come
 * from the server-resolved viewer (ruling O9: the server parent passes the
 * viewer down; the shell does not fetch the session route). The eg shell
 * chrome (shell, content column, appearance tokens) matches the studio
 * surface the canvas pins this screen on.
 */
export default async function MePage() {
  const viewer = await requireClientAccess();
  return (
    <AppearanceProvider>
      <div className="eg-shell">
        <main
          className="eg-content"
          id="eg-main"
          tabIndex={-1}
          aria-label="Tracker"
        >
          <ClientTracker
            identity={{
              storageKey: `coaching-client-tracker-${viewer.clientProfileId}-v1`,
              clientName: viewer.name,
              clientInitials: viewer.initials,
              asOf: todayIsoDate(),
              workspaceId: viewer.workspace.id,
            }}
          />
        </main>
      </div>
    </AppearanceProvider>
  );
}
