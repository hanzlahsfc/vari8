import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { memberRoleToRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";

import { PhotosPanel } from "./photos-panel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Progress photos" };

/**
 * Card 08 (#172) - staff per-client progress-photo gallery + comparator.
 * The page itself only gates the surface to active staff (owner/coach);
 * every read and mutation inside the panel goes through the /api/v1
 * routes, which re-authorize with the caller's capability scope.
 */
export default async function StaffClientPhotosPage({
  params,
}: {
  params: Promise<{ workspaceId: string; clientProfileId: string }>;
}) {
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

  const member = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspaceId,
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    },
    select: { role: true },
  });
  const role = member ? memberRoleToRole(member.role) : null;
  if (role !== "owner" && role !== "coach") notFound();

  // The client name is tenant data: read it only after the staff gate.
  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, workspaceId },
    select: { name: true },
  });
  if (!client) notFound();

  return (
    <div className="catalog-page" data-testid="staff-photos-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">
          <Link href={`/workspace/${workspaceId}/clients`}>Clients</Link>
        </p>
        <h1 className="app-title">Progress photos - {client.name}</h1>
        <p className="app-lede">Dated photos and side-by-side comparison.</p>
      </header>
      <PhotosPanel
        workspaceId={workspaceId}
        clientProfileId={clientProfileId}
      />
    </div>
  );
}
