"use client";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { adoptAthleteDataDemo } from "./athlete-data-demo";
import { adoptAthleteProfileDemo } from "./athlete-profile-demo";
import { adoptClientAppDemo } from "./client-app-demo";
import {
  type CoachState,
  type DisplayConfig,
  displayConfigFor,
  formatClock,
  formatDate,
  isCoachState,
  type Media,
  type Route,
  STORAGE_KEY,
  seedState,
} from "./model";
import { migrateCoachState } from "./plans/domain";
import { adoptAmaraTrainingExample } from "./plans/training/amara-example";
import { localToday } from "./targets/model";
import { normalizeTemplateSetups } from "./template-setup";
import { adoptTrainingLogDemo } from "./training-log-demo";

/** Workspace-scoped display settings plus bound formatters; every render
 * uses the active workspace's region, so edits, resets and workspace
 * switches apply immediately without module-global state. */
export type Display = DisplayConfig & {
  formatDate: (date: string, options?: Intl.DateTimeFormatOptions) => string;
  formatClock: (hhmm: string, hourCycle?: "12" | "24") => string;
};
type Store = {
  state: CoachState;
  setState: Dispatch<SetStateAction<CoachState>>;
  hydrated: boolean;
  storageOk: boolean;
  route: Route;
  navigate: (route: Route) => void;
  display: Display;
  /** Shared clock ticking once per displayed minute; deadline status and
   * feedback countdowns re-render on open screens without a timer per
   * row. Refreshes immediately when a background tab resumes. */
  now: Date;
  guard: React.MutableRefObject<((route: Route) => boolean) | null>;
  toast: (text: string, undo?: () => void) => void;
  notice: { text: string; undo?: () => void } | null;
  dismiss: () => void;
  media: Record<string, string>;
  attach: (media: Media, blob: Blob) => void;
};
const Context = createContext<Store | null>(null);
export function useCoach() {
  const value = useContext(Context);
  if (!value) throw new Error("Coach provider required");
  return value;
}
export function useDisplay() {
  return useCoach().display;
}
export function useCoachNow() {
  return useCoach().now;
}
export function routeUrl(route: Route) {
  const q = new URLSearchParams({ section: route.section });
  for (const key of [
    "client",
    "editor",
    "review",
    "plan",
    "module",
    "tab",
  ] as const)
    if (route[key]) q.set(key, route[key]);
  return `/coach?${q.toString()}`;
}
export function CoachProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<CoachState>(() =>
    normalizeTemplateSetups(migrateCoachState(seedState()) as CoachState),
  );
  const [hydrated, setHydrated] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [notice, setNotice] = useState<Store["notice"]>(null);
  const [media, setMedia] = useState<Record<string, string>>({});
  const preserveRaw = useRef(false);
  const urls = useRef(new Set<string>());
  const guard = useRef<((route: Route) => boolean) | null>(null);
  const section = params.get("section");
  const route: Route = {
    section:
      section === "clients" ||
      section === "check-ins" ||
      section === "messages" ||
      section === "notes" ||
      section === "settings"
        ? section
        : "templates",
    client: params.get("client") ?? undefined,
    editor: params.get("editor") ?? undefined,
    review: params.get("review") ?? undefined,
    plan: params.get("plan") ?? undefined,
    module: params.get("module") ?? undefined,
    tab: params.get("tab") ?? undefined,
  };
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = migrateCoachState(JSON.parse(raw));
        if (isCoachState(parsed))
          setState(
            normalizeTemplateSetups(
              adoptAthleteDataDemo(
                adoptAthleteProfileDemo(
                  adoptTrainingLogDemo(
                    adoptClientAppDemo(
                      adoptAmaraTrainingExample(parsed),
                      localToday(),
                    ),
                    localToday(),
                  ),
                  localToday(),
                ),
                localToday(),
              ),
            ),
          );
        else {
          preserveRaw.current = true;
          setStorageOk(false);
          setNotice({
            text: "Saved workspace could not be read. Its original data is preserved. You can continue in this session.",
          });
        }
      }
    } catch {
      preserveRaw.current = true;
      setStorageOk(false);
      setNotice({
        text: "Saved workspace is unavailable. Original data is preserved; edits are session-only.",
      });
    }
    setHydrated(true);
  }, []);
  const display = useMemo<Display>(() => {
    const config = displayConfigFor(state.preferences);
    return {
      ...config,
      formatDate: (date, options) => formatDate(date, options, config),
      formatClock: (hhmm, hourCycle) =>
        formatClock(hhmm, hourCycle ?? config.hourCycle),
    };
  }, [state.preferences]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      setNow(new Date());
      // Re-arm to just past the next minute boundary so deadline cut-offs
      // cross exactly on the minute rather than a fixed interval.
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 250);
    };
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 250);
    const resume = () => {
      if (!document.hidden) setNow(new Date());
    };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  useEffect(() => {
    if (!hydrated || preserveRaw.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStorageOk(true);
    } catch {
      setStorageOk(false);
    }
  }, [state, hydrated]);
  useEffect(() => {
    const all = urls.current;
    return () => {
      for (const url of all) URL.revokeObjectURL(url);
    };
  }, []);
  const navigate = useCallback(
    (next: Route) => {
      if (guard.current && !guard.current(next)) return;
      router.push(routeUrl(next), { scroll: false });
    },
    [router],
  );
  const toast = useCallback(
    (text: string, undo?: () => void) => setNotice({ text, undo }),
    [],
  );
  const attach = useCallback((item: Media, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    setMedia((old) => {
      if (old[item.id]) {
        URL.revokeObjectURL(old[item.id]);
        urls.current.delete(old[item.id]);
      }
      return { ...old, [item.id]: url };
    });
  }, []);
  return (
    <Context.Provider
      value={{
        state,
        setState,
        hydrated,
        storageOk,
        route,
        display,
        now,
        navigate,
        guard,
        toast,
        notice,
        dismiss: () => setNotice(null),
        media,
        attach,
      }}
    >
      {children}
    </Context.Provider>
  );
}
