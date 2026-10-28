import { headers } from "next/headers";

import { auth } from "@/lib/auth/server";
import { signOutPath } from "@/lib/auth/viewer";

/**
 * PR-01 sign-out for the canvas account dialog: a native form POST, so the
 * browser does a full page load to the sign-in page and no canvas state or
 * styles carry over. The session row is deleted and its cookie cleared; a
 * request without a live session still lands on the staff sign-in.
 *
 * O17: a client session lands on `/me/login`, the client sign-in, instead of
 * `/login`. The role is read before the session row is deleted.
 */
export async function POST(): Promise<Response> {
  const requestHeaders = await headers();
  let location = "/login";
  try {
    const session = await auth.api.getSession({ headers: requestHeaders });
    location = await signOutPath(session?.user?.id);
  } catch {
    // No live session: nothing to resolve, keep the staff sign-in.
  }
  const response = new Response(null, {
    status: 303,
    headers: { Location: location },
  });
  try {
    const result = await auth.api.signOut({
      headers: requestHeaders,
      asResponse: true,
    });
    for (const cookie of result.headers.getSetCookie()) {
      response.headers.append("Set-Cookie", cookie);
    }
  } catch {
    // No live session: nothing to clear.
  }
  return response;
}
