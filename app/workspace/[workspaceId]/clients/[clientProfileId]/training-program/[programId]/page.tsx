import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isTrainingPlansEnabled } from "@/lib/trainingprogram/gate";
import {
  readStaffTrainingProgramFromAction,
  readStaffTrainingProgramsFromAction,
} from "@/lib/trainingprogram/boundary";
import { prisma } from "@/lib/db";

import { TrainingProgramEditor } from "@/components/trainingprogram/program-editor";
import { TrainingBookings } from "@/components/trainingprogram/program-bookings";
import { TrainingVersionHistory } from "@/components/trainingprogram/version-history";

export const dynamic = "force-dynamic";

export const metadata = { title: "Training Program" };

/**
 * TRAINING-I1A (PROMPT 244) — staff program detail: shared draft editor,
 * publish/cancel controls and lifecycle-unfiltered version history (S).
 * Every write re-authorizes inside its own serialized transaction —
 * `canWrite` here only shapes the UI.
 */
export default async function StaffTrainingProgramPage({
  params,
}: {
  params: Promise<{
    workspaceId: string;
    clientProfileId: string;
    programId: string;
  }>;
}) {
  if (!isTrainingPlansEnabled()) notFound();

  const { workspaceId, clientProfileId, programId } = await params;
  const { userId } = await requireSessionUser();
  if (
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    workspaceId.length > 128 ||
    typeof clientProfileId !== "string" ||
    clientProfileId.length === 0 ||
    clientProfileId.length > 128 ||
    typeof programId !== "string" ||
    programId.length === 0 ||
    programId.length > 128
  )
    notFound();

  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, workspaceId },
    select: { name: true },
  });

  const result = await readStaffTrainingProgramFromAction(
    { user: { id: userId } },
    { workspaceId, clientProfileId, programId },
  );
  // Predecessor candidates: published programs (the service enforces
  // tail-only claims — the list is display convenience only).
  const programs = await readStaffTrainingProgramsFromAction(
    { user: { id: userId } },
    { workspaceId, clientProfileId },
  );
  const publishedPrograms = programs.ok
    ? programs.value.programs
        .filter(
          (p) =>
            p.programId !== programId &&
            (p.state === "current" || p.state === "pending"),
        )
        .map((p) => ({ id: p.programId, title: p.title }))
    : [];

  return (
    <div className="tracker-page" data-testid="staff-training-detail">
      <header className="tracker-page__header">
        <p className="tracker-page__eyebrow">
          <Link
            href={`/workspace/${workspaceId}/clients/${clientProfileId}/training-program`}
          >
            Training programs{client ? ` — ${client.name}` : ""}
          </Link>
        </p>
        <h1 className="app-title">
          {result.ok ? result.value.program.title : "Training program"}
        </h1>
        <p className="app-lede">
          Prescription values are displayed exactly as entered — nothing is
          calculated.
        </p>
      </header>

      {!result.ok ? (
        <p className="daily-errors" role="alert" data-testid="training-error">
          {result.message}
        </p>
      ) : (
        <>
          <TrainingProgramEditor
            workspaceId={workspaceId}
            clientProfileId={clientProfileId}
            program={result.value.program}
            publishedPrograms={publishedPrograms}
            canWrite={result.value.canWrite}
          />
          <TrainingBookings
            workspaceId={workspaceId}
            clientProfileId={clientProfileId}
            programId={programId}
            initial={result.value.bookings}
            bookableSessions={result.value.bookableSessions}
            canWrite={result.value.canWrite}
          />
          <TrainingVersionHistory
            workspaceId={workspaceId}
            clientProfileId={clientProfileId}
            programId={programId}
            initialVersions={result.value.versions}
            initialCursor={result.value.nextVersionCursor}
            programCancelled={result.value.program.cancelledAt !== null}
          />
        </>
      )}
    </div>
  );
}
