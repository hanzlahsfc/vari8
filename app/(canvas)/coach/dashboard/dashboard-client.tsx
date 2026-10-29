"use client";

import { useState } from "react";

import { newTemplate, type Variant } from "@/components/canvas/coach/model";
import { CoachProvider } from "@/components/canvas/coach/store";
import { CoachDashboardEditor } from "@/components/canvas/coach/builder/coach-dashboard";
import type { DashboardDraft } from "@/components/canvas/coach/builder/schema";

/**
 * W2-T5 (R11): mounts the editable dashboard builder on the real coach
 * account, workspace-bound. The template-level dashboard seam (wiring
 * doc screen 11, MISSING at base) owns the permanent host when it lands.
 */
export function CoachDashboardClient({
  workspaceId,
}: {
  workspaceId?: string;
}) {
  const [variant, setVariant] = useState<Variant>(
    () => newTemplate("coach-dashboard").variants[0],
  );
  return (
    <CoachProvider workspaceId={workspaceId}>
      <CoachDashboardEditor
        variant={variant}
        onChange={(dashboard: DashboardDraft) =>
          setVariant((current) => ({ ...current, dashboard }))
        }
      />
    </CoachProvider>
  );
}
