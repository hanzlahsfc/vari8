import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { getCanvasViewer, getClientViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = {
  title: "Coaching UI — Ethereal edition",
  description: "Coaching workspace and client tracker.",
};

/**
 * PR-W1 role-aware landing (shell S1): `/` sends each signed-in role to its
 * home — owner/coach staff to `/coach`, a bound client to `/me`. Staff wins
 * when a user holds both bindings. Signed out goes to `/login` (session
 * gate); any other principal fails closed with the 403 page.
 */
export default async function CanvasLandingPage() {
  const { userId } = await requireSessionUser();
  if (await getCanvasViewer(userId)) redirect("/coach");
  if (await getClientViewer(userId)) redirect("/me");
  forbidden();
}
