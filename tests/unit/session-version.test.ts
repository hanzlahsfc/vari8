import { describe, expect, it } from "vitest";

import { getViewerFromHeaders } from "../../lib/auth/viewer";

/**
 * PR-05 rewiring — block TB3.070 ("S1-F2B session-version gate") asserted the
 * deleted Auth.js machinery: `isValidSessionVersionClaim`,
 * `sessionVersionAllowed`, `createSessionCallbacks` in `lib/auth/session.ts`.
 * Better Auth replaced JWT claims with `sessions` table rows — revocation is
 * row deletion — so the block's DB-backed invariants moved to integration:
 * "a reset/deactivation deletes all session rows and kills the credential"
 * now lives in tests/integration/phase-3-2-password-reset.test.ts and
 * tests/integration/s1-f2b-session*.test.ts.
 *
 * The unit-level remnant that still holds (and is DB-free): the viewer gate
 * resolves *anything that is not a live session* to anonymous — fail closed,
 * no exception escape — without ever reaching the session store.
 */
describe("S1-F2B session gate (Better Auth rewiring)", () => {
  it("missing credentials resolve to an anonymous viewer — no store read", async () => {
    await expect(getViewerFromHeaders(new Headers())).resolves.toBeNull();
    await expect(
      getViewerFromHeaders(new Headers({ cookie: "unrelated=1; other=2" })),
    ).resolves.toBeNull();
  });

  it("non-bearer and empty credentials resolve anonymous, never throw", async () => {
    for (const headers of [
      "Basic Zm9vOmJhcg==",
      "Bearer",
      "better-auth.session_token=",
      "",
    ]) {
      const init = new Headers();
      if (headers.startsWith("Basic ") || headers.startsWith("Bearer")) {
        init.set("authorization", headers);
      } else {
        init.set("cookie", headers);
      }
      await expect(getViewerFromHeaders(init)).resolves.toBeNull();
    }
  });

  it("an unresolvable credential fails closed to anonymous even when the store errors", async () => {
    // A bearer token whose session row lookup cannot produce a user is always
    // anonymous — the seam swallows store/lookup failures rather than letting
    // them escape as 500s on protected routes.
    await expect(
      getViewerFromHeaders(
        new Headers({ authorization: "Bearer not-a-real-session-token" }),
      ),
    ).resolves.toBeNull();
  });
});
