import type { Metadata } from "next";
import { Suspense } from "react";

import { CoachApp } from "@/components/canvas/coach/coach-app";

import { requireCanvasViewer } from "../require-canvas-viewer";

export const metadata: Metadata = {
  title: "Coach — Ethereal workspace",
  description:
    "Templates, check-ins and conversations, in one coaching workspace.",
};

export default async function CoachPage() {
  const viewer = await requireCanvasViewer();
  return (
    <Suspense>
      <CoachApp
        viewer={{
          name: viewer.name,
          initials: viewer.initials,
          role: viewer.role,
        }}
      />
    </Suspense>
  );
}
