import Link from "next/link";
import { forbidden } from "next/navigation";

import { AccessDeniedError, authorize } from "@/lib/auth/guard";
import { requireSessionUser } from "@/lib/auth/route-guard";
import { prisma } from "@/lib/db";
import { isOnboardingSubmissionEnabled } from "@/lib/onboarding/submission-gate";
import { listClientSubmissionsForReview } from "@/lib/onboarding/review-boundary";
import { createPrismaAuthorizationRepo } from "@/lib/workspace/access";

import { OnboardingReviewPanel } from "./review-panel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Onboarding submissions" };

/**
 * P-024 — staff onboarding-submission review (decisions #86–#91).
 *
 * Wrapped by the staff workspace layout (workspaceSettings/read), so
 * CLIENT/SUPPORT/non-members already deny there; this page re-authorizes
 * `onboardingSubmissionReviews/read` for the selected client as an early
 * denial only — detail and mark actions re-authorize inside their
 * Serializable transactions.
 *
 * The dev gate (`ENABLE_ONBOARDING_SUBMISSION`) is fail-closed: off → a
 * non-disclosing unavailable state with zero fetches. The GET is a pure
 * header read — form name, pinned version seq, submittedAt, review
 * provenance; no answers and zero audit rows. `?c=` is a strict keyset
 * cursor bound to the (workspace, client) selection.
 */
export default async function StaffClientOnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; clientProfileId: string }>;
  searchParams: Promise<{ c?: string | string[] }>;
}) {
  const { workspaceId, clientProfileId } = await params;
  const raw = await searchParams;
  if (
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    workspaceId.length > 128 ||
    typeof clientProfileId !== "string" ||
    clientProfileId.length === 0 ||
    clientProfileId.length > 128
  )
    forbidden();
  const { session } = await requireSessionUser();

  // Early denial only — never authoritative for disclosure.
  let ctx;
  try {
    ctx = await authorize(
      session,
      {
        resource: "onboardingSubmissionReviews",
        action: "read",
        workspaceId,
        clientProfileId,
      },
      createPrismaAuthorizationRepo(prisma),
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) forbidden();
    throw error;
  }
  // Staff review exists only for workspace/assigned scopes — the client's
  // own scope is not a staff view.
  if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
    forbidden();

  const backHref = `/workspace/${encodeURIComponent(workspaceId)}/clients`;

  if (
    !isOnboardingSubmissionEnabled(process.env.ENABLE_ONBOARDING_SUBMISSION)
  ) {
    return (
      <UnavailableShell
        backHref={backHref}
        message="Onboarding submissions are currently unavailable."
      />
    );
  }

  const cursor = typeof raw.c === "string" ? raw.c : undefined;
  const list = await listClientSubmissionsForReview(session, {
    workspaceId,
    clientProfileId,
    cursor,
  });
  if (!list.ok) {
    return (
      <UnavailableShell
        backHref={backHref}
        message={
          list.message === "Check the form details and try again."
            ? "Onboarding submissions are currently unavailable."
            : list.message
        }
        testId={
          list.message === "This form is not available."
            ? "staff-onboarding-consent"
            : "staff-onboarding-unavailable"
        }
      />
    );
  }

  const basePath = `/workspace/${encodeURIComponent(workspaceId)}/clients/${encodeURIComponent(clientProfileId)}/onboarding`;
  const nextHref =
    list.value.state === "ready" && list.value.nextCursor !== null
      ? `${basePath}?c=${encodeURIComponent(list.value.nextCursor)}`
      : null;

  if (list.value.state === "consent_missing") {
    return (
      <UnavailableShell
        backHref={backHref}
        testId="staff-onboarding-consent"
        message="The client's required consent is not in place, so onboarding submissions can't be reviewed."
      />
    );
  }

  return (
    <div className="catalog-page" data-testid="staff-onboarding-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">
          <Link href={backHref}>Clients</Link>
        </p>
        <h1 className="app-title">Onboarding — {list.value.clientName}</h1>
        <p className="app-lede">
          Review submitted onboarding responses. Answers are shown only through
          an explicit details view; coaches can mark a submission reviewed.
        </p>
      </header>

      {list.value.items.length === 0 ? (
        <div
          className="empty-state"
          data-testid="staff-onboarding-empty"
          role="status"
        >
          <p>No onboarding submissions to show.</p>
          <p>This client has not submitted any onboarding forms yet.</p>
        </div>
      ) : (
        <OnboardingReviewPanel
          workspaceId={workspaceId}
          clientProfileId={clientProfileId}
          clientName={list.value.clientName}
          items={list.value.items}
          nextHref={nextHref}
        />
      )}
    </div>
  );
}

function UnavailableShell({
  backHref,
  message,
  testId = "staff-onboarding-unavailable",
}: {
  backHref: string;
  message: string;
  testId?: string;
}) {
  return (
    <div className="catalog-page" data-testid="staff-onboarding-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">
          <Link href={backHref}>Clients</Link>
        </p>
        <h1 className="app-title">Onboarding</h1>
      </header>
      <p className="app-lede" role="status" data-testid={testId}>
        {message}
      </p>
    </div>
  );
}
