import type { Metadata } from "next";
import { Suspense } from "react";

import { auth } from "@/auth";
import { getClientViewer } from "@/lib/auth/viewer";
import { ClientRoute } from "@/components/canvas/client-app/client-route";

export const metadata: Metadata = {
  title: "Client app",
};

/**
 * Card 05a: a signed-in client binds their own identity from the session
 * viewer (workspaceId + clientProfileId), never from the url, so the
 * remote own surfaces mount on this host. Without a client session the
 * route stays the local demo and `own` stays unset.
 */
export default async function ClientPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const viewer =
    typeof userId === "string" && userId.length > 0
      ? await getClientViewer(userId)
      : null;
  return (
    <Suspense>
      <ClientRoute
        own={
          viewer
            ? {
                workspaceId: viewer.workspace.id,
                clientProfileId: viewer.clientProfileId,
              }
            : undefined
        }
      />
    </Suspense>
  );
}
