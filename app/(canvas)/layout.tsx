import type { Metadata } from "next";
import type { ReactNode } from "react";

import { MotionProvider } from "@/components/canvas/motion-provider";
import "@/components/canvas/app/globals.css";
import "@/components/canvas/app/tracker.css";
import "@/components/canvas/app/weight.css";
import "@/components/canvas/ethereal/foundation-components.css";
import "@/components/canvas/app/appearance.css";

export const metadata: Metadata = {
  title: "Coaching UI — Ethereal edition",
  description:
    "Coaching dashboard, appearance customization, and client tracking.",
};

/** PR-01: the canvas styles and motion policy, scoped to the canvas routes. */
export default function CanvasLayout({ children }: { children: ReactNode }) {
  return <MotionProvider>{children}</MotionProvider>;
}
