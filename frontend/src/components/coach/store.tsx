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
  useReducer,
  useRef,
  useState,
} from "react";
import { adoptAthleteDataDemo } from "./athlete-data-demo";
import { adoptAthleteProfileDemo } from "./athlete-profile-demo";
import { adoptClientAppDemo } from "./client-app-demo";
import {
  type CoachState,
  isCoachState,
  type Media,
  type Route,
  STORAGE_KEY,
  seedState,
  type TaskFields,
} from "./model";
import { migrateCoachState } from "./plans/domain";
import { adoptAmaraTrainingExample } from "./plans/training/amara-example";
import { localToday } from "./targets/model";
import {
  type MoveOutcome,
  moveTransition,
  type TaskRefish,
} from "./tasks-model";
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
  toast: (
    text: string,
    undo?: () => void,
    actions?: { label: string; run: () => void }[],
  ) => void;
  notice: {
    text: string;
    undo?: () => void;
    actions?: { label: string; run: () => void }[];
  } | null;
  dismiss: () => void;
  media: Record<string, string>;
  attach: (media: Media, blob: Blob) => void;
  /** Submit a task-move request. The validated write and its outcome are
   * computed on the current workspace and committed together; consumers
   * read the committed outcome back from `moveOutcome`. */
  requestMove: (req: {
    id: number;
    ref: TaskRefish;
    clientId: string | undefined;
    fields?: Partial<TaskFields>;
  }) => void;
  moveOutcome: MoveOutcome | null;
  /** Consume a committed move outcome so the next request's result is
   * never confused with this one. */
  ackMove: (reqId: number) => void;
};
const Context = createContext<Store | null>(null);

type CoachCore = {
  workspace: CoachState;
  moveOutcome: MoveOutcome | null;
};

type CoreAction =
  | { type: "apply"; action: SetStateAction<CoachState> }
  | {
      type: "move";
      req: {
        id: number;
        ref: TaskRefish;
        clientId: string | undefined;
        fields?: Partial<TaskFields>;
      };
    }
  | { type: "ackMove"; reqId: number };

function coachCoreReducer(core: CoachCore, action: CoreAction): CoachCore {
  switch (action.type) {
    case "apply":
      return {
        ...core,
        workspace:
          typeof action.action === "function"
            ? action.action(core.workspace)
            : action.action,
      };
    case "move": {
      // The move, its submitted patch and the outcome that describes them
      // commit as one — the outcome is the result of this exact write,
      // never a prediction.
      const result = moveTransition(core.workspace, action.req);
      return { workspace: result.state, moveOutcome: result.outcome };
    }
    case "ackMove":
      return core.moveOutcome?.reqId === action.reqId
        ? { ...core, moveOutcome: null }
        : core;
  }
}

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
    "module",
    "tab",
    "task",
  ] as const)
    if (route[key]) q.set(key, route[key]);
  return `/coach?${q.toString()}`;
}
export function CoachProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [core, dispatch] = useReducer(coachCoreReducer, undefined, () => ({
    workspace: normalizeTemplateSetups(
      migrateCoachState(seedState()) as CoachState,
    ),
    moveOutcome: null,
  }));
  const state = core.workspace;
  const setState: Dispatch<SetStateAction<CoachState>> = useCallback(
    (action) => dispatch({ type: "apply", action }),
    [],
  );
  const requestMove = useCallback<Store["requestMove"]>(
    (req) => dispatch({ type: "move", req }),
    [],
  );
  const ackMove = useCallback<Store["ackMove"]>(
    (reqId) => dispatch({ type: "ackMove", reqId }),
    [],
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
      section === "tasks" ||
      section === "notes"
        ? section
        : "templates",
    client: params.get("client") ?? undefined,
    editor: params.get("editor") ?? undefined,
    review: params.get("review") ?? undefined,
    plan: params.get("plan") ?? undefined,
    module: params.get("module") ?? undefined,
    tab: params.get("tab") ?? undefined,
    task: params.get("task") ?? undefined,
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
  }, [setState]);
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
    (
      text: string,
      undo?: () => void,
      actions?: { label: string; run: () => void }[],
    ) => setNotice({ text, undo, actions }),
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
        requestMove,
        moveOutcome: core.moveOutcome,
        ackMove,
      }}
    >
      {children}
    </Context.Provider>
  );
}
