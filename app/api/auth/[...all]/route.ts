import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth/server";

/**
 * PR-05: Better Auth HTTP surface (replaces the Auth.js [...nextauth]
 * catch-all). Mounted at /api/auth/* — sign-in, sign-out, session,
 * request-password-reset, reset-password, change-password.
 */
export const { GET, POST } = toNextJsHandler(auth.handler);
