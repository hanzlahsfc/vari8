"use client";

import { useState } from "react";
import { newTemplate, type Variant } from "../model";
import { CoachProvider } from "../store";
import { CoachDashboardEditor } from "./coach-dashboard";
import type { DashboardDraft } from "./schema";

/**
 * W2-T5 (R11): the editable coach dashboard surface. Until the template
 * level dashboard seam lands its own host, this mounts the dashboard
 * builder against a draft variant so the CU19 triage widget (and every
 * catalogue widget) runs with live workspace-bound records.
 */
export function CoachDashboardSurface({
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
