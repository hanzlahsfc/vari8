"use client";

/**
 * Read-only sandbox provider for the setup editor preview.
 *
 * It supplies the same `useCoach()` contract as the workspace provider, but
 * owns a private copy of the state. Navigation and toasts are no-ops and media
 * uploads are discarded, so preview interaction never reaches the real store.
 * The host guard is intentionally not shared; a local passthrough ref keeps the
 * provider contract identical.
 */

import { type ReactNode, useRef, useState } from "react";
import { type CoachState, type Route, registerCustomParameters } from "./model";
import { CoachContext, type CoachStore } from "./store";

export function CoachPreviewProvider({
  state,
  route,
  children,
}: {
  state: CoachState;
  route: Route;
  children: ReactNode;
}) {
  const [sandbox, setSandbox] = useState(() => structuredClone(state));
  const [source, setSource] = useState(state);
  // Adjust the sandbox during render when the host hands over a new base state
  // (the debounced draft or a workspace change). React re-renders before
  // committing, so newly mounted section components never read a stale state.
  if (source !== state) {
    setSource(state);
    setSandbox(structuredClone(state));
  }
  const guard = useRef<((next: Route) => boolean) | null>(null);
  registerCustomParameters(sandbox.customParameters);
  const store: CoachStore = {
    state: sandbox,
    setState: setSandbox,
    hydrated: true,
    storageOk: true,
    route,
    navigate: (next) => {
      guard.current?.(next);
    },
    guard,
    toast: () => undefined,
    notice: null,
    dismiss: () => undefined,
    media: {},
    attach: () => undefined,
  };
  return (
    <CoachContext.Provider value={store}>{children}</CoachContext.Provider>
  );
}
