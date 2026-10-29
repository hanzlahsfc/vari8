// FULL-PACKAGE SLICE of #175
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isIifymPlansEnabled } from "@/lib/iifym/gate";
import { prisma } from "@/lib/db";

import { MacroTargetsEditor } from "@/components/iifym/macro-targets-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Client Macro Targets" };

/**
 * Card 10 (#175) — staff per-client macro-target surface. Assigned
 * coaches AND explicitly assigned owners author the shared draft and
 * publish immutable effective-dated versions; unassigned owners keep
 * workspace-wide READ only; assistants read within assigned scope;
 * SUPPORT and PLATFORM_ADMIN (dual-role inclusive) are denied. Every
 * write re-authorizes inside its own serialized transaction on the
 * /api/v1 iifym-plans routes — capability flags here shape the UI only.
 *
 * Feature gate first: an off/untrusted resolver returns 404 before any
 * session/database work. The client name is tenant data: read it only
 * for the header after the session is established; the editor's own
 * GET re-authorizes before any plan data is returned.
 */
export default async function StaffClientMacroTargetsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; clientProfileId: string }>;
}) {
  if (!isIifymPlansEnabled()) notFound();

  const { workspaceId, clientProfileId } = await params;
  await requireSessionUser();
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

  return (
    <div className="tracker-page" data-testid="staff-macro-targets-page">
      <header className="tracker-page__header">
        <p className="tracker-page__eyebrow">
          <Link href={`/workspace/${workspaceId}/clients`}>Clients</Link>
        </p>
        <h1 className="app-title">
          Macro targets{client ? ` — ${client.name}` : ""}
        </h1>
        <p className="app-lede">
          Coach-entered daily macro targets per option and weekday. Calories
          derive from protein, carbohydrate and fat at 4, 4 and 9 kcal per gram
          — a calorie-only target mode is entered directly and labelled.
        </p>
      </header>
      <MacroTargetsEditor
        workspaceId={workspaceId}
        clientProfileId={clientProfileId}
      />
    </div>
  );
}
