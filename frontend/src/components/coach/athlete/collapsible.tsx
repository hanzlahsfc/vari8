"use client";

/**
 * Shared collapse primitives for the athlete timeline and tracker.
 *
 * Rows animate with a 0fr ↔ 1fr grid track (the inner child clips its
 * content). Column groups animate their own width in CSS; the presence hooks
 * here keep their content mounted until the exit transition has finished.
 */

import {
  type ReactNode,
  type TransitionEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";

/** Matches the width/height transition tokens in the tab stylesheets. */
export const COLLAPSE_EXPAND_MS = 220;
export const COLLAPSE_COLLAPSE_MS = 180;

export type CollapseState = { mounted: boolean; open: boolean };

export type CollapseAction =
  | { type: "mount" }
  | { type: "expand" }
  | { type: "collapse" }
  | { type: "unmount" };

/** Pure mount/open state machine used by `Collapsible`. */
export function collapseReducer(
  state: CollapseState,
  action: CollapseAction,
): CollapseState {
  switch (action.type) {
    case "mount":
      return state.mounted ? state : { mounted: true, open: false };
    case "expand":
      return state.open && state.mounted
        ? state
        : { mounted: true, open: true };
    case "collapse":
      return state.mounted && !state.open
        ? state
        : { mounted: state.mounted, open: false };
    case "unmount":
      return !state.mounted && !state.open
        ? state
        : { mounted: false, open: false };
  }
}

/**
 * Keeps content mounted while it fades/shrinks out, then unmounts it.
 * Re-opening during the exit cancels the pending unmount.
 */
export function usePresence(
  open: boolean,
  {
    instant = false,
    exitMs = COLLAPSE_COLLAPSE_MS,
  }: { instant?: boolean; exitMs?: number } = {},
): boolean {
  const [mounted, setMounted] = useState(open);
  const mountedRef = useRef(open);
  const timerRef = useRef<number | undefined>(undefined);
  mountedRef.current = mounted;

  useLayoutEffect(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    if (open) {
      setMounted(true);
      return;
    }
    if (instant || !mountedRef.current) {
      setMounted(false);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = undefined;
      setMounted(false);
    }, exitMs + 50);
    return () => window.clearTimeout(timerRef.current);
  }, [open, instant, exitMs]);

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
    },
    [],
  );

  return mounted;
}

/**
 * Presence plus a one-frame hidden state on enter, so a freshly mounted
 * element fades in instead of appearing at full opacity.
 */
export function useFadePresence(
  open: boolean,
  {
    instant = false,
    exitMs = COLLAPSE_COLLAPSE_MS,
  }: { instant?: boolean; exitMs?: number } = {},
): { mounted: boolean; visible: boolean } {
  const mounted = usePresence(open, { instant, exitMs });
  const [visible, setVisible] = useState(open);
  const openRef = useRef(open);
  const frameRef = useRef<number | undefined>(undefined);
  const firstRef = useRef(true);
  openRef.current = open;

  useLayoutEffect(() => {
    if (frameRef.current !== undefined) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    }
    if (firstRef.current) {
      firstRef.current = false;
      setVisible(open);
      return;
    }
    if (!open) {
      setVisible(false);
      return;
    }
    if (!mounted) return;
    if (instant) {
      setVisible(true);
      return;
    }
    // Keep the first mounted frame transparent, then fade in.
    setVisible(false);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = undefined;
      if (openRef.current) setVisible(true);
    });
    return () => {
      if (frameRef.current !== undefined) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = undefined;
      }
    };
  }, [open, mounted, instant]);

  useEffect(
    () => () => {
      if (frameRef.current !== undefined)
        cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return { mounted, visible };
}

/**
 * Height collapse for rows: `open` mounts the content, then the wrapper flips
 * its grid track on the next frame so the 0fr → 1fr transition can run.
 */
export function Collapsible({
  open,
  instant = false,
  className = "",
  innerClassName = "",
  children,
}: {
  open: boolean;
  /** Bulk action: skip motion and settle immediately. */
  instant?: boolean;
  className?: string;
  innerClassName?: string;
  /** Called only while the content is mounted, so collapsed rows are not built. */
  children: ReactNode | (() => ReactNode);
}) {
  const [state, dispatch] = useReducer(collapseReducer, open, (value) => ({
    mounted: value,
    open: value,
  }));
  const openRef = useRef(open);
  const mountedRef = useRef(state.mounted);
  const timerRef = useRef<number | undefined>(undefined);
  const frameRef = useRef<number | undefined>(undefined);
  openRef.current = open;
  mountedRef.current = state.mounted;

  const clearPending = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    if (frameRef.current !== undefined) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    }
  }, []);

  useLayoutEffect(() => {
    clearPending();

    if (open) {
      if (instant || mountedRef.current) {
        dispatch({ type: "expand" });
        return;
      }
      // Mount closed for one frame, then flip open so the transition starts.
      dispatch({ type: "mount" });
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = undefined;
        if (openRef.current) dispatch({ type: "expand" });
      });
      return;
    }

    if (!mountedRef.current) {
      dispatch({ type: "unmount" });
      return;
    }
    if (instant) {
      dispatch({ type: "unmount" });
      return;
    }
    dispatch({ type: "collapse" });
    timerRef.current = window.setTimeout(() => {
      timerRef.current = undefined;
      if (!openRef.current) dispatch({ type: "unmount" });
    }, COLLAPSE_COLLAPSE_MS + 50);
  }, [open, instant, clearPending]);

  useEffect(
    () => () => {
      clearPending();
    },
    [clearPending],
  );

  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName !== "grid-template-rows") return;
    if (openRef.current) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    dispatch({ type: "unmount" });
  };

  return (
    <div
      className={`cd-collapse${className ? ` ${className}` : ""}`}
      data-open={state.open ? "" : undefined}
      data-instant={instant ? "" : undefined}
      onTransitionEnd={handleTransitionEnd}
    >
      <div
        className={`cd-collapse-inner${innerClassName ? ` ${innerClassName}` : ""}`}
        aria-hidden={state.open ? undefined : true}
        inert={state.open ? undefined : true}
      >
        {state.mounted
          ? typeof children === "function"
            ? children()
            : children
          : null}
      </div>
    </div>
  );
}
