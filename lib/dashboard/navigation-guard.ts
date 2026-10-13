"use client";

/**
 * Module-level navigation guard for the dashboard editor (I1-R4).
 *
 * A component-scoped listener can be stranded: React unmounts/remounts
 * the editor in ways that silently remove handlers (observed: the
 * router's popstate processing unmounts mid-dispatch, and remounts can
 * replace a listener with a stale closure). A module singleton is
 * immune — handlers are installed once per window and always call the
 * currently bound callbacks; the editor binds/unbinds on mount.
 *
 * Contract (all navigation classes):
 *  - Internal <a href> clicks (pointer OR keyboard Enter): held via
 *    capture-phase preventDefault → the pending save flushes → the
 *    stored destination is completed ONLY after a confirmed commit.
 *  - Browser Back/Forward: the Navigation API's `navigate` event IS
 *    cancelable for traverse navigations (Chromium family) —
 *    preventDefault holds the traversal, the save flushes, and
 *    traverseTo(key) completes the originally intended traversal.
 *    Browsers without the Navigation API fall back to popstate →
 *    flush-only (the route still leaves; the edit commits server-side
 *    in the live realm).
 *  - Document exits (reload/close/tab): beforeunload in the editor.
 *  - Failed/denied/conflicting saves NEVER auto-complete a held nav —
 *    the editor surfaces an explicit Leave/Stay choice; Leave clears
 *    the debounce + queue and completes the held destination (an
 *    already-sent request may still commit server-side).
 *  - Modifier/middle clicks, external/protocol-relative/hash/target
 *    links and same-URL clicks pass through untouched.
 */

export type HeldNav = { href?: string; key?: string } | null;

export type DashboardNavApi = {
  /** true while any edit is unsaved: debounced/queued/in-flight/dirty */
  pending: () => boolean;
  /** cancel the debounce timer (held-nav path starts the flush now) */
  cancelTimer: () => void;
  /** start a save of the latest state */
  flush: () => void;
  /** complete a held link navigation (router.push) */
  navigateTo: (href: string) => void;
};

const nav = {
  api: null as DashboardNavApi | null,
  held: null as HeldNav,
  installed: false,
};

export const heldNavigation = (): HeldNav => nav.held;
export const clearHeldNavigation = () => {
  nav.held = null;
};

const traverseTo = (key: string) => {
  (
    window as unknown as {
      navigation?: { traverseTo: (k: string) => void };
    }
  ).navigation?.traverseTo(key);
};

/** Called by the editor once a held save commits — completes the held
 * destination (link push or traverseTo). */
export const completeHeldNavigation = () => {
  const t = nav.held;
  if (!t) return;
  nav.held = null;
  if (t.key) traverseTo(t.key);
  else if (t.href) nav.api?.navigateTo(t.href);
};

// ---------- listeners (installed once per window) ----------

const onClick = (e: MouseEvent) => {
  const api = nav.api;
  if (!api?.pending()) return;
  if (
    e.defaultPrevented ||
    e.button !== 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey
  )
    return;
  const a = (e.target as Element).closest?.("a[href]");
  if (!a || a.getAttribute("target")) return;
  const href = a.getAttribute("href")!;
  // same-origin app routes only — reject protocol-relative `//host`
  // (an open-redirect shape) alongside external/hash schemes
  if (
    !href.startsWith("/") ||
    href.startsWith("//") ||
    href === window.location.pathname
  )
    return;
  e.preventDefault();
  e.stopPropagation();
  nav.held = { href };
  api.cancelTimer();
  api.flush();
};

type NavigateEventLike = {
  navigationType: string;
  destination: { url: string; key: string };
  downloadRequest?: unknown;
  preventDefault(): void;
};

const onNavigate = (e: unknown) => {
  const api = nav.api;
  if (!api?.pending()) return;
  const ev = e as NavigateEventLike;
  if (ev.navigationType !== "traverse" || ev.downloadRequest) return;
  try {
    if (new URL(ev.destination.url).origin !== window.location.origin) return;
  } catch {
    return;
  }
  ev.preventDefault();
  nav.held = { key: ev.destination.key };
  api.cancelTimer();
  api.flush();
};

// fallback for browsers without the Navigation API — the save still
// commits in the live realm even though the traversal completes
const onPop = () => {
  const api = nav.api;
  if (!api?.pending()) return;
  api.cancelTimer();
  api.flush();
};

export const bindDashboardNavGuard = (api: DashboardNavApi) => {
  nav.api = api;
  if (nav.installed || typeof window === "undefined") return;
  nav.installed = true;
  document.addEventListener("click", onClick, true);
  window.addEventListener("popstate", onPop, true);
  const navigation = (
    window as unknown as {
      navigation?: {
        addEventListener(t: string, l: (e: unknown) => void): void;
      };
    }
  ).navigation;
  navigation?.addEventListener("navigate", onNavigate);
};

/** Editor unmount: keep the listeners (singleton) but detach the live
 * callbacks so off-editor navigation is never intercepted. */
export const unbindDashboardNavGuard = () => {
  nav.api = null;
  nav.held = null;
};
