import type { Metadata } from "next";
import { Suspense } from "react";

import { CoachApp } from "@/components/canvas/coach/coach-app";

import { requireCanvasAccess } from "../require-canvas-access";

export const metadata: Metadata = {
  title: "Coach — Ethereal workspace",
  description:
    "Templates, check-ins and conversations, in one coaching workspace.",
};

export default async function CoachPage() {
  const viewer = await requireCanvasAccess();
  return (
    <Suspense>
      <CoachApp
        viewer={{
          name: viewer.name,
          initials: viewer.initials,
          role: viewer.role,
          workspaceId: viewer.workspace.id,
        }}
      />
    </Suspense>
  );
}
