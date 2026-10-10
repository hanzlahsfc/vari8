import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";
import {
  listSchedulableVersionsForClient,
  listStaffCheckInInstances,
  listStaffCheckInSubmissions,
} from "@/lib/checkin/instances-boundary";
import { prisma } from "@/lib/db";

import { CancelCheckInInstanceButton } from "@/components/checkin/cancel-instance-button";
import { CheckInSubmissionReview } from "@/components/checkin/submission-review";
import { ScheduleCheckInInstanceForm } from "@/components/checkin/schedule-instance-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Client Check-Ins" };

const STATE_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  SUBMITTED: "Submitted",
  CANCELLED: "Cancelled",
};

/**
 * P-025-B — staff per-client Check-In instance surface (decisions #92–#97).
 * Instance headers only (no answer content); owner/coach may schedule +
 * cancel; assistant reads headers but gets no write controls; every write
 * re-authorizes inside its own serialized transaction — the page's list
 * and options calls authorize independently.
 *
 * Feature gate first: an off/untrusted resolver returns 404 before any
 * session/database work.
 */
export default async function StaffClientCheckInsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; clientProfileId: string }>;
}) {
  if (!isCheckInsEnabled()) notFound();

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

  const [instances, versions, submissions] = await Promise.all([
    listStaffCheckInInstances(
      { user: { id: userId } },
      { workspaceId, clientProfileId },
    ),
    listSchedulableVersionsForClient(
      { user: { id: userId } },
      { workspaceId, clientProfileId },
    ),
    // P-025-C — submission headers (answer-free) for the review queue.
    listStaffCheckInSubmissions(
      { user: { id: userId } },
      { workspaceId, clientProfileId },
    ),
  ]);

  const denied = !instances.ok && !versions.ok;
  const canWrite = versions.ok;

  return (
    <div className="tracker-page" data-testid="staff-checkins-page">
      <header className="tracker-page__header">
        <p className="tracker-page__eyebrow">
          <Link href={`/workspace/${workspaceId}/clients`}>Clients</Link>
        </p>
        <h1 className="app-title">
          Check-Ins{client ? ` — ${client.name}` : ""}
        </h1>
        <p className="app-lede">
          One-off Check-Ins scheduled for this client. Answer content is never
          shown here.
        </p>
      </header>

      {denied ? (
        <p className="daily-errors" role="alert" data-testid="checkins-denied">
          {instances.ok === false
            ? instances.message
            : "You don’t have access to this Check-In."}
        </p>
      ) : (
        <>
          {canWrite ? (
            <section
              className="tracker-section"
              data-testid="checkin-schedule-section"
            >
              <h2 className="tracker-section__title">Schedule a Check-In</h2>
              <ScheduleCheckInInstanceForm
                workspaceId={workspaceId}
                clientProfileId={clientProfileId}
                options={
                  versions.ok
                    ? versions.value.options.map(
                        ({ position, formName, versionSeq }) => ({
                          position,
                          formName,
                          versionSeq,
                        }),
                      )
                    : []
                }
              />
            </section>
          ) : null}

          <section className="tracker-section">
            <h2 className="tracker-section__title">Scheduled Check-Ins</h2>
            {!instances.ok ? (
              <p className="daily-errors" role="alert">
                {instances.message}
              </p>
            ) : instances.value.items.length === 0 ? (
              <p className="app-lede" data-testid="staff-checkins-empty">
                No Check-Ins scheduled for this client.
              </p>
            ) : (
              <ul className="tracker-list" data-testid="staff-checkins-list">
                {instances.value.items.map((item) => (
                  <li
                    key={item.instanceId}
                    className="tracker-list__row"
                    data-testid={`staff-checkin-${item.state.toLowerCase()}`}
                  >
                    <span className="tracker-list__title">
                      {item.formName} — v{item.versionSeq}
                    </span>
                    <span className="tracker-list__sub">
                      Due{" "}
                      {new Date(item.dueAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {STATE_LABEL[item.state]}
                      {item.late ? " · Late" : ""}
                      {item.submittedAt
                        ? ` · Submitted ${new Date(item.submittedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                        : ""}
                    </span>
                    {canWrite && item.state === "SCHEDULED" ? (
                      <CancelCheckInInstanceButton
                        workspaceId={workspaceId}
                        clientProfileId={clientProfileId}
                        instanceId={item.instanceId}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {submissions.ok ? (
            <CheckInSubmissionReview
              workspaceId={workspaceId}
              clientProfileId={clientProfileId}
              items={submissions.value.items}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
