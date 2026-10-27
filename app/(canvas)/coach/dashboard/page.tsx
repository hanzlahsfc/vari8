import { Suspense } from "react";

import { CoachDashboardSurface } from "@/components/canvas/coach/builder/dashboard-surface";

import { requireCanvasAccess } from "../../require-canvas-access";

export const dynamic = "force-dynamic";

export const metadata = { title: "Coach dashboard" };

/**
 * W2-T5 (R11): mounts the editable dashboard builder on the real coach
 * account, workspace-bound. The template-level dashboard seam (wiring
 * doc screen 11, MISSING at base) owns the permanent host when it lands.
 */
export default async function CoachDashboardPage() {
  const viewer = await requireCanvasAccess();
  return (
    <Suspense>
      <CoachDashboardSurface workspaceId={viewer.workspace.id} />
    </Suspense>
  );
}
