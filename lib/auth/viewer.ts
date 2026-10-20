import { headers } from "next/headers";

import { prisma } from "../db";
import { auth } from "./server";

/**
 * PR-05 viewer resolution — the stable identity seam every page/action/service
 * consumes (`session.user.id` survives the Auth.js -> Better Auth swap).
 *
 * A viewer exists only when a live session resolves AND the user row is still
 * ACTIVE — one indexed read per resolution, same guarantee the old JWT
 * sessionVersion gate provided (a deactivated account stops working on the
 * very next request, not just at the next sign-in).
 */
export type Viewer = { id: string; email: string; name: string | null };

export async function getViewerFromHeaders(
  requestHeaders: Headers,
): Promise<Viewer | null> {
  try {
    const session = await auth.api.getSession({ headers: requestHeaders });
    const userId = session?.user?.id;
    if (typeof userId !== "string" || userId.length === 0) return null;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") return null;
    return { id: user.id, email: user.email, name: user.name };
  } catch {
    // Fail closed: a session-store error or malformed resolution is an
    // anonymous viewer (401 downstream), never a 500 on a protected route.
    return null;
  }
}

export async function getViewer(): Promise<Viewer | null> {
  return getViewerFromHeaders(await headers());
}
