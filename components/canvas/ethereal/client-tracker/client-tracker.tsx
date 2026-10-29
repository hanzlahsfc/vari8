"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  readClientTrackerDraft,
  writeClientTrackerDraft,
} from "@/components/canvas/data/tracker";
import { useReducedMotion } from "@/lib/canvas/reduced-motion";
import {
  defaultConfig,
  parameters,
  sampleEntries,
  type TrackerConfig,
  type TrackerEntry,
} from "./model";
import { RemoteClientTracker } from "./remote-client-tracker";
import { TrackerConfigurator } from "./tracker-configurator";
import { TrackingView } from "./tracking-view";
import "./client-tracker.css";

/**
 * PR-W1 (S11-18): the tracker pins to one client. The canvas default keeps the
 * studio demo exactly as drawn ("Maya Chen", the maya-v1 storage key, the
 * 2026-10-08 as-of bound); `/me` passes the viewer's own identity so the same
 * screen binds to their `ClientProfile` — own name, own storage key, real
 * today as the upper date bound.
 */
export type ClientTrackerIdentity = {
  storageKey: string;
  clientName: string;
  clientInitials: string;
  asOf: string;
  /**
   * Card 05a: a real workspace binds the tracker to the server's daily-entry
   * surface. Absent (the canvas studio identity), the component keeps its
   * localStorage draft and sample history.
   */
  workspaceId?: string;
  /**
   * Issue #169: the viewer's own client profile - when present the remote
   * tracker also resolves the day's activity targets through the API.
   */
  clientProfileId?: string;
};

const DEFAULT_IDENTITY: ClientTrackerIdentity = {
  storageKey: "coaching-client-tracker-maya-v1",
  clientName: "Maya Chen",
  clientInitials: "MC",
  asOf: "2026-10-08",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const allowedIds = new Set(parameters.map((parameter) => parameter.id));

export function ClientTracker({
  identity = DEFAULT_IDENTITY,
}: {
  identity?: ClientTrackerIdentity;
}) {
  if (identity.workspaceId)
    return (
      <RemoteClientTracker
        workspaceId={identity.workspaceId}
        clientProfileId={identity.clientProfileId}
        clientName={identity.clientName}
        clientInitials={identity.clientInitials}
        asOf={identity.asOf}
      />
    );
  return <LocalClientTracker identity={identity} />;
}

function LocalClientTracker({
  identity,
}: {
  identity: ClientTrackerIdentity;
}) {
  const [config, setConfig] = useState<TrackerConfig | null>(null);
  const [entries, setEntries] = useState<TrackerEntry[]>(sampleEntries);
  const [ready, setReady] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const headingRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const draft = readClientTrackerDraft(identity);
    if (draft) {
      setConfig(draft.config);
      setEntries(draft.entries);
      setComments(draft.comments);
    }
    setReady(true);
  }, [identity]);

  function save(
    nextConfig: TrackerConfig,
    nextEntries: TrackerEntry[],
    message: string,
    nextComments: Record<string, string> = comments,
  ) {
    setConfig(nextConfig);
    setEntries(nextEntries);
    setComments(nextComments);
    try {
      writeClientTrackerDraft(identity, {
        config: nextConfig,
        entries: nextEntries,
        comments: nextComments,
      });
      setStatus(message);
    } catch {
      setStatus(
        `${message} Browser storage is unavailable; changes last for this session.`,
      );
    }
  }

  function finishConfiguration(next: TrackerConfig) {
    save(
      next,
      entries,
      config
        ? "Tracker configuration saved on this device."
        : "Tracker created. Example client history is ready to review.",
    );
    setConfiguring(false);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() =>
      headingRef.current?.focus({ preventScroll: true }),
    );
  }

  if (!ready)
    return (
      <div className="ct-workspace ct-loading" role="status">
        Opening client tracker…
      </div>
    );

  return (
    <div className="ct-workspace" ref={headingRef} tabIndex={-1}>
      <motion.div
        key={!config || configuring ? "configure" : "tracking"}
        initial={reducedMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.3 }}
      >
        {!config || configuring ? (
          <TrackerConfigurator
            initialConfig={config ?? defaultConfig}
            onSave={finishConfiguration}
            onCancel={config ? () => setConfiguring(false) : undefined}
          />
        ) : (
          <TrackingView
            config={config}
            entries={entries}
            clientName={identity.clientName}
            clientInitials={identity.clientInitials}
            asOf={identity.asOf}
            onConfigure={() => {
              setStatus("");
              setConfiguring(true);
              window.scrollTo({ top: 0, behavior: "instant" });
            }}
            comments={comments}
            onUpdateValue={(date, id, value) => {
              const parameter = parameters.find((item) => item.id === id);
              if (
                !parameter ||
                !DATE_RE.test(date) ||
                date > identity.asOf ||
                (value !== null &&
                  (!Number.isFinite(value) ||
                    value < parameter.min ||
                    value > parameter.max))
              )
                return;
              const existing = entries.find((item) => item.date === date);
              if ((existing?.values[id] ?? null) === value) return;
              const next = [
                ...entries.filter((item) => item.date !== date),
                { date, values: { ...existing?.values, [id]: value } },
              ].sort((a, b) => a.date.localeCompare(b.date));
              save(config, next, "Entry saved. Weekly averages updated.");
            }}
            onSaveComment={(date, id, text) => {
              if (
                !allowedIds.has(id) ||
                (!comments[`${date}:${id}`] &&
                  !entries.some(
                    (entry) => entry.date === date && entry.values[id] != null,
                  ))
              )
                return;
              const nextComments = { ...comments };
              const key = `${date}:${id}`;
              const trimmed = text.trim().slice(0, 2000);
              if (trimmed) nextComments[key] = trimmed;
              else delete nextComments[key];
              save(
                config,
                entries,
                trimmed ? "Coach comment saved." : "Coach comment removed.",
                nextComments,
              );
            }}
          />
        )}
      </motion.div>
      <p className="ct-save-status" role="status">
        {status ||
          (config ? "Configuration and entries are saved on this device." : "")}
      </p>
    </div>
  );
}
