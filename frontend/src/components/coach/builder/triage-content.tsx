"use client";

import { AlertCircle, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { TriageRow } from "@/lib/attention";
import type { AdaptiveWidgetProps } from "./widget-geometry";
import "./triage.css";

type AttentionRouteItem = {
  clientProfileId: string;
  name: string;
  reasons: string[];
  priority: number;
  attentionCount: number;
};

/**
 * Live workspace triage from /api/v1 when the canvas runs bound to a
 * real workspace. Polls while mounted and refetches on window focus so
 * a cause cleared elsewhere removes the row without a reload. Returns
 * null when the route is unreachable or unbound. Callers keep their
 * store-derived fallback rows in that case.
 */
export function useAttentionRows(workspaceId?: string): TriageRow[] | null {
  const [rows, setRows] = useState<TriageRow[] | null>(null);
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(
          `/api/v1/workspaces/${workspaceId}/attention`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const body = (await response.json()) as {
          items?: AttentionRouteItem[];
        };
        if (!cancelled && Array.isArray(body.items)) {
          setRows(
            body.items.map((item) => ({
              clientId: item.clientProfileId,
              name: item.name,
              reasons: item.reasons,
              priority: item.priority,
              attentionCount: item.attentionCount,
            })),
          );
        }
      } catch {
        // Keep the last good rows; the next poll retries.
      }
    };
    load();
    const interval = setInterval(load, 4000);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", load);
    };
  }, [workspaceId]);
  return rows;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * W2-T5 (R11): coach attention triage. Rows come from `records.triage`,
 * the shared needsAttention derivation. Rows are populated from the
 * attention route when a real workspace is bound, or from the coach
 * store's clients otherwise. In clientPreview the widget renders an
 * honest placeholder: roster rows are coach data and never leave the
 * coach surface.
 */
export function TriageContent(props: AdaptiveWidgetProps) {
  const { records, bodyWidth, bodyHeight, clientPreview } = props;
  const rows = records.triage ?? [];
  const compact = bodyHeight < 140;
  const roomy = bodyHeight >= 220;

  if (clientPreview) {
    return (
      <section className="cb-cc-widget cb-triage">
        <div className="cb-dw-empty">
          <span>
            Attention triage is only available on the coach dashboard.
          </span>
        </div>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className="cb-cc-widget cb-triage">
        <div className="cb-dw-empty">
          <span>No clients need attention right now.</span>
        </div>
      </section>
    );
  }

  const visible = compact ? rows.slice(0, 2) : rows;
  return (
    <section
      className={`cb-cc-widget cb-triage${compact ? " is-compact" : ""}${roomy ? " is-roomy" : ""}`}
      aria-label="Clients needing attention"
    >
      <ul className="cb-triage-list">
        {visible.map((row) => (
          <li className="cb-triage-row" key={row.clientId}>
            <span className="cb-triage-avatar" aria-hidden="true">
              {initials(row.name)}
            </span>
            <span className="cb-triage-copy">
              <strong>{row.name}</strong>
              <small>{row.reasons.join(" · ")}</small>
            </span>
            <span className="cb-triage-badge">
              <AlertCircle size={13} aria-hidden="true" />
              {row.attentionCount}
            </span>
          </li>
        ))}
      </ul>
      {roomy && bodyWidth > 320 && (
        <span className="cb-triage-more">
          {visible.length < rows.length
            ? `${rows.length - visible.length} more need attention`
            : "Open Clients to work the list"}
          <ChevronRight size={14} aria-hidden="true" />
        </span>
      )}
    </section>
  );
}
