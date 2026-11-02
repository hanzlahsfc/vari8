"use client";

import { useEffect, useState } from "react";

/**
 * P693 — the real authenticated actor for the temporary transcript cache.
 * `GET /workspaces/:ws/session` returns the server-authenticated user id
 * (and memberId) — the same session the media mint authorizes — so the
 * scope is the actual identity + workspace, never a fabricated string.
 * `null` while unresolved: callers must not read/write cache without it.
 */
export function useActorScope(workspaceId: string): string | null {
  const [scope, setScope] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setScope(null);
    fetch(`/api/v1/workspaces/${workspaceId}/session`, {
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok || !live) return;
        const body = (await res.json()) as { user?: { id?: string } };
        if (live && body.user?.id)
          setScope(`${workspaceId}:${body.user.id}`);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [workspaceId]);
  return scope;
}
