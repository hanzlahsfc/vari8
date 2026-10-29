"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchActivityTargets,
  versionsFromWire,
} from "@/components/canvas/data/activity-targets";
import {
  dailyEntrySurfaceToTrackerView,
  fetchDailyEntrySurface,
  remoteDayDataFromHistory,
  remoteDayDataFromRaws,
  remoteOrdinalValues,
  remoteRawsFromSurface,
  remoteRawFromNumber,
  remoteRawFromText,
  saveDailyEntryRemote,
  type DailyEntrySurfaceWire,
  type RemoteDayData,
  type RemoteParameterMeta,
  type RemoteTrackerViewModel,
} from "@/components/canvas/data/tracker";
import type { ActivityTargetVersion } from "../../coach/targets/model";
import { TargetSummary } from "../../coach/targets/target-summary";
import type { TrackerEntry } from "./model";
import { TrackingView } from "./tracking-view";

/**
 * Card 05a: the `/me` tracker on the real store. Each visited date holds one
 * record: the last fetched ready surface (its `formToken` signs the next
 * save), the wire `raws` for every item, edits that arrived before the
 * surface, and a promise chain that serializes saves so a stale token never
 * races a fresh one. Displayed entries come from the raws of loaded dates and
 * from the surface's 30-day history for everything else.
 *
 * A day counts as dirty while it holds edits the store has not confirmed: keys
 * waiting in `pending`, raws that differ from the loaded surface's baseline, or
 * a save chain still running. A `beforeunload` guard is registered only while
 * any day is dirty, so a saved or untouched day never warns.
 */
type RemoteDateRecord = {
  surface: Extract<DailyEntrySurfaceWire, { state: "ready" }> | null;
  loading: boolean;
  raws: Record<string, string>;
  pending: Record<string, string>;
  chain: Promise<void>;
};

type SurfaceState = DailyEntrySurfaceWire["state"] | "loading" | "error";

const NO_COMMENTS: Record<string, string> = {};
const NOOP_SAVE_COMMENT = () => {};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const STATE_COPY: Record<Exclude<SurfaceState, "ready" | "loading">, string> = {
  unavailable: "Tracking is not set up on your account yet.",
  ineligible: "Your tracking form is being updated. Check back soon.",
  consent_missing:
    "A required consent is missing before entries can be logged.",
  not_applicable: "Tracking is not available for this account.",
  error: "Your tracker could not be loaded. Check your connection and reload.",
};

export function RemoteClientTracker({
  workspaceId,
  clientProfileId,
  clientName,
  clientInitials,
  asOf,
}: {
  workspaceId: string;
  clientProfileId?: string;
  clientName: string;
  clientInitials: string;
  asOf: string;
}) {
  const [view, setView] = useState<RemoteTrackerViewModel | null>(null);
  const [surfaceState, setSurfaceState] = useState<SurfaceState>("loading");
  const [entries, setEntries] = useState<TrackerEntry[]>([]);
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [targetVersions, setTargetVersions] = useState<
    ActivityTargetVersion[] | null
  >(null);
  const [dirty, setDirty] = useState(false);
  const savesRef = useRef(0);
  const datesRef = useRef(new Map<string, RemoteDateRecord>());
  const baseRef = useRef(new Map<string, RemoteDayData>());
  const metasRef = useRef<RemoteParameterMeta[]>([]);
  const metaByIdRef = useRef(new Map<string, RemoteParameterMeta>());
  const viewRef = useRef<RemoteTrackerViewModel | null>(null);

  useEffect(() => {
    if (!clientProfileId) return;
    let cancelled = false;
    void fetchActivityTargets(workspaceId, clientProfileId)
      .then((view) => {
        if (!cancelled) setTargetVersions(versionsFromWire(view.versions));
      })
      .catch(() => {
        // The readout stays absent rather than misreporting targets.
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, clientProfileId]);

  const recordFor = (date: string) => {
    let record = datesRef.current.get(date);
    if (!record) {
      record = {
        surface: null,
        loading: false,
        raws: {},
        pending: {},
        chain: Promise.resolve(),
      };
      datesRef.current.set(date, record);
    }
    return record;
  };

  const refreshDirty = () => {
    let next = savesRef.current > 0;
    if (!next) {
      for (const record of datesRef.current.values()) {
        if (Object.keys(record.pending).length) {
          next = true;
          break;
        }
        if (!record.surface) continue;
        const baseline = remoteRawsFromSurface(record.surface);
        for (const key of Object.keys(record.raws)) {
          if (record.raws[key] !== baseline[key]) {
            next = true;
            break;
          }
        }
        if (next) break;
      }
    }
    setDirty(next);
  };

  const rebuildDisplay = () => {
    const dates = new Set([
      ...baseRef.current.keys(),
      ...datesRef.current.keys(),
    ]);
    const next: TrackerEntry[] = [];
    const texts: Record<string, string> = {};
    for (const date of dates) {
      const record = datesRef.current.get(date);
      const base = baseRef.current.get(date);
      let data = base;
      if (record?.surface) {
        // A loaded date's raws are its complete, authoritative state.
        data = remoteDayDataFromRaws(record.raws, metasRef.current);
      } else if (record && Object.keys(record.raws).length) {
        // Optimistic edits made before the surface arrived overlay history.
        const overlay = remoteDayDataFromRaws(record.raws, metasRef.current);
        data = {
          values: { ...base?.values, ...overlay.values },
          texts: { ...base?.texts, ...overlay.texts },
        };
      }
      if (!data) continue;
      if (Object.keys(data.values).length)
        next.push({ date, values: data.values });
      for (const [id, text] of Object.entries(data.texts))
        texts[`${date}:${id}`] = text;
    }
    next.sort((first, second) => first.date.localeCompare(second.date));
    setEntries(next);
    setTextValues(texts);
    refreshDirty();
  };

  const mergeHistory = (
    surface: Extract<DailyEntrySurfaceWire, { state: "ready" }>,
  ) => {
    for (const entry of surface.history) {
      baseRef.current.set(
        entry.entryDate,
        remoteDayDataFromHistory(entry.values, metasRef.current),
      );
    }
  };

  const applySurface = (date: string, surface: DailyEntrySurfaceWire) => {
    const record = recordFor(date);
    record.loading = false;
    if (surface.state !== "ready") {
      if (!viewRef.current) setSurfaceState(surface.state);
      else setStatus("That day could not be loaded.");
      return;
    }
    if (!viewRef.current) {
      const model = dailyEntrySurfaceToTrackerView(surface);
      metasRef.current = model.metas;
      metaByIdRef.current = new Map(
        model.metas.map((meta) => [meta.id, meta]),
      );
      viewRef.current = model;
      setView(model);
      setSurfaceState("ready");
    }
    mergeHistory(surface);
    record.surface = surface;
    record.raws = remoteRawsFromSurface(surface);
    const pending = record.pending;
    record.pending = {};
    if (Object.keys(pending).length) Object.assign(record.raws, pending);
    rebuildDisplay();
    if (Object.keys(pending).length) queueSave(date);
  };

  const ensureSurface = (date: string) => {
    const record = recordFor(date);
    if (record.surface || record.loading) return;
    record.loading = true;
    fetchDailyEntrySurface(workspaceId, date)
      .then((surface) => applySurface(date, surface))
      .catch(() => {
        record.loading = false;
        if (!viewRef.current) setSurfaceState("error");
        else setStatus("That day could not be loaded. Try again.");
      });
  };

  const queueSave = (date: string) => {
    const record = recordFor(date);
    record.chain = record.chain.then(async () => {
      // The whole round trip, token refresh refetch included, keeps the day
      // dirty so the guard holds until the store has confirmed the entry.
      savesRef.current += 1;
      refreshDirty();
      try {
        const surface = record.surface;
        if (!surface) return;
        const sent = { ...record.raws };
        try {
          const result = await saveDailyEntryRemote(workspaceId, date, {
            formToken: surface.formToken,
            values: remoteOrdinalValues(metasRef.current, sent),
          });
          if (result.status !== "saved") return;
          setStatus("Entry saved.");
          // A save rotates the form token; refetch to stay writable and to
          // pick up the coach-side view of the same day.
          const fresh = await fetchDailyEntrySurface(workspaceId, date);
          if (fresh.state !== "ready") return;
          const overrides: Record<string, string> = {};
          for (const key of Object.keys(record.raws))
            if (record.raws[key] !== sent[key])
              overrides[key] = record.raws[key];
          mergeHistory(fresh);
          record.surface = fresh;
          record.raws = { ...remoteRawsFromSurface(fresh), ...overrides };
          rebuildDisplay();
          if (Object.keys(overrides).length) queueSave(date);
        } catch {
          setStatus("That entry could not be saved. The day was reloaded.");
          try {
            const fresh = await fetchDailyEntrySurface(workspaceId, date);
            if (fresh.state !== "ready") return;
            mergeHistory(fresh);
            record.surface = fresh;
            record.raws = remoteRawsFromSurface(fresh);
            rebuildDisplay();
          } catch {
            // The reload failing leaves the last good surface in place.
          }
        }
      } finally {
        savesRef.current -= 1;
        refreshDirty();
      }
    });
  };

  const applyEdit = (date: string, key: string, raw: string) => {
    const record = recordFor(date);
    record.raws[key] = raw;
    if (record.surface) {
      rebuildDisplay();
      queueSave(date);
      return;
    }
    record.pending[key] = raw;
    rebuildDisplay();
    ensureSurface(date);
  };

  const onUpdateValue = (date: string, id: string, value: number | null) => {
    const meta = metaByIdRef.current.get(id);
    if (!meta || !DATE_RE.test(date) || date > asOf) return;
    applyEdit(date, meta.key, remoteRawFromNumber(meta, value));
  };

  const onUpdateText = (date: string, id: string, value: string) => {
    const meta = metaByIdRef.current.get(id);
    if (!meta || !DATE_RE.test(date) || date > asOf) return;
    applyEdit(date, meta.key, remoteRawFromText(meta, value));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: the loaders only read refs and identity fields.
  useEffect(() => {
    ensureSurface(asOf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, asOf]);

  // Dirty-only beforeunload: registered while any day holds unconfirmed edits
  // or a running save, removed on cleanup so a saved day never warns.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (surfaceState === "loading" || (surfaceState !== "ready" && !view)) {
    return surfaceState === "loading" ? (
      <div className="ct-workspace ct-loading" role="status">
        Opening client tracker…
      </div>
    ) : (
      <div className="ct-workspace">
        <p className="ct-save-status" role="status">
          {STATE_COPY[surfaceState as keyof typeof STATE_COPY] ??
            STATE_COPY.error}
        </p>
      </div>
    );
  }
  if (!view) return null;

  return (
    <div className="ct-workspace">
      <TrackingView
        remote
        config={view.config}
        entries={entries}
        textValues={textValues}
        onUpdateText={onUpdateText}
        onUpdateValue={onUpdateValue}
        comments={NO_COMMENTS}
        onSaveComment={NOOP_SAVE_COMMENT}
        clientName={clientName}
        clientInitials={clientInitials}
        asOf={asOf}
        parameterGroups={view.parameterGroups}
        renderTargets={
          targetVersions === null
            ? undefined
            : ({ date, view }) => (
                <TargetSummary
                  versions={targetVersions}
                  date={date}
                  mode={view === "Today" ? "day" : "week"}
                />
              )
        }
      />
      <p className="ct-save-status" role="status">
        {status}
      </p>
    </div>
  );
}
