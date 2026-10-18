import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isTrainingPlansEnabled } from "@/lib/trainingprogram/gate";
import { readOwnTrainingProgramFromAction } from "@/lib/trainingprogram/boundary";

import { ProgramWeekView } from "@/components/trainingprogram/program-week-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Training Program" };

/**
 * TRAINING-I1A (PROMPT 244) — client training-program view. Own-scope
 * only: the server resolves the governing version at the current week
 * under the immutable anchor timezone — the browser's clock/zone is
 * never consulted. Truthful states: current week / "starts {date}" /
 * "No training program yet" / completed. View-only — no write path
 * exists. Pending replacements are never disclosed early; a mid-week
 * revision carries the honest "Updated" marker.
 */
export default async function ClientTrainingProgramPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if (!isTrainingPlansEnabled()) notFound();

  const { workspaceId } = await params;
  const { userId } = await requireSessionUser();
  const result = await readOwnTrainingProgramFromAction(
    { user: { id: userId } },
    { workspaceId },
  );

  return (
    <div className="tracker-page" data-testid="client-training-page">
      <header className="tracker-page__header">
        <p className="tracker-page__eyebrow">Workspace</p>
        <h1 className="app-title">Training program</h1>
        <p className="app-lede">
          Your current prescribed week as published by your coach.
        </p>
      </header>

      {!result.ok ? (
        <p className="daily-errors" role="alert" data-testid="training-error">
          {result.message}
        </p>
      ) : result.value.state === "active" && result.value.current !== null ? (
        <div data-testid="training-current">
          <p className="app-lede" data-testid="training-mode">
            {result.value.current.ongoing
              ? `${result.value.current.title} — ongoing program (${result.value.current.anchorTimezone})`
              : `${result.value.current.title} — week ${result.value.current.weekIndex} of ${result.value.current.weekCount} (${result.value.current.anchorTimezone})`}
          </p>
          {result.value.current.marker !== null ? (
            <p className="app-lede" data-testid="training-marker">
              Updated {result.value.current.marker.effectiveDate}
              {result.value.current.ongoing
                ? "."
                : " — some sessions may already be complete."}
            </p>
          ) : null}
          {result.value.current.week !== null ? (
            <ProgramWeekView
              week={result.value.current.week.week}
              weekIndex={result.value.current.weekCount}
              sessions={result.value.current.week.sessions}
              testidPrefix="training-current"
            />
          ) : (
            <p className="app-lede">No sessions prescribed this week.</p>
          )}
        </div>
      ) : result.value.state === "upcoming" &&
        result.value.upcoming !== null ? (
        <p className="app-lede" data-testid="training-upcoming">
          Your training program “{result.value.upcoming.title}” starts{" "}
          {result.value.upcoming.startDate}.
        </p>
      ) : result.value.state === "completed" ? (
        <p className="app-lede" data-testid="training-completed">
          Your training program has ended.
        </p>
      ) : (
        <p className="app-lede" data-testid="training-empty">
          No training program yet.
        </p>
      )}
    </div>
  );
}
