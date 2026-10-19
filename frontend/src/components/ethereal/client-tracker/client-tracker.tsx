"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/reduced-motion";
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

const STORAGE_KEY = "coaching-client-tracker-maya-v1";
const allowedIds = new Set(parameters.map((parameter) => parameter.id));

function readDraft(): {
  config: TrackerConfig;
  entries: TrackerEntry[];
  comments: Record<string, string>;
} | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const config = data?.config;
    if (!config || !Array.isArray(config.parameterIds)) return null;
    const parameterIds = [
      ...new Set(
        config.parameterIds.filter(
          (id: unknown) => typeof id === "string" && allowedIds.has(id),
        ),
      ),
    ] as string[];
    if (!parameterIds.length) return null;
    const summaryParameterIds = Array.isArray(config.summaryParameterIds)
      ? [
          ...new Set(
            (config.summaryParameterIds as unknown[]).filter(
              (id): id is string =>
                typeof id === "string" &&
                parameterIds.includes(id) &&
                parameters.some(
                  (parameter) =>
                    parameter.id === id &&
                    (parameter.kind === "number" ||
                      parameter.kind === "rating"),
                ),
            ),
          ),
        ].slice(0, 4)
      : undefined;
    const safeConfig: TrackerConfig = {
      parameterIds,
      ...(summaryParameterIds === undefined ? {} : { summaryParameterIds }),
      weightUnit: config.weightUnit === "lb" ? "lb" : "kg",
      lengthUnit: config.lengthUnit === "in" ? "in" : "cm",
      waterUnit: config.waterUnit === "fl oz" ? "fl oz" : "L",
      ratingScale: ["1-10", "1-5", "words"].includes(config.ratingScale)
        ? config.ratingScale
        : "1-10",
    };
    const entries: TrackerEntry[] = Array.isArray(data.entries)
      ? data.entries.flatMap((entry: TrackerEntry) => {
          if (
            !entry ||
            typeof entry.date !== "string" ||
            !/^2026-\d{2}-\d{2}$/.test(entry.date) ||
            entry.date > "2026-10-08" ||
            !entry.values ||
            typeof entry.values !== "object"
          )
            return [];
          const values: Record<string, number | null> = {};
          for (const parameter of parameters) {
            const value = entry.values[parameter.id];
            values[parameter.id] =
              typeof value === "number" &&
              Number.isFinite(value) &&
              value >= parameter.min &&
              value <= parameter.max
                ? value
                : null;
          }
          return [{ date: entry.date, values }];
        })
      : [];
    const comments: Record<string, string> = {};
    if (data.comments && typeof data.comments === "object") {
      for (const [key, value] of Object.entries(data.comments)) {
        const [date, id] = key.split(":");
        if (
          /^2026-\d{2}-\d{2}$/.test(date) &&
          date <= "2026-10-08" &&
          allowedIds.has(id) &&
          typeof value === "string" &&
          value.trim()
        )
          comments[key] = value.slice(0, 2000);
      }
    }
    return { config: safeConfig, entries, comments };
  } catch {
    return null;
  }
}

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
    const draft = readDraft();
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
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          config: nextConfig,
          entries: nextEntries,
          comments: nextComments,
        }),
      );
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
