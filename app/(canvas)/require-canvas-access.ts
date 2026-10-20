import { forbidden, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import {
  type CanvasViewer,
  type ClientViewer,
  getCanvasViewer,
  getClientViewer,
} from "@/lib/auth/viewer";

/**
 * PR-01 canvas gate: signed out goes to `/login`; a user without an owner or
 * coach membership gets the 403 page. Every canvas page calls it, so a soft
 * navigation cannot skip the check that a shared layout would only run once.
 *
 * PR-W1: a signed-in client (CLIENT membership plus an own `ClientProfile`)
 * never sees a staff surface — the gate redirects to `/me` instead of 403, so
 * `/coach` and `/ethereal` land a client on their own tracker.
 */
export async function requireCanvasAccess(): Promise<CanvasViewer> {
  const { userId } = await requireSessionUser();
  const viewer = await getCanvasViewer(userId);
  if (viewer) return viewer;
  if (await getClientViewer(userId)) redirect("/me");
  forbidden();
}

/**
 * PR-W1 `/me` gate (S11-18): only a client bound to their own `ClientProfile`
 * reaches the client home. Staff, unlinked clients (no profile yet) and any
 * other principal fail closed with the 403 page.
 */
export async function requireClientAccess(): Promise<ClientViewer> {
  const { userId } = await requireSessionUser();
  const viewer = await getClientViewer(userId);
  if (!viewer) forbidden();
  return viewer;
}
