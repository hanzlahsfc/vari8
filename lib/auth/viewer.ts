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

/**
 * PR-01 canvas account identity (D18): the signed-in member as the canvas
 * account block shows it. `role` is the real workspace role, `Owner` or
 * `Coach`; a user with no ACTIVE owner/coach membership in an ACTIVE
 * workspace has no canvas account (`null`), so the canvas fails closed.
 * With several staff workspaces the first by workspace name is shown (no
 * switcher, ruling O15). The session itself is never read here: callers pass
 * the user id from the session gate (`requireSessionUser`, ruling O9).
 */
export type CanvasRole = "Owner" | "Coach";
export type CanvasViewer = {
  name: string;
  initials: string;
  role: CanvasRole;
  workspace: { id: string; name: string };
};

const CANVAS_ROLES = {
  WORKSPACE_OWNER: "Owner",
  COACH: "Coach",
} as const satisfies Record<string, CanvasRole>;

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((w) => w[0]!.toUpperCase()).join("");
}

export async function getCanvasViewer(
  userId: string,
): Promise<CanvasViewer | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      status: true,
      memberships: {
        where: {
          status: "ACTIVE",
          role: { in: ["WORKSPACE_OWNER", "COACH"] },
          workspace: { status: "ACTIVE" },
        },
        select: { role: true, workspace: { select: { id: true, name: true } } },
        orderBy: { workspace: { name: "asc" } },
        take: 1,
      },
    },
  });
  const membership = user?.memberships[0];
  if (!user || user.status !== "ACTIVE" || !membership) return null;
  const role = CANVAS_ROLES[membership.role as keyof typeof CANVAS_ROLES];
  const name = user.name?.trim() || user.email;
  return {
    name,
    initials: initialsOf(name),
    role,
    workspace: membership.workspace,
  };
}

/**
 * PR-W1 client identity (S11-18): the signed-in client as `/me` shows them,
 * bound to their own `ClientProfile`. A client viewer exists only when the
 * user is ACTIVE AND holds an ACTIVE CLIENT membership in an ACTIVE workspace
 * AND an unarchived profile in that workspace is linked to their user id — a
 * membership without a profile (pre-onboarding, ruling O6) fails closed, as
 * does an archived profile. With several client workspaces the first by
 * workspace name is shown (no switcher, ruling O15). The session itself is
 * never read here: callers pass the user id from the session gate
 * (`requireSessionUser`, ruling O9).
 */
export type ClientViewer = {
  name: string;
  initials: string;
  workspace: { id: string; name: string };
  clientProfileId: string;
};

export async function getClientViewer(
  userId: string,
): Promise<ClientViewer | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      status: true,
      clientProfiles: {
        where: {
          archivedAt: null,
          workspace: {
            status: "ACTIVE",
            members: {
              some: { userId, role: "CLIENT", status: "ACTIVE" },
            },
          },
        },
        select: {
          id: true,
          name: true,
          workspace: { select: { id: true, name: true } },
        },
        orderBy: { workspace: { name: "asc" } },
        take: 1,
      },
    },
  });
  const profile = user?.clientProfiles[0];
  if (!user || user.status !== "ACTIVE" || !profile) return null;
  const name = profile.name.trim() || "Client";
  return {
    name,
    initials: initialsOf(name),
    workspace: profile.workspace,
    clientProfileId: profile.id,
  };
}

/**
 * O17: the page a signed-out principal lands on. A client returns to the
 * client sign-in, everyone else keeps the staff one.
 */
export async function signOutPath(
  userId: string | undefined | null,
): Promise<string> {
  if (!userId) return "/login";
  return (await getClientViewer(userId)) ? "/me/login" : "/login";
}
