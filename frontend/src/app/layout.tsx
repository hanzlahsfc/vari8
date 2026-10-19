import type { Metadata } from "next";
import { MotionProvider } from "@/components/motion-provider";
import "./globals.css";
import "./tracker.css";
import "./weight.css";
import "@/components/ethereal/foundation-components.css";
import "./appearance.css";
export const metadata: Metadata = {
  title: "Coaching UI — Ethereal edition",
  description:
    "Coaching dashboard, appearance customization, and client tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
