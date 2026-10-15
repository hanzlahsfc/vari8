import type { Metadata } from "next";
import { Suspense } from "react";
import { CoachApp } from "@/components/coach/coach-app";
export const metadata: Metadata = {
  title: "Coach — Ethereal workspace",
  description:
    "Templates, check-ins and conversations, in one coaching workspace.",
};
export default function CoachPage() {
  return (
    <Suspense>
      <CoachApp />
    </Suspense>
  );
}
