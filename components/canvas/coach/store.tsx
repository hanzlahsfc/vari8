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
import { readCoachState, writeCoachState } from "../data";
import { adoptAthleteDataDemo } from "./athlete-data-demo";
import { adoptAthleteProfileDemo } from "./athlete-profile-demo";
import { adoptClientAppDemo } from "./client-app-demo";
import {
  type CoachState,
  isCoachState,
  type Media,
  type Route,
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
  /** PR-MEDIA: the server workspace this canvas renders for (uploads). */
  workspaceId?: string;
  /** PR-MEDIA: canvas client name -> media anchor clientProfileId (roster). */
  clientProfileIdFor: (clientName: string) => Promise<string | null>;
};
const Context = createContext<Store | null>(null);
export function useCoach() {
  const value = useContext(Context);
  if (!value) throw new Error("Coach provider required");
  return value;
}
export function routeUrl(route: Route) {
  const q = new URLSearchParams({ section: route.section });
  for (const key of ["client", "editor", "review", "plan", "tab"] as const)
    if (route[key]) q.set(key, route[key]);
  return `/coach?${q.toString()}`;
}
export function CoachProvider({
  workspaceId,
  children,
}: {
  workspaceId?: string;
  children: ReactNode;
}) {
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
  };
  useEffect(() => {
    try {
      const stored = readCoachState();
      if (stored !== undefined) {
        const parsed: unknown = migrateCoachState(stored);
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
  useEffect(() => {
    if (!hydrated || preserveRaw.current) return;
    try {
      writeCoachState(state);
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
  // PR-MEDIA: name -> clientProfileId map, fetched once per workspace.
  const roster = useRef<Map<string, string> | null>(null);
  const clientProfileIdFor = useCallback(
    async (clientName: string): Promise<string | null> => {
      if (!workspaceId) return null;
      if (!roster.current) {
        try {
          const res = await fetch(
            `/api/v1/workspaces/${workspaceId}/clients?limit=100`,
          );
          // Cache only a successful response: a transient 401/network error
          // must not poison the roster for the rest of the session.
          if (res.ok) {
            const body = (await res.json()) as {
              items?: { clientProfileId: string; name: string }[];
            };
            const map = new Map<string, string>();
            for (const item of body.items ?? [])
              map.set(item.name, item.clientProfileId);
            roster.current = map;
          } else {
            return null;
          }
        } catch {
          return null;
        }
      }
      return roster.current.get(clientName) ?? null;
    },
    [workspaceId],
  );
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
        workspaceId,
        clientProfileIdFor,
      }}
    >
      {children}
    </Context.Provider>
  );
}
