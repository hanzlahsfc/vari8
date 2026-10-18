"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveTrainingDraftAction } from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/actions";
import { emptyTrainingDraft } from "@/lib/trainingprogram/payload";

/**
 * TRAINING-I1A (PROMPT 244) — new program container. Creates the shared
 * draft shell (revision 1); authoring, timezone confirmation and the
 * first publish happen on the program detail page.
 */
export function TrainingProgramCreate({
  workspaceId,
  clientProfileId,
}: {
  workspaceId: string;
  clientProfileId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [mode, setMode] = useState<"WEEK_BASED" | "EVERGREEN">("WEEK_BASED");
  const [weekCount, setWeekCount] = useState("8");
  const [timezone, setTimezone] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      const weeks = Number(weekCount);
      const r = await saveTrainingDraftAction({
        workspaceId,
        clientProfileId,
        expectedRevision: 0,
        title,
        startDate,
        weekCount: Number.isInteger(weeks) ? weeks : 0,
        fieldConfig: {
          sets: true,
          fixedReps: true,
          repRanges: false,
          tempo: false,
          setType: false,
          restPause: false,
          instructions: false,
          progressionNotes: false,
        },
        ...(timezone.trim() !== "" ? { timezone: timezone.trim() } : {}),
        draft: emptyTrainingDraft(mode),
      });
      if (r.status !== "ok" || typeof r.programId !== "string") {
        setError(r.status === "error" ? r.message : "Create failed.");
        return;
      }
      router.push(
        `/workspace/${workspaceId}/clients/${clientProfileId}/training-program/${r.programId}`,
      );
    });

  return (
    <section className="tracker-section" data-testid="tp-create">
      <h2 className="tracker-section__title">New training program</h2>
      {error !== "" ? (
        <p className="daily-errors" role="alert" data-testid="tp-create-error">
          {error}
        </p>
      ) : null}
      <label htmlFor="tp-create-title">Title</label>
      <input
        id="tp-create-title"
        data-testid="tp-create-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={80}
        disabled={pending}
      />
      <label htmlFor="tp-create-start">Start date (YYYY-MM-DD)</label>
      <input
        id="tp-create-start"
        data-testid="tp-create-start"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        placeholder="YYYY-MM-DD"
        disabled={pending}
      />
      <label htmlFor="tp-create-mode">Structure</label>
      <select
        id="tp-create-mode"
        data-testid="tp-create-mode"
        value={mode}
        onChange={(e) =>
          setMode(e.target.value === "EVERGREEN" ? "EVERGREEN" : "WEEK_BASED")
        }
        disabled={pending}
      >
        <option value="WEEK_BASED">Week-based</option>
        <option value="EVERGREEN">Ongoing (evergreen)</option>
      </select>
      {mode === "EVERGREEN" ? (
        <p className="app-lede">
          Ongoing program — the prescription carries forward with no fixed final
          week; published updates apply prospectively.
        </p>
      ) : (
        <>
          <label htmlFor="tp-create-weeks">Weeks</label>
          <input
            id="tp-create-weeks"
            data-testid="tp-create-weeks"
            inputMode="numeric"
            value={weekCount}
            onChange={(e) => setWeekCount(e.target.value)}
            disabled={pending}
          />
        </>
      )}
      <label htmlFor="tp-create-tz">Client timezone (IANA)</label>
      <input
        id="tp-create-tz"
        data-testid="tp-create-tz"
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        placeholder="e.g. Europe/London"
        disabled={pending}
      />
      <button
        type="button"
        data-testid="tp-create-submit"
        onClick={create}
        disabled={pending}
      >
        Create program
      </button>
    </section>
  );
}
