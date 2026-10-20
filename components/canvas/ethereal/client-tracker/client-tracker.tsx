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
import { TrackerConfigurator } from "./tracker-configurator";
import { TrackingView } from "./tracking-view";
import "./client-tracker.css";

const allowedIds = new Set(parameters.map((parameter) => parameter.id));

export function ClientTracker() {
  const [config, setConfig] = useState<TrackerConfig | null>(null);
  const [entries, setEntries] = useState<TrackerEntry[]>(sampleEntries);
  const [ready, setReady] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const headingRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const draft = readClientTrackerDraft();
    if (draft) {
      setConfig(draft.config);
      setEntries(draft.entries);
      setComments(draft.comments);
    }
    setReady(true);
  }, []);

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
      writeClientTrackerDraft({
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
                !/^2026-\d{2}-\d{2}$/.test(date) ||
                date > "2026-10-08" ||
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
