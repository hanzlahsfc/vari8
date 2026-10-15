import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { AccessDeniedError } from "@/lib/auth/guard";
import { requireSessionUser } from "@/lib/auth/route-guard";
import { prisma } from "@/lib/db";
import {
  listAssignableCoachMembers,
  listClientAssignments,
} from "@/lib/workspace/clients";

import { AssignmentPanel } from "./assignment-panel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Client Coaches" };

const MAX_ID_LEN = 128;

/**
 * SOLO-COACH-I1 — owner-managed coach assignments (decision 111).
 *
 * Admission: session gate → bounded route-ID parse → client/workspace
 * coherence (404) → `listClientAssignments` collection authorization
 * (`clientAssignments/read`, workspace-scope-only → owner only). Every
 * denial maps to the repo-standard non-disclosing 403, including the
 * dual-role PLATFORM_ADMIN + ACTIVE owner-membership path (deny-set).
 *
 * Mutations are POST-only through ./actions; each action independently
 * re-authorizes inside the service transaction — this page's admission is
 * never the write authority.
 */
export default async function ClientCoachesPage({
  params,
}: {
  params: Promise<{ workspaceId: string; clientProfileId: string }>;
}) {
  const { workspaceId, clientProfileId } = await params;
  const { userId } = await requireSessionUser();

  if (
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    workspaceId.length > MAX_ID_LEN ||
    typeof clientProfileId !== "string" ||
    clientProfileId.length === 0 ||
    clientProfileId.length > MAX_ID_LEN
  )
    notFound();

  const session = { user: { id: userId } };

  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, workspaceId },
    select: { name: true },
  });
  if (client === null) notFound();

  let assignments;
  let eligibleMembers;
  try {
    assignments = await listClientAssignments(session, {
      workspaceId,
      clientProfileId,
      limit: 200,
    });
    eligibleMembers = await listAssignableCoachMembers(session, {
      workspaceId,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) forbidden();
    throw error;
  }

  return (
    <div className="catalog-page" data-testid="coach-assignments-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Client</p>
        <h1 className="app-title">Coaches — {client.name}</h1>
        <p className="app-lede">
          Coach assignments for this client. Assignments grant a coach or an
          assigned owner review access for this client only; removing one ends
          that access without changing workspace membership.
        </p>
      </header>
      <AssignmentPanel
        workspaceId={workspaceId}
        clientProfileId={clientProfileId}
        rows={assignments.items}
        members={eligibleMembers}
      />
      <p>
        <Link
          className="roster-pagination__link"
          href={`/workspace/${encodeURIComponent(workspaceId)}/clients`}
        >
          Back to clients
        </Link>
      </p>
    </div>
  );
}
