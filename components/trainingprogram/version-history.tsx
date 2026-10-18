"use client";

import { useState, useTransition } from "react";

import type {
  StaffProgramDetail,
  StaffVersionDetail,
} from "@/lib/trainingprogram/service";
import {
  listTrainingVersionsAction,
  viewTrainingVersionAction,
} from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/actions";
import { ProgramWeekView } from "@/components/trainingprogram/program-week-view";

/**
 * TRAINING-I1A (PROMPT 244) — staff version history. Lifecycle-unfiltered
 * (S correction): every committed version renders with its truthful label —
 * current, scheduled, past, shadowed, beyond_cutoff — including versions on
 * cancelled programs. Bounded keyset pages; each explicit "View" performs
 * one authorized read (one READ audit).
 */

const LABEL_TEXT: Record<
  StaffProgramDetail["versions"][number]["label"],
  string
> = {
  current: "Current",
  scheduled: "Scheduled",
  past: "Past",
  shadowed: "Shadowed",
  beyond_cutoff: "Beyond cutoff",
};

export function TrainingVersionHistory({
  workspaceId,
  clientProfileId,
  programId,
  initialVersions,
  initialCursor,
  programCancelled,
}: {
  workspaceId: string;
  clientProfileId: string;
  programId: string;
  initialVersions: StaffProgramDetail["versions"];
  initialCursor: number | null;
  programCancelled: boolean;
}) {
  const [versions, setVersions] = useState(initialVersions);
  const [cursor, setCursor] = useState(initialCursor);
  const [detail, setDetail] = useState<StaffVersionDetail | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const loadMore = () =>
    startTransition(async () => {
      if (cursor === null) return;
      const r = await listTrainingVersionsAction({
        workspaceId,
        clientProfileId,
        programId,
        cursor,
      });
      if (r.status !== "ok") {
        setError(r.status === "error" ? r.message : "Load failed.");
        return;
      }
      setVersions((vs) => [...vs, ...r.versions]);
      setCursor(r.nextCursor);
    });

  const view = (versionId: string) =>
    startTransition(async () => {
      const r = await viewTrainingVersionAction({
        workspaceId,
        clientProfileId,
        programId,
        versionId,
      });
      if (r.status !== "ok") {
        setError(r.status === "error" ? r.message : "Load failed.");
        return;
      }
      setDetail(r.detail);
    });

  return (
    <section className="tracker-section" data-testid="training-history">
      <h2 className="tracker-section__title">Version history</h2>
      {error !== "" ? (
        <p
          className="daily-errors"
          role="alert"
          data-testid="training-history-error"
        >
          {error}
        </p>
      ) : null}
      {programCancelled ? (
        <p className="app-lede">This program was cancelled.</p>
      ) : null}
      {versions.length === 0 ? (
        <p className="app-lede">Nothing published yet.</p>
      ) : (
        <ol className="tracker-list">
          {versions.map((v) => (
            <li
              key={v.id}
              className="tracker-list__row"
              data-testid={`tp-version-${v.versionSeq}`}
            >
              <span className="tracker-list__title">
                v{v.versionSeq} — effective {v.effectiveDate} (
                {v.effectiveTimezone})
              </span>
              <span className="tracker-list__sub">
                {LABEL_TEXT[v.label]} — published {v.publishedAt.slice(0, 10)}
              </span>
              <button
                type="button"
                data-testid={`tp-version-view-${v.versionSeq}`}
                onClick={() => view(v.id)}
                disabled={pending}
              >
                View
              </button>
            </li>
          ))}
        </ol>
      )}
      {cursor !== null ? (
        <button
          type="button"
          data-testid="tp-versions-more"
          onClick={loadMore}
          disabled={pending}
        >
          Load more
        </button>
      ) : null}
      {detail !== null ? (
        <div data-testid="tp-version-detail">
          <h3 className="tracker-section__title">
            Version {detail.versionSeq} — effective {detail.effectiveDate}
          </h3>
          <p className="app-lede" data-testid="tp-version-detail-labels">
            {[
              detail.labels.programCancelled ? "cancelled program" : null,
              detail.labels.programDead ? "dead program" : null,
              detail.labels.shadowed ? "shadowed" : null,
              detail.labels.beyondCutoff ? "beyond cutoff" : null,
              detail.labels.scheduled ? "scheduled" : null,
            ]
              .filter(Boolean)
              .join(" · ") || "published"}
          </p>
          {detail.payload.weeks.map((w) => (
            <ProgramWeekView
              key={w.week}
              week={w.week}
              sessions={w.sessions}
              testidPrefix={`tp-vdetail-w${w.week}`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
