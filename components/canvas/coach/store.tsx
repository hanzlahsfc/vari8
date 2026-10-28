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
import { loadCheckins, mergeCheckinLoad } from "../data/checkins";
import { ApiClientError } from "../data/http";
import {
  draftWireToMealPlan,
  fetchStaffIifymPlan,
  fetchStaffMealPlan,
  fetchStaffMealPlanVersion,
  iifymDraftWireToPlan,
  iifymPlanToDraftWire,
  type MealPlanDraftWire,
  mealPlanToDraftWire,
  publishStaffIifym,
  publishStaffMealPlan,
  saveStaffIifymDraft,
  saveStaffMealPlanDraft,
} from "../data/nutrition";
import {
  loadPhysiquePhotos,
  type PhysiqueColumn,
} from "../data/progress-photos";
import {
  canvasTrainingToDraftWire,
  draftWireToCanvasOverrides,
  fetchExerciseLibrary,
  fetchStaffTrainingProgram,
  fetchStaffTrainingPrograms,
  fetchStaffTrainingProgramVersion,
  materializedWireToCanvasOverrides,
  preserveLockedWeeks,
  publishStaffTrainingProgram,
  saveStaffTrainingProgramDraft,
  TRAINING_FIELD_CONFIG,
  type TrainingDraftWire,
} from "../data/training";
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
import {
  emptyClientPlans,
  type IifymPlan,
  type PlanLifecycle,
  type PlanVersion,
  type TrainingPlan,
} from "./plans/types";
import type { MealPlan } from "../ethereal/mealplan/model";
import {
  deleteStaffTrackerNote,
  fetchStaffTrackerValues,
  mergeStaffTracking,
  putStaffTrackerNote,
  staffNoteKeyToWire,
  staffNoteText,
  staffTrackerToTracking,
} from "../data/tracker";
import {
  fetchStaffTrainingLogs,
  staffLogToSessionLog,
} from "../data/training-logs";
import { addLocalDays, localToday } from "./targets/model";
import { normalizeTemplateSetups } from "./template-setup";

/* -------------------------------------------------------------------------
 * W2-A2 backend hydration + draft sync for the viewed client's plans.
 *
 * model.ts owns the roster-wide seed and is outside this lane, so the
 * override point lives here: after the seed/local hydration runs, the
 * effect below re-reads the viewed client's plan lifecycles and the
 * workspace exercise library from `/api/v1` and folds them into state.
 * A second debounced effect writes draft changes back (PUT .../meal-plans,
 * .../iifym-plans, .../training-programs) and mints a published version
 * when the lifecycle marks the synced draft active.
 *
 * Sync bookkeeping is keyed by canvas client id; `revision` is the CAS
 * counter the last fetch/save returned and `json` is the canonical draft
 * payload that revision holds.
 * ---------------------------------------------------------------------- */

type PlanSync = {
  id: string | null;
  revision: number;
  /** Canonical draft body as last written (or hydrated). */
  json: string;
  /** Canonical program-level fields the draft PUT carries outside the
   * draft body (title, startDate, weekCount): without them a rename or
   * length change never reaches the server. */
  meta: string;
  /** Raw draft wire last read/written (training only) plus the locked-week
   * count: saves re-apply stored entries verbatim at locked weeks so the
   * backend's past_week_locked byte-identity check passes. */
  raw: unknown;
  ceiling: number;
  activeVersionId: string | null;
};

type ClientPlansSync = {
  mealPlan: PlanSync;
  iifym: PlanSync;
  training: PlanSync;
};

const emptyPlanSync = (): PlanSync => ({
  id: null, revision: 0, json: "", meta: "", raw: null, ceiling: 0, activeVersionId: null,
});

const emptySync = (): ClientPlansSync => ({
  mealPlan: emptyPlanSync(),
  iifym: emptyPlanSync(),
  training: emptyPlanSync(),
});

/** Staff reads fail closed: a client with no plan row reads as
 * `plan_not_accessible`, which the canvas renders as an empty lifecycle. */
const isNoPlan = (error: unknown): boolean =>
  error instanceof ApiClientError && error.code === "plan_not_accessible";

const canon = (value: unknown): string => JSON.stringify(value);

const browserTimezone = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};

type CanvasClient = CoachState["clients"][number];

/** Meal plan lifecycle <- staff read + per-version payload reads. */
async function loadMealPlanLifecycle(
  workspaceId: string,
  clientProfileId: string,
  clientId: string,
  fallback?: Pick<MealPlan, "archivedPlans" | "reusableMeals">,
): Promise<{ lifecycle: PlanLifecycle<MealPlan>; sync: PlanSync }> {
  let view;
  try {
    view = await fetchStaffMealPlan(workspaceId, clientProfileId);
  } catch (error) {
    if (isNoPlan(error))
      return { lifecycle: { history: [] }, sync: emptyPlanSync() };
    throw error;
  }
  if (!view.plan)
    return { lifecycle: { history: [] }, sync: emptyPlanSync() };
  const meta = { clientId, title: view.plan.title };
  const draft = view.plan.draft
    ? draftWireToMealPlan(
        view.plan.draft as MealPlanDraftWire,
        { id: view.plan.id, ...meta },
        fallback,
      )
    : undefined;
  const lifecycle: PlanLifecycle<MealPlan> = { draft, history: [] };
  const ordered = view.versions;
  for (const [index, header] of ordered.entries()) {
    const detail = await fetchStaffMealPlanVersion(
      workspaceId,
      clientProfileId,
      header.id,
    );
    const content = draftWireToMealPlan(
      detail.payload as MealPlanDraftWire,
      { id: detail.id, ...meta },
      fallback,
    );
    const version: PlanVersion<MealPlan> = {
      id: detail.id,
      content,
      activatedAt: detail.effectiveDate,
      archivedOn:
        header.id === view.currentVersionId
          ? undefined
          : (ordered[index - 1]?.effectiveDate ?? detail.publishedAt),
    };
    if (header.id === view.currentVersionId) lifecycle.active = version;
    else lifecycle.history.push(version);
  }
  return {
    lifecycle,
    sync: {
      id: view.plan.id,
      revision: view.plan.draftRevision,
      json: canon(draft ? mealPlanToDraftWire(draft) : null),
      meta: canon({ title: view.plan.title }),
      raw: null,
      ceiling: 0,
      activeVersionId: view.currentVersionId,
    },
  };
}

/** IIFYM lifecycle <- staff read. The service exposes no staff version
 * detail read (W2-A2 boundary note), so version CONTENT resolves from the
 * shared draft: publish freezes the draft, so the shapes agree at publish
 * time; a stale draft after a later edit mislabels content until the next
 * draft save, which the card records as the resolution. */
async function loadIifymLifecycle(
  workspaceId: string,
  clientProfileId: string,
  clientId: string,
): Promise<{ lifecycle: PlanLifecycle<IifymPlan>; sync: PlanSync }> {
  let view;
  try {
    view = await fetchStaffIifymPlan(workspaceId, clientProfileId);
  } catch (error) {
    if (isNoPlan(error))
      return { lifecycle: { history: [] }, sync: emptyPlanSync() };
    throw error;
  }
  if (!view.plan)
    return { lifecycle: { history: [] }, sync: emptyPlanSync() };
  const meta = { clientId, title: view.plan.title };
  const draft = view.plan.draft
    ? iifymDraftWireToPlan(view.plan.draft, { id: view.plan.id, ...meta })
    : undefined;
  const lifecycle: PlanLifecycle<IifymPlan> = { draft, history: [] };
  const ordered = view.versions;
  for (const [index, header] of ordered.entries()) {
    const version: PlanVersion<IifymPlan> = {
      id: header.id,
      content: iifymDraftWireToPlan(view.plan.draft, {
        id: header.id,
        ...meta,
      }),
      activatedAt: header.effectiveDate,
      archivedOn:
        header.id === view.currentVersionId
          ? undefined
          : (ordered[index - 1]?.effectiveDate ?? header.publishedAt),
    };
    if (header.id === view.currentVersionId) lifecycle.active = version;
    else lifecycle.history.push(version);
  }
  return {
    lifecycle,
    sync: {
      id: view.plan.id,
      revision: view.plan.draftRevision,
      json: canon(draft ? iifymPlanToDraftWire(draft) : null),
      meta: canon({ title: view.plan.title }),
      raw: null,
      ceiling: 0,
      activeVersionId: view.currentVersionId,
    },
  };
}

/** Training lifecycle <- program list + detail + per-version payload. */
async function loadTrainingLifecycle(
  workspaceId: string,
  clientProfileId: string,
  clientId: string,
): Promise<{ lifecycle: PlanLifecycle<TrainingPlan>; sync: PlanSync }> {
  let list;
  try {
    list = await fetchStaffTrainingPrograms(workspaceId, clientProfileId);
  } catch (error) {
    if (isNoPlan(error))
      return { lifecycle: { history: [] }, sync: emptyPlanSync() };
    throw error;
  }
  const live =
    list.programs.find((p) => p.state === "current") ??
    list.programs.find((p) => p.state === "pending") ??
    list.programs.find((p) => p.state === "draft") ??
    list.programs.find(
      (p) => p.state !== "cancelled" && p.state !== "dead",
    ) ??
    null;
  if (!live)
    return { lifecycle: { history: [] }, sync: emptyPlanSync() };
  const detail = await fetchStaffTrainingProgram(
    workspaceId,
    clientProfileId,
    live.programId,
  );
  const program = detail.program;
  const base = {
    clientId,
    name: program.title,
    startDate: program.startDate,
    program: (program.programMode === "EVERGREEN"
      ? "Evergreen"
      : "Week-based") as TrainingPlan["program"],
    weeks: program.weekCount,
  };
  const draft: TrainingPlan = {
    id: program.id,
    ...base,
    overrides: draftWireToCanvasOverrides(program.draft, program.weekCount),
  };
  const lifecycle: PlanLifecycle<TrainingPlan> = { draft, history: [] };
  const ordered = detail.versions;
  for (const [index, header] of ordered.entries()) {
    const version = await fetchStaffTrainingProgramVersion(
      workspaceId,
      clientProfileId,
      program.id,
      header.id,
    );
    const content: TrainingPlan = {
      id: version.id,
      clientId,
      name: program.title,
      startDate: version.payload.startDate,
      program:
        version.payload.programMode === "EVERGREEN"
          ? "Evergreen"
          : "Week-based",
      weeks: version.payload.weekCount,
      overrides: materializedWireToCanvasOverrides(version.payload),
    };
    const entry: PlanVersion<TrainingPlan> = {
      id: version.id,
      content,
      activatedAt: version.effectiveDate,
      archivedOn:
        header.label === "current"
          ? undefined
          : (ordered[index - 1]?.effectiveDate ?? version.publishedAt),
    };
    if (header.label === "current") lifecycle.active = entry;
    else lifecycle.history.push(entry);
  }
  return {
    lifecycle,
    sync: {
      id: program.id,
      revision: program.draftRevision,
      json: canon(canvasTrainingToDraftWire(draft)),
      meta: canon({
        title: program.title,
        startDate: program.startDate,
        weekCount: program.weekCount,
      }),
      raw: program.draft,
      ceiling: program.ceiling ?? 0,
      activeVersionId:
        detail.versions.find((v) => v.label === "current")?.id ?? null,
    },
  };
}

/** Push one client's plan drafts (and new activations) to the backend. */
async function syncClientPlans(
  workspaceId: string,
  clientProfileId: string,
  client: CanvasClient,
  sync: ClientPlansSync,
): Promise<ClientPlansSync> {
  const next: ClientPlansSync = {
    mealPlan: { ...sync.mealPlan },
    iifym: { ...sync.iifym },
    training: { ...sync.training },
  };
  const timezone = browserTimezone();
  const nutrition = client.plans?.nutrition;
  const meal = nutrition?.mealPlan;
  if (meal?.draft) {
    const wire = mealPlanToDraftWire(meal.draft);
    const json = canon(wire);
    const meta = canon({ title: meal.draft.name });
    if (json !== next.mealPlan.json || meta !== next.mealPlan.meta) {
      const saved = await saveStaffMealPlanDraft(workspaceId, clientProfileId, {
        expectedRevision: next.mealPlan.revision,
        title: meal.draft.name || "Nutrition plan",
        draft: wire,
        timezone,
      });
      next.mealPlan.id = saved.planId;
      next.mealPlan.revision = saved.revision;
      next.mealPlan.json = json;
      next.mealPlan.meta = meta;
    }
    if (
      meal.active &&
      canon(mealPlanToDraftWire(meal.active.content)) === next.mealPlan.json &&
      next.mealPlan.revision >= 1 &&
      meal.active.id !== next.mealPlan.activeVersionId
    ) {
      const published = await publishStaffMealPlan(
        workspaceId,
        clientProfileId,
        {
          expectedRevision: next.mealPlan.revision,
          effectiveDate:
            meal.active.activatedAt?.slice(0, 10) ||
            meal.draft.startDate ||
            localToday(),
        },
      );
      next.mealPlan.activeVersionId = published.versionId;
    }
  }
  const iifym = nutrition?.iifym;
  if (iifym?.draft) {
    const wire = iifymPlanToDraftWire(iifym.draft);
    const json = canon(wire);
    const meta = canon({ title: iifym.draft.name });
    if (json !== next.iifym.json || meta !== next.iifym.meta) {
      const saved = await saveStaffIifymDraft(workspaceId, clientProfileId, {
        expectedRevision: next.iifym.revision,
        title: iifym.draft.name || "IIFYM targets",
        draft: wire,
        timezone,
      });
      next.iifym.id = saved.planId;
      next.iifym.revision = saved.revision;
      next.iifym.json = json;
      next.iifym.meta = meta;
    }
    if (
      iifym.active &&
      canon(iifymPlanToDraftWire(iifym.active.content)) === next.iifym.json &&
      next.iifym.revision >= 1 &&
      iifym.active.id !== next.iifym.activeVersionId
    ) {
      const published = await publishStaffIifym(workspaceId, clientProfileId, {
        expectedRevision: next.iifym.revision,
        effectiveDate:
          iifym.active.activatedAt?.slice(0, 10) ||
          iifym.draft.startDate ||
          localToday(),
      });
      next.iifym.activeVersionId = published.versionId;
    }
  }
  const training = client.plans?.training;
  if (training?.draft) {
    const wire = canvasTrainingToDraftWire(training.draft);
    const json = canon(wire);
    const meta = canon({
      title: training.draft.name,
      startDate: training.draft.startDate,
      weekCount: training.draft.weeks,
    });
    if (json !== next.training.json || meta !== next.training.meta) {
      // past_week_locked is a byte-identity check: re-apply the stored
      // boundary entries at locked weeks; the canvas rebuild stands for
      // the editable ones.
      const outgoing = preserveLockedWeeks(
        next.training.raw as TrainingDraftWire | null,
        wire,
        next.training.ceiling,
      );
      const saved = await saveStaffTrainingProgramDraft(
        workspaceId,
        clientProfileId,
        {
          programId: next.training.id ?? undefined,
          expectedRevision: next.training.revision,
          title: training.draft.name || "Training program",
          startDate: training.draft.startDate || undefined,
          weekCount: training.draft.weeks || undefined,
          fieldConfig: TRAINING_FIELD_CONFIG,
          timezone,
          draft: outgoing,
        },
      );
      next.training.id = saved.programId;
      next.training.revision = saved.revision;
      next.training.json = json;
      next.training.meta = meta;
      next.training.raw = outgoing;
    }
    if (
      training.active &&
      next.training.id &&
      canon(canvasTrainingToDraftWire(training.active.content)) ===
        next.training.json &&
      next.training.revision >= 1 &&
      training.active.id !== next.training.activeVersionId
    ) {
      const published = await publishStaffTrainingProgram(
        workspaceId,
        clientProfileId,
        next.training.id,
        {
          expectedRevision: next.training.revision,
          effectiveDate:
            training.active.activatedAt?.slice(0, 10) ||
            training.draft.startDate ||
            localToday(),
        },
      );
      next.training.activeVersionId = published.versionId;
    }
  }
  return next;
}

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
  /** W2-A3: the client's backend progress photos as compare columns. */
  physiquePhotosFor: (clientName: string) => Promise<PhysiqueColumn[]>;
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
  // The fetch is lazy on the surfaces that consume it (clients and notes):
  // firing it on every mount spends a staff read on screens that never
  // render the bundle and surfaces an unrelated error banner when it fails.
  useEffect(() => {
    const sync = detailSync.current;
    if (!hydrated || demo || !workspaceId || preserveRaw.current) return;
    if (route.section !== "clients" && route.section !== "notes") return;
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
  }, [hydrated, demo, workspaceId, route.section]);
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
  // W2-A3: compare-column read for the viewed client's progress photos.
  const physiquePhotosFor = useCallback(
    async (clientName: string): Promise<PhysiqueColumn[]> => {
      if (!workspaceId) return [];
      const clientProfileId = await clientProfileIdFor(clientName);
      if (!clientProfileId) return [];
      return loadPhysiquePhotos(workspaceId, clientProfileId);
    },
    [workspaceId, clientProfileIdFor],
  );
  // W2-A2: latest-state ref so the async plan effects read the current
  // store without re-firing on every state change.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const plansHydrated = useRef(new Set<string>());
  const plansSynced = useRef(new Map<string, ClientPlansSync>());
  // Exercise library: one fetch per workspace, lazy on the first client
  // view (staff-scoped read; the roster screens never need it).
  const libraryFetched = useRef(false);
  useEffect(() => {
    if (
      !hydrated ||
      !workspaceId ||
      demo ||
      !route.client ||
      libraryFetched.current
    )
      return;
    libraryFetched.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const items = await fetchExerciseLibrary(workspaceId);
        if (!cancelled)
          setState((current) => ({ ...current, exerciseLibrary: items }));
      } catch {
        libraryFetched.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, workspaceId, demo, route.client]);
  // Viewed-client plan hydration after the seed + local merge ran.
  useEffect(() => {
    if (!hydrated || !workspaceId || demo || !route.client) return;
    const clientId = route.client;
    if (plansHydrated.current.has(clientId)) return;
    let cancelled = false;
    void (async () => {
      const client = stateRef.current.clients.find((c) => c.id === clientId);
      if (!client) return;
      try {
        const clientProfileId = await clientProfileIdFor(client.name);
        if (!clientProfileId || cancelled) return;
        const [mealPlan, iifym, training] = await Promise.all([
          loadMealPlanLifecycle(workspaceId, clientProfileId, clientId, {
            archivedPlans:
              client.plans?.nutrition.mealPlan.draft?.archivedPlans ?? [],
            reusableMeals:
              client.plans?.nutrition.mealPlan.draft?.reusableMeals ?? [],
          }),
          loadIifymLifecycle(workspaceId, clientProfileId, clientId),
          loadTrainingLifecycle(workspaceId, clientProfileId, clientId),
        ]);
        if (cancelled) return;
        plansHydrated.current.add(clientId);
        plansSynced.current.set(clientId, {
          mealPlan: mealPlan.sync,
          iifym: iifym.sync,
          training: training.sync,
        });
        setState((current) => ({
          ...current,
          clients: current.clients.map((c) =>
            c.id === clientId
              ? {
                  ...c,
                  plans: {
                    ...(c.plans ?? emptyClientPlans()),
                    nutrition: {
                      ...((c.plans ?? emptyClientPlans()).nutrition),
                      mealPlan: mealPlan.lifecycle,
                      iifym: iifym.lifecycle,
                    },
                    training: training.lifecycle,
                  },
                }
              : c,
          ),
        }));
      } catch {
        // Backend unreachable or denied: keep the seeded lifecycle and
        // let the sync effect surface write failures instead.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, workspaceId, demo, route.client, clientProfileIdFor]);
  // W2-A3: viewed-client check-in hydration after the seed + local merge
  // ran. The profile Check-ins tab and the Overview Check-in card both
  // render `state.submissions`/`client.schedules`; this is the load that
  // makes them backend rows instead of local seeds. The merge names every
  // other client as "failed" so their rows survive the patch untouched.
  const checkinsHydrated = useRef(new Set<string>());
  useEffect(() => {
    if (!hydrated || !workspaceId || demo || !route.client) return;
    const clientId = route.client;
    if (checkinsHydrated.current.has(clientId)) return;
    let cancelled = false;
    void (async () => {
      const client = stateRef.current.clients.find((c) => c.id === clientId);
      if (!client) return;
      try {
        const today = localToday();
        const loaded = await loadCheckins({
          workspaceId,
          // The instances read is bounded at 95 days; this window covers
          // the Overview card (-21/+35) plus margin for the tab history.
          from: addLocalDays(today, -42),
          to: addLocalDays(today, 42),
          clients: [{ id: client.id, name: client.name }],
          profileIdFor: clientProfileIdFor,
        });
        if (cancelled || loaded.failed.includes(client.name)) return;
        checkinsHydrated.current.add(clientId);
        setState((s) => {
          const merged = mergeCheckinLoad(
            { extras: s.extras, submissions: s.submissions },
            { extras: loaded.extras, submissions: loaded.submissions },
            s.clients.filter((c) => c.id !== clientId).map((c) => c.id),
          );
          return {
            ...s,
            extras: merged.extras,
            submissions: merged.submissions,
            clients: s.clients.map((c) =>
              c.id === clientId && loaded.schedules[c.id]
                ? { ...c, schedules: loaded.schedules[c.id] }
                : c,
            ),
          };
        });
      } catch {
        // Backend unreachable or denied: the seeded state stays.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, workspaceId, demo, route.client, clientProfileIdFor]);
  // Debounced draft sync: PUT the viewed client's drafts on change and
  // publish when the lifecycle marks the synced draft active.
  useEffect(() => {
    if (!hydrated || !workspaceId || demo || !route.client) return;
    const clientId = route.client;
    const client = state.clients.find((c) => c.id === clientId);
    if (!client || !plansHydrated.current.has(clientId)) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const clientProfileId = await clientProfileIdFor(client.name);
          if (!clientProfileId) return;
          const previous = plansSynced.current.get(clientId) ?? emptySync();
          const next = await syncClientPlans(
            workspaceId,
            clientProfileId,
            client,
            previous,
          );
          plansSynced.current.set(clientId, next);
        } catch {
          plansHydrated.current.delete(clientId);
          setNotice({ text: "Plan changes could not be saved." });
        }
      })();
    }, 800);
    return () => clearTimeout(timer);
  }, [state, hydrated, workspaceId, demo, route.client, clientProfileIdFor]);

  /* ------------------------------------------------------------------
   * W2-FE2 tracker hydration + note sync for the viewed client.
   *
   * Signed-in (non-demo) path: the Tracker tab's values, texts and coach
   * notes come from the server, not the local draft slice. One effect
   * hydrates `client.tracking` and the client's session logs; it runs
   * only while the viewed client's route is on the Tracker tab so the
   * profile overview and onboarding surfaces never fetch tracker data.
   * A second debounced effect diffs the `note:*`/`coach-note` text keys
   * against the last synced baseline and PUTs/DELETEs the tracker-notes
   * route once hydration has armed it.
   * ------------------------------------------------------------------ */
  const trackingHydrated = useRef(new Set<string>());
  const trackingNotesSynced = useRef(new Map<string, Record<string, string>>());
  const trackingParamKeys = useRef(new Map<string, Record<string, string>>());
  const noteSyncChain = useRef(new Map<string, Promise<void>>());
  useEffect(() => {
    if (
      !hydrated ||
      !workspaceId ||
      demo ||
      !route.client ||
      route.tab !== "Tracker"
    )
      return;
    const clientId = route.client;
    if (trackingHydrated.current.has(clientId)) return;
    let cancelled = false;
    void (async () => {
      const client = stateRef.current.clients.find((c) => c.id === clientId);
      if (!client) return;
      try {
        const clientProfileId = await clientProfileIdFor(client.name);
        if (!clientProfileId || cancelled) return;
        // Notes the user edits while the fetch is in flight must survive the
        // merge; the delta over this snapshot is re-applied after it.
        const beforeNotes = staffNoteText(client.tracking?.text ?? {});
        const [values, logs] = await Promise.all([
          fetchStaffTrackerValues(workspaceId, clientProfileId),
          fetchStaffTrainingLogs(workspaceId, clientProfileId),
        ]);
        if (cancelled) return;
        const hydration = staffTrackerToTracking(values);
        // Arm sync only when a server baseline exists; a non-ready state
        // (consent_missing) must not push local notes with no baseline.
        if (hydration) {
          trackingHydrated.current.add(clientId);
          trackingParamKeys.current.set(clientId, hydration.parameterKeys);
          trackingNotesSynced.current.set(clientId, hydration.noteText);
        }
        const remoteLogs = logs.logs
          .filter((log) => log.status !== "SKIPPED")
          .map((log) => staffLogToSessionLog(log, clientId));
        const remoteLogIds = new Set(remoteLogs.map((log) => log.id));
        setState((current) => ({
          ...current,
          clients: current.clients.map((c) => {
            if (c.id !== clientId || !hydration) return c;
            const merged = mergeStaffTracking(c.tracking, hydration);
            const now = staffNoteText(c.tracking?.text ?? {});
            for (const [key, body] of Object.entries(now))
              if (beforeNotes[key] !== body) merged.text[key] = body;
            for (const key of Object.keys(beforeNotes))
              if (!(key in now)) delete merged.text[key];
            return { ...c, tracking: merged };
          }),
          trainingLogs: [
            ...(current.trainingLogs ?? []).filter(
              (log) => !(log.clientId === clientId && remoteLogIds.has(log.id)),
            ),
            ...remoteLogs,
          ],
        }));
      } catch {
        trackingHydrated.current.delete(clientId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    hydrated,
    workspaceId,
    demo,
    route.client,
    route.tab,
    clientProfileIdFor,
  ]);

  useEffect(() => {
    if (!hydrated || !workspaceId || demo || !route.client) return;
    const clientId = route.client;
    const client = state.clients.find((c) => c.id === clientId);
    if (!client || !trackingHydrated.current.has(clientId)) return;
    const timer = setTimeout(() => {
      // Serialize per client: each pass diffs the newest baseline after the
      // previous run resolves, so overlapping debounces cannot reorder two
      // writes to the same key.
      const chain = noteSyncChain.current.get(clientId) ?? Promise.resolve();
      const next = chain.then(async () => {
        try {
          const clientProfileId = await clientProfileIdFor(client.name);
          if (!clientProfileId) return;
          const baseline = trackingNotesSynced.current.get(clientId) ?? {};
          const current = staffNoteText(
            stateRef.current.clients.find((c) => c.id === clientId)?.tracking
              ?.text ?? {},
          );
          const parameterKeys =
            trackingParamKeys.current.get(clientId) ?? {};
          // The baseline advances only past keys whose write resolved, so a
          // failed note retries on the next pass instead of being dropped.
          const synced = { ...baseline };
          try {
            for (const [key, body] of Object.entries(current)) {
              if (synced[key] === body) continue;
              const wire = staffNoteKeyToWire(key, parameterKeys);
              if (!wire) continue;
              await putStaffTrackerNote(workspaceId, clientProfileId, {
                ...wire,
                body,
              });
              synced[key] = body;
            }
            for (const key of Object.keys(baseline)) {
              if (key in current) continue;
              const wire = staffNoteKeyToWire(key, parameterKeys);
              if (!wire) continue;
              await deleteStaffTrackerNote(
                workspaceId,
                clientProfileId,
                wire,
              );
              delete synced[key];
            }
          } catch {
            trackingNotesSynced.current.set(clientId, synced);
            setNotice({ text: "Tracker note could not be saved." });
            return;
          }
          trackingNotesSynced.current.set(clientId, synced);
        } catch {
          setNotice({ text: "Tracker note could not be saved." });
        }
      });
      noteSyncChain.current.set(
        clientId,
        next.catch(() => {}),
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [state, hydrated, workspaceId, demo, route.client, clientProfileIdFor]);
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
        physiquePhotosFor,
      }}
    >
      {children}
    </Context.Provider>
  );
}
