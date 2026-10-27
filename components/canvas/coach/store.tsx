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
import {
  clientDetailKey,
  fetchClientDetailBundle,
  mergeRemoteDetail,
  putClientDetail,
} from "../data/clients";
import { putWorkspaceCoachNotes } from "../data/notes";
import {
  adoptCanvasDemos,
  type CoachState,
  isCoachState,
  type Media,
  type Route,
  seedState,
} from "./model";
import { migrateCoachState } from "./plans/domain";
import { localToday } from "./targets/model";
import { normalizeTemplateSetups } from "./template-setup";

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
  // Card 05a: the Amara fixture set is canvas demo content. It survives for
  // the domains without an endpoint (competition, settings) and only mounts
  // when the url carries `?demo=`; without it the store renders real/stored
  // state only, so fixtures can never leak into a coach's workspace.
  const demo = params.has("demo");
  const [state, setState] = useState<CoachState>(() =>
    normalizeTemplateSetups(
      migrateCoachState(seedState({ demo })) as CoachState,
    ),
  );
  const [hydrated, setHydrated] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [notice, setNotice] = useState<Store["notice"]>(null);
  const [media, setMedia] = useState<Record<string, string>>({});
  const preserveRaw = useRef(false);
  // W2-A1: the client-detail domain (phases, internalNotes, generalNotes,
  // weekNotes, the note pin flag) plus the workspace note list are remote.
  // This ref tracks, per canvas client id, the backend profile id and the
  // last synced content key so local edits reconcile back to the server
  // exactly once per change.
  const detailSync = useRef<{
    loaded: boolean;
    loading: boolean;
    clients: Map<string, { clientProfileId: string; key: string }>;
    notesKey: string | null;
  }>({ loaded: false, loading: false, clients: new Map(), notesKey: null });
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
              (demo ? adoptCanvasDemos(parsed, localToday()) : parsed) as CoachState,
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
  }, [demo]);
  useEffect(() => {
    if (!hydrated || preserveRaw.current) return;
    try {
      writeCoachState(state);
      setStorageOk(true);
    } catch {
      setStorageOk(false);
    }
  }, [state, hydrated]);
  // W2-A1 hydration: after the seed + local merge, fetch the workspace
  // detail bundle once and fold it into the matched client records. The
  // roster-wide reseed stays in coach/model.ts (out of this lane's
  // ownership); matching is by name, the same key the roster map uses.
  useEffect(() => {
    const sync = detailSync.current;
    if (!hydrated || demo || !workspaceId || preserveRaw.current) return;
    if (sync.loaded || sync.loading) return;
    sync.loading = true;
    let cancelled = false;
    fetchClientDetailBundle(workspaceId)
      .then((bundle) => {
        if (cancelled) return;
        const matched = new Map<string, (typeof bundle.clients)[number]>();
        setState((s) => ({
          ...s,
          coachNotes: bundle.workspaceNotes.map((n) => ({
            id: n.id,
            text: n.text,
          })),
          clients: s.clients.map((c) => {
            const detail = bundle.clients.find((d) => d.name === c.name);
            if (!detail) return c;
            matched.set(c.id, detail);
            return mergeRemoteDetail(c, detail);
          }),
        }));
        for (const [clientId, detail] of matched) {
          sync.clients.set(clientId, {
            clientProfileId: detail.clientProfileId,
            key: clientDetailKey(detail),
          });
        }
        sync.notesKey = JSON.stringify(
          bundle.workspaceNotes.map((n) => ({ id: n.id, text: n.text })),
        );
        sync.loaded = true;
        sync.loading = false;
      })
      .catch(() => {
        if (cancelled) return;
        sync.loading = false;
        setNotice({ text: "Client details could not be loaded." });
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, demo, workspaceId]);
  // W2-A1 write-back: any local change to the owned fields of a matched
  // client, or to the workspace note list, PUTs the reconciled collection.
  // Edits to clients that never matched a backend profile stay local.
  useEffect(() => {
    const sync = detailSync.current;
    if (!hydrated || demo || !workspaceId || !sync.loaded) return;
    for (const c of state.clients) {
      const rec = sync.clients.get(c.id);
      if (!rec) continue;
      const key = clientDetailKey(c);
      if (key === rec.key) continue;
      rec.key = key;
      putClientDetail(workspaceId, rec.clientProfileId, c).catch(() => {
        rec.key = "";
        setNotice({ text: "Client changes could not be saved." });
      });
    }
    const notes = state.coachNotes ?? [];
    const notesKey = JSON.stringify(notes);
    if (sync.notesKey !== null && sync.notesKey !== notesKey) {
      sync.notesKey = notesKey;
      putWorkspaceCoachNotes(workspaceId, notes).catch(() => {
        sync.notesKey = "";
        setNotice({ text: "Note changes could not be saved." });
      });
    }
  }, [state, hydrated, demo, workspaceId]);
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
