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
  useRef,
  useState,
} from "react";
import { adoptAthleteProfileDemo } from "./athlete-profile-demo";
import { adoptClientAppDemo } from "./client-app-demo";
import {
  type CoachState,
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

type Store = {
  state: CoachState;
  setState: Dispatch<SetStateAction<CoachState>>;
  hydrated: boolean;
  storageOk: boolean;
  route: Route;
  navigate: (route: Route) => void;
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
export function routeUrl(route: Route) {
  const q = new URLSearchParams({ section: route.section });
  for (const key of [
    "client",
    "editor",
    "review",
    "plan",
    "tab",
    "templateSection",
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
      section === "notes"
        ? section
        : "templates",
    client: params.get("client") ?? undefined,
    editor: params.get("editor") ?? undefined,
    review: params.get("review") ?? undefined,
    plan: params.get("plan") ?? undefined,
    tab: params.get("tab") ?? undefined,
    templateSection: params.get("templateSection") ?? undefined,
  };
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = migrateCoachState(JSON.parse(raw));
        if (isCoachState(parsed))
          setState(
            normalizeTemplateSetups(
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
