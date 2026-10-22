"use client";

import {
  createContext,
  createElement,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useMemo,
  useState,
} from "react";
import type { TrackerEntry } from "@/components/ethereal/client-tracker/model";
import type { LogSession } from "../logbook-model";
import type {
  ClientSettings,
  DemoTask,
  DemoThread,
  NutritionDay,
} from "./fixtures";
import {
  buildTrackerHistory,
  checkInForm,
  clientPerson,
  clientSettings,
  coachPerson,
  demoAsOf,
  demoTasks,
  homeSummary,
  logbookSessions,
  messageThreads,
  nutritionDays,
  nutritionTargets,
  photoDates,
  supplementPlan,
  trainingPlan,
  trainingSessions,
} from "./fixtures";
import type { DemoMode } from "./state";

export type DemoSlices = {
  home: { summary: typeof homeSummary | null };
  tracker: {
    entries: TrackerEntry[];
    textValues: Record<string, string>;
    comments: Record<string, string>;
  };
  training: {
    plan: typeof trainingPlan | null;
    sessions: typeof trainingSessions;
  };
  logbook: { sessions: LogSession[] };
  nutrition: {
    targets: typeof nutritionTargets | null;
    days: NutritionDay[];
  };
  photos: { dates: string[] };
  messages: { threads: DemoThread[] };
  tasks: { items: DemoTask[] };
  settings: { saved: ClientSettings };
  supplements: { plan: typeof supplementPlan | null };
  checkIn: { form: typeof checkInForm; submittedAt: string | null };
};

export type DemoStore = {
  slices: DemoSlices;
  setSlices: Dispatch<SetStateAction<DemoSlices>>;
  asOf: string;
  client: typeof clientPerson;
  coach: typeof coachPerson;
};

function buildSlices(mode: DemoMode): DemoSlices {
  if (mode === "empty") {
    return {
      home: { summary: null },
      tracker: { entries: [], textValues: {}, comments: {} },
      training: { plan: null, sessions: [] },
      logbook: { sessions: [] },
      nutrition: { targets: null, days: [] },
      photos: { dates: [] },
      messages: { threads: [] },
      tasks: { items: [] },
      settings: { saved: clientSettings },
      supplements: { plan: null },
      checkIn: { form: checkInForm, submittedAt: null },
    };
  }
  const history = buildTrackerHistory();
  return {
    home: { summary: homeSummary },
    tracker: {
      entries: history.entries,
      textValues: history.textValues,
      comments: {},
    },
    training: { plan: trainingPlan, sessions: trainingSessions },
    logbook: { sessions: logbookSessions },
    nutrition: { targets: nutritionTargets, days: nutritionDays },
    photos: { dates: photoDates },
    messages: { threads: messageThreads },
    tasks: { items: demoTasks },
    settings: { saved: clientSettings },
    supplements: { plan: supplementPlan },
    checkIn: { form: checkInForm, submittedAt: null },
  };
}

const DemoStoreContext = createContext<DemoStore | null>(null);

export function DemoStoreProvider({
  mode,
  children,
}: {
  mode: DemoMode;
  children: ReactNode;
}) {
  const [slices, setSlices] = useState<DemoSlices>(() => buildSlices(mode));
  const value = useMemo<DemoStore>(
    () => ({
      slices,
      setSlices,
      asOf: demoAsOf,
      client: clientPerson,
      coach: coachPerson,
    }),
    [slices],
  );
  return createElement(DemoStoreContext.Provider, { value }, children);
}

export function useDemoStore(): DemoStore {
  const store = useContext(DemoStoreContext);
  if (!store) throw new Error("useDemoStore requires DemoStoreProvider");
  return store;
}

export function useDemoSlice<K extends keyof DemoSlices>(
  key: K,
): readonly [DemoSlices[K], (next: SetStateAction<DemoSlices[K]>) => void] {
  const store = useDemoStore();
  const update = (next: SetStateAction<DemoSlices[K]>) => {
    store.setSlices((current) => ({
      ...current,
      [key]:
        typeof next === "function"
          ? (next as (previous: DemoSlices[K]) => DemoSlices[K])(current[key])
          : next,
    }));
  };
  return [store.slices[key], update] as const;
}
