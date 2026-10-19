import type { Metadata } from "next";
import { EtherealApp } from "@/components/ethereal/coaching-app";
import "@/components/ethereal/ethereal-shell.css";
import "@/components/ethereal/ethereal-specimens.css";
import "@/components/ethereal/ethereal-appearance.css";
import "@/components/ethereal/builder/builder.css";
import "@/components/ethereal/builder/gallery.css";
import "@/components/ethereal/builder/widgets.css";

export const metadata: Metadata = {
  title: "Coaching UI — Ethereal edition",
  description:
    "An interactive coaching component studio with an Ethereal Glass canvas and independent appearance settings.",
};

export default function EtherealPage() {
  return <EtherealApp />;
}
