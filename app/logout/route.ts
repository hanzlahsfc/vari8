import { headers } from "next/headers";

import { auth } from "@/lib/auth/server";

/**
 * PR-01 sign-out for the canvas account dialog: a native form POST, so the
 * browser does a full page load to `/login` and no canvas state or styles
 * carry over. The session row is deleted and its cookie cleared; a request
 * without a live session still lands on `/login`.
 */
export async function POST(): Promise<Response> {
  const response = new Response(null, {
    status: 303,
    headers: { Location: "/login" },
  });
  try {
    const result = await auth.api.signOut({
      headers: await headers(),
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
