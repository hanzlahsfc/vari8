import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isTrainingPlansEnabled } from "@/lib/trainingprogram/gate";
import { readStaffTrainingProgramsFromAction } from "@/lib/trainingprogram/boundary";
import { prisma } from "@/lib/db";

import { TrainingProgramCreate } from "@/components/trainingprogram/program-create";
import { TrainingProgramList } from "@/components/trainingprogram/program-list";

export const dynamic = "force-dynamic";

export const metadata = { title: "Client Training Program" };

/**
 * TRAINING-I1A (PROMPT 244) — staff per-client training-program list.
 * Lifecycle-unfiltered with truthful labels (S): draft, pending, current,
 * superseded, dead and cancelled programs all render. Assigned coaches
 * and explicitly assigned owners author; unassigned owners keep
 * workspace-wide read; assistants read within assigned scope. Every
 * read/write re-authorizes inside its own transaction — the list is
 * display only.
 *
 * Feature gate first: an off/untrusted resolver returns 404 before any
 * session/database work.
 */
export default async function StaffClientTrainingProgramsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; clientProfileId: string }>;
}) {
  if (!isTrainingPlansEnabled()) notFound();

  const { workspaceId, clientProfileId } = await params;
  const { userId } = await requireSessionUser();
  if (
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    workspaceId.length > 128 ||
    typeof clientProfileId !== "string" ||
    clientProfileId.length === 0 ||
    clientProfileId.length > 128
  )
    notFound();

  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, workspaceId },
    select: { name: true },
  });

  const result = await readStaffTrainingProgramsFromAction(
    { user: { id: userId } },
    { workspaceId, clientProfileId },
  );

  return (
    <div className="tracker-page" data-testid="staff-training-page">
      <header className="tracker-page__header">
        <p className="tracker-page__eyebrow">
          <Link href={`/workspace/${workspaceId}/clients`}>Clients</Link>
        </p>
        <h1 className="app-title">
          Training programs{client ? ` — ${client.name}` : ""}
        </h1>
        <p className="app-lede">
          Week-based programs published as immutable versions. Values are
          displayed exactly as entered — nothing is calculated.
        </p>
      </header>

      {!result.ok ? (
        <p className="daily-errors" role="alert" data-testid="training-error">
          {result.message}
        </p>
      ) : (
        <>
          <TrainingProgramList
            workspaceId={workspaceId}
            clientProfileId={clientProfileId}
            initialPrograms={result.value.programs}
            initialCursor={result.value.nextCursor}
          />
          {result.value.canWrite ? (
            <TrainingProgramCreate
              workspaceId={workspaceId}
              clientProfileId={clientProfileId}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
