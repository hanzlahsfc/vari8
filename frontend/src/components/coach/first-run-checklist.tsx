"use client";

import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import "./first-run-checklist.css";

/**
 * W2-T4 (R1) - coach first-run checklist card. Renders on the workspace
 * overview for a fresh workspace and ticks live as the coach adds a client,
 * configures a form and creates a plan. A populated workspace never mounts it;
 * a workspace that finishes while the card is open sees it hide itself.
 *
 * Flags arrive derived from the server (props seed the first paint); when a
 * `statusUrl` is provided the card re-reads the authorized flag route on a
 * poll interval plus window focus and tab visibility changes, so a tick lands
 * without a reload.
 */
export type FirstRunFlags = {
  hasClient: boolean;
  hasForm: boolean;
  hasPlan: boolean;
};

export type FirstRunChecklistProps = {
  workspaceId: string;
  flags: FirstRunFlags;
  /** Authorized flag-read endpoint; when absent the card stays on its props. */
  statusUrl?: string;
  pollIntervalMs?: number;
};

const DEFAULT_POLL_MS = 15000;

type ChecklistItem = {
  flag: keyof FirstRunFlags;
  label: string;
  hint: string;
  href: string;
};

function buildItems(workspaceId: string): ChecklistItem[] {
  const base = `/workspace/${encodeURIComponent(workspaceId)}`;
  return [
    {
      flag: "hasClient",
      label: "Add your first client",
      hint: "Invite or register a client into this workspace.",
      href: `${base}/client-setups`,
    },
    {
      flag: "hasForm",
      label: "Configure a form",
      hint: "Set up a check-in or onboarding form.",
      href: `${base}/onboarding/forms`,
    },
    {
      flag: "hasPlan",
      label: "Create a client plan",
      hint: "Add a nutrition or training plan for a client.",
      href: `${base}/clients`,
    },
  ];
}

function isFirstRunFlags(value: unknown): value is FirstRunFlags {
  if (value === null || typeof value !== "object") return false;
  const flags = value as Record<string, unknown>;
  return (
    typeof flags.hasClient === "boolean" &&
    typeof flags.hasForm === "boolean" &&
    typeof flags.hasPlan === "boolean"
  );
}

export function FirstRunChecklist({
  workspaceId,
  flags: initialFlags,
  statusUrl,
  pollIntervalMs = DEFAULT_POLL_MS,
}: FirstRunChecklistProps) {
  const [flags, setFlags] = useState<FirstRunFlags>(initialFlags);
  const [seenInitial, setSeenInitial] = useState<FirstRunFlags>(initialFlags);
  if (initialFlags !== seenInitial) {
    setSeenInitial(initialFlags);
    setFlags(initialFlags);
  }

  const refresh = useCallback(async () => {
    if (!statusUrl) return;
    try {
      const response = await fetch(statusUrl, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) return;
      const body: unknown = await response.json();
      if (isFirstRunFlags(body)) {
        setFlags({
          hasClient: body.hasClient,
          hasForm: body.hasForm,
          hasPlan: body.hasPlan,
        });
      }
    } catch {
      // A transient read failure keeps the last known flags; the next
      // interval or focus event retries the same authorized read.
    }
  }, [statusUrl]);

  const items = buildItems(workspaceId);
  const total = items.length;
  const completed = items.filter((item) => flags[item.flag]).length;
  const allDone = completed === total;

  useEffect(() => {
    if (!statusUrl || allDone) return;
    const interval = setInterval(refresh, pollIntervalMs);
    const onFocus = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [statusUrl, allDone, pollIntervalMs, refresh]);

  if (allDone) return null;

  const percent = Math.round((completed / total) * 100);

  return (
    <section
      className="first-run-card"
      data-testid="first-run-checklist"
      aria-labelledby="first-run-title"
    >
      <header className="first-run-card__header">
        <div>
          <h2 className="first-run-card__title" id="first-run-title">
            Get started
          </h2>
          <p className="first-run-card__lede">
            Finish these steps to set up your coaching workspace.
          </p>
        </div>
        <span className="first-run-card__count" data-testid="first-run-count">
          {completed} of {total} completed
        </span>
      </header>
      <div
        className="first-run-card__progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-label="Setup progress"
      >
        <span
          className="first-run-card__progress-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="first-run-card__list">
        {items.map((item) => {
          const done = flags[item.flag];
          return (
            <li
              key={item.flag}
              className="first-run-card__item"
              data-done={done}
            >
              <Link className="first-run-card__link" href={item.href}>
                <span className="first-run-card__icon" aria-hidden="true">
                  {done ? <Check size={16} /> : <Circle size={16} />}
                </span>
                <span className="first-run-card__text">
                  <span className="first-run-card__label">{item.label}</span>
                  <span className="first-run-card__hint">{item.hint}</span>
                </span>
                <span className="first-run-card__state">
                  {done ? "Done" : "To do"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
