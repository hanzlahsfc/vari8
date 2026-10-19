"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import type { StaffProgramList } from "@/lib/trainingprogram/service";
import { listTrainingProgramsAction } from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/actions";

/**
 * TRAINING-I1A (PROMPT 244) — staff program list. Every program renders
 * with its truthful lifecycle label (S): draft, pending, current,
 * superseded, dead, cancelled. Bounded keyset pagination.
 */

const STATE_TEXT: Record<
  StaffProgramList["programs"][number]["state"],
  string
> = {
  draft: "Draft",
  pending: "Scheduled replacement",
  current: "Current",
  superseded: "Superseded",
  dead: "Superseded before start",
  cancelled: "Cancelled",
};

export function TrainingProgramList({
  workspaceId,
  clientProfileId,
  initialPrograms,
  initialCursor,
}: {
  workspaceId: string;
  clientProfileId: string;
  initialPrograms: StaffProgramList["programs"];
  initialCursor: StaffProgramList["nextCursor"];
}) {
  const [programs, setPrograms] = useState(initialPrograms);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const loadMore = () =>
    startTransition(async () => {
      if (cursor === null) return;
      const r = await listTrainingProgramsAction({
        workspaceId,
        clientProfileId,
        cursor,
      });
      if (r.status !== "ok") {
        setError(r.status === "error" ? r.message : "Load failed.");
        return;
      }
      setPrograms((ps) => [...ps, ...r.programs]);
      setCursor(r.nextCursor);
    });

  return (
    <section className="tracker-section" data-testid="tp-program-list">
      <h2 className="tracker-section__title">Programs</h2>
      {error !== "" ? (
        <p className="daily-errors" role="alert">
          {error}
        </p>
      ) : null}
      {programs.length === 0 ? (
        <p className="app-lede">No training programs yet.</p>
      ) : (
        <ol className="tracker-list">
          {programs.map((p) => (
            <li
              key={p.programId}
              className="tracker-list__row"
              data-testid={`tp-program-${p.programId}`}
            >
              <Link
                href={`/workspace/${workspaceId}/clients/${clientProfileId}/training-program/${p.programId}`}
                data-testid={`tp-program-link-${p.programId}`}
              >
                <span className="tracker-list__title">{p.title}</span>
              </Link>
              <span className="tracker-list__sub">
                {STATE_TEXT[p.state]} — starts {p.startDate} —{" "}
                {p.programMode === "EVERGREEN"
                  ? "Ongoing"
                  : `${p.weekCount} weeks`}
              </span>
            </li>
          ))}
        </ol>
      )}
      {cursor !== null ? (
        <button
          type="button"
          data-testid="tp-programs-more"
          onClick={loadMore}
          disabled={pending}
        >
          Load more
        </button>
      ) : null}
    </section>
  );
}
