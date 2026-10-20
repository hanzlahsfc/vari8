import type { Metadata } from "next";

import { EtherealApp } from "@/components/canvas/ethereal/coaching-app";
import "@/components/canvas/ethereal/ethereal-shell.css";
import "@/components/canvas/ethereal/ethereal-specimens.css";
import "@/components/canvas/ethereal/ethereal-appearance.css";
import "@/components/canvas/ethereal/builder/builder.css";
import "@/components/canvas/ethereal/builder/gallery.css";
import "@/components/canvas/ethereal/builder/widgets.css";

import { requireCanvasAccess } from "../require-canvas-access";

export const metadata: Metadata = {
  title: "Coaching UI — Ethereal edition",
  description:
    "An interactive coaching component studio with an Ethereal Glass canvas and independent appearance settings.",
};

export default async function EtherealPage() {
  await requireCanvasAccess();
  return <EtherealApp />;
}
