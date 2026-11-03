"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * P696 — the real authenticated actor for the temporary transcript cache,
 * resolved through the same session that authorizes the media mint.
 *
 * `loading`/`error` are explicit: an unresolved or failed lookup must not
 * read or write transcript caches and must not start inference — the
 * panel fails closed and offers a retry instead of falling back to a
 * shared scope.
 */
export type ActorScope =
  | { status: "loading"; retry: () => void }
  | { status: "error"; retry: () => void }
  | { status: "ready"; scope: string; retry: () => void };

export function useActorScope(workspaceId: string): ActorScope {
  const [state, setState] = useState<{
    status: "loading" | "error" | "ready";
    scope?: string;
    nonce: number;
  }>({ status: "loading", nonce: 0 });
  const retry = useCallback(
    () => setState((s) => ({ ...s, status: "loading", nonce: s.nonce + 1 })),
    [],
  );
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, status: "loading" }));
    fetch(`/api/v1/workspaces/${workspaceId}/session`, {
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!live) return;
        if (!res.ok) {
          setState((s) => ({ ...s, status: "error" }));
          return;
        }
        const body = (await res.json()) as { user?: { id?: string } };
        const userId = body.user?.id;
        if (!live) return;
        if (userId)
          setState((s) => ({
            ...s,
            status: "ready",
            scope: `${workspaceId}:${userId}`,
          }));
        else setState((s) => ({ ...s, status: "error" }));
      })
      .catch(() => {
        if (live) setState((s) => ({ ...s, status: "error" }));
      });
    return () => {
      live = false;
    };
  }, [workspaceId, state.nonce]);
  return { ...state, retry } as ActorScope;
}
