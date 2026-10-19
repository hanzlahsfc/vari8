import { describe, expect, it } from "vitest";

import {
  createSessionCallbacks,
  isValidSessionVersionClaim,
  sessionVersionAllowed,
  type SessionUserGateLookup,
} from "../../lib/auth/session";

const base = {
  jwt: async ({ token, user }: never) => {
    const t = token as Record<string, unknown>;
    if (user) t.sub = (user as { id: string }).id;
    return t;
  },
  session: async ({ session, token }: never) => {
    const s = session as { user: { id: string } };
    s.user.id = ((token as Record<string, unknown>).sub as string) ?? "";
    return s;
  },
};

describe("S1-F2B session-version gate", () => {
  it("accepts only non-negative integer sv claims", () => {
    expect(isValidSessionVersionClaim(0)).toBe(true);
    expect(isValidSessionVersionClaim(7)).toBe(true);
    for (const bad of [
      -1,
      1.5,
      NaN,
      "0",
      "7",
      null,
      undefined,
      true,
      { version: 0 },
    ]) {
      expect(isValidSessionVersionClaim(bad)).toBe(false);
    }
  });

  it("rejects malformed sub/sv, unknown user, inactive user, mismatched sv", async () => {
    const active = { id: "u1", status: "ACTIVE", sessionVersion: 3 };
    const lookup: SessionUserGateLookup = async (id) =>
      id === "u1" ? active : null;
    expect(await sessionVersionAllowed("u1", 3, lookup)).toBe(true);
    expect(await sessionVersionAllowed("u1", 2, lookup)).toBe(false);
    expect(await sessionVersionAllowed("u1", 4, lookup)).toBe(false);
    expect(await sessionVersionAllowed("u1", "3", lookup)).toBe(false);
    expect(await sessionVersionAllowed("u1", undefined, lookup)).toBe(false);
    expect(await sessionVersionAllowed("u1", -1, lookup)).toBe(false);
    expect(await sessionVersionAllowed("u1", 1.5, lookup)).toBe(false);
    expect(await sessionVersionAllowed("", 3, lookup)).toBe(false);
    expect(await sessionVersionAllowed(undefined, 3, lookup)).toBe(false);
    expect(await sessionVersionAllowed("ghost", 3, lookup)).toBe(false);
    expect(
      await sessionVersionAllowed("u1", 3, async () => ({
        id: "u1",
        status: "DEACTIVATED",
        sessionVersion: 3,
      })),
    ).toBe(false);
    expect(
      await sessionVersionAllowed("u1", 3, async () => ({
        id: "u1",
        status: "INVITED",
        sessionVersion: 3,
      })),
    ).toBe(false);
  });

  it("fails closed when the database lookup throws", async () => {
    const broken: SessionUserGateLookup = async () => {
      throw new Error("db down");
    };
    expect(await sessionVersionAllowed("u1", 0, broken)).toBe(false);
  });

  it("jwt stamps sv only at sign-in (never from client/token input)", async () => {
    const good = { id: "u1", status: "ACTIVE", sessionVersion: 5 };
    const callbacks = createSessionCallbacks(base as never, async (id) =>
      id === "u1" ? good : null,
    );
    // Sign-in shape: user object carries the DB sessionVersion.
    const issued = await callbacks.jwt({
      token: {} as never,
      user: { id: "u1", sessionVersion: 5 } as never,
    });
    expect((issued as Record<string, unknown>).sv).toBe(5);
    // Refresh with a matching claim passes the gate untouched.
    const refreshed = await callbacks.jwt({
      token: { sub: "u1", sv: 5 } as never,
      user: undefined,
    });
    expect((refreshed as Record<string, unknown>)?.sv).toBe(5);
    // An update-trigger call carries a client payload — it can NEVER inject
    // sv: the payload is ignored and the token's sv is still DB-gated.
    const updateAttempt = await callbacks.jwt({
      token: { sub: "u1", sv: 4 } as never, // stale after a reset
      user: undefined,
      trigger: "update",
      session: { sv: 5, sub: "u1" } as never,
    });
    expect(updateAttempt).toBeNull();
    const injected = await callbacks.jwt({
      token: { sv: 999 } as never,
      user: { id: "u1", sessionVersion: 5 } as never,
    });
    // A re-sign-in re-stamps from the authoritative record, not token input.
    expect((injected as Record<string, unknown>)?.sv).toBe(5);
  });

  it("jwt returns null for every rejection — the supported invalidation", async () => {
    const good = { id: "u1", status: "ACTIVE", sessionVersion: 2 };
    const callbacks = createSessionCallbacks(base as never, async (id) =>
      id === "u1" ? good : null,
    );
    const mk = (token: Record<string, unknown>) => ({
      token: token as never,
      user: undefined,
    });
    expect(await callbacks.jwt(mk({ sub: "u1", sv: 2 }))).not.toBeNull();
    expect(await callbacks.jwt(mk({ sub: "u1", sv: 1 }))).toBeNull();
    expect(await callbacks.jwt(mk({ sub: "u1" }))).toBeNull();
    expect(await callbacks.jwt(mk({ sub: "u1", sv: "2" }))).toBeNull();
    expect(await callbacks.jwt(mk({ sub: "ghost", sv: 2 }))).toBeNull();
    expect(await callbacks.jwt(mk({}))).toBeNull();
    // A null token means the runtime drops the session entirely — the session
    // callback never runs and cannot resurrect an invalid session.
  });

  it("composes with base callbacks: extra keys survive, base jwt/session run", async () => {
    const good = { id: "u1", status: "ACTIVE", sessionVersion: 0 };
    const decorated = {
      ...base,
      authorized: () => true,
      customMarker: "kept",
      jwt: async ({ token, user }: never) => {
        const t = (await base.jwt({ token, user } as never)) as Record<
          string,
          unknown
        >;
        t.fromBase = true;
        return t;
      },
    };
    const callbacks = createSessionCallbacks(decorated as never, async (id) =>
      id === "u1" ? good : null,
    );
    // Non-jwt/session keys pass through verbatim.
    expect((callbacks as Record<string, unknown>).authorized).toBe(
      decorated.authorized,
    );
    expect((callbacks as Record<string, unknown>).customMarker).toBe("kept");
    // Base jwt effects are preserved inside the composed jwt.
    const tok = await callbacks.jwt({
      token: { sub: "u1", sv: 0 } as never,
      user: undefined,
    });
    expect((tok as Record<string, unknown>)?.fromBase).toBe(true);
    // Base session mapping still applies on the happy path.
    const s = await callbacks.session({
      session: { user: {}, expires: "" } as never,
      token: { sub: "u1", sv: 0 } as never,
    });
    expect((s as { user: { id: string } }).user.id).toBe("u1");
  });
});
