import { forbidden } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { type CanvasViewer, getCanvasViewer } from "@/lib/auth/viewer";

/**
 * PR-01 canvas gate: signed out goes to `/login`; a user without an owner or
 * coach membership gets the 403 page. Every canvas page calls it, so a soft
 * navigation cannot skip the check that a shared layout would only run once.
 */
export async function requireCanvasViewer(): Promise<CanvasViewer> {
  const { userId } = await requireSessionUser();
  const viewer = await getCanvasViewer(userId);
  if (!viewer) forbidden();
  return viewer;
}
