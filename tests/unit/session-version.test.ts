import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    const callbacks = createSessionCallbacks(base as never, async () => null);
    // Sign-in shape: user object carries the DB sessionVersion.
    const issued = await callbacks.jwt({
      token: {} as never,
      user: { id: "u1", sessionVersion: 5 } as never,
    });
    expect((issued as Record<string, unknown>).sv).toBe(5);
    // A refresh call (no user) must not create or alter sv — a client can't
    // inject it: the only source is the server-issued user record.
    const refreshed = await callbacks.jwt({
      token: { sv: 5 } as never,
      user: undefined,
    });
    expect((refreshed as Record<string, unknown>).sv).toBe(5);
    const injected = await callbacks.jwt({
      token: { sv: 999 } as never,
      user: { id: "u1", sessionVersion: 5 } as never,
    });
    // A re-sign-in re-stamps from the authoritative record, not token input.
    expect((injected as Record<string, unknown>).sv).toBe(5);
  });

  it("session returns null for every rejection — indistinguishable", async () => {
    const good = { id: "u1", status: "ACTIVE", sessionVersion: 2 };
    const callbacks = createSessionCallbacks(base as never, async (id) =>
      id === "u1" ? good : null,
    );
    const mk = (token: Record<string, unknown>) => ({
      session: { user: {}, expires: "" } as never,
      token: token as never,
    });
    expect(await callbacks.session(mk({ sub: "u1", sv: 2 }))).not.toBeNull();
    expect(await callbacks.session(mk({ sub: "u1", sv: 1 }))).toBeNull();
    expect(await callbacks.session(mk({ sub: "u1" }))).toBeNull();
    expect(await callbacks.session(mk({ sub: "u1", sv: "2" }))).toBeNull();
    expect(await callbacks.session(mk({ sub: "ghost", sv: 2 }))).toBeNull();
    expect(await callbacks.session(mk({}))).toBeNull();
  });

  it("auth.config.ts stays edge-safe — no Prisma/db imports", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "auth.config.ts"),
      "utf8",
    );
    const imports = src
      .split("\n")
      .filter((line) => /^\s*import\s/.test(line))
      .join("\n");
    expect(imports).not.toMatch(/prisma|lib\/db|node:/i);
    expect(src).not.toContain("lib/auth/session");
  });
});
