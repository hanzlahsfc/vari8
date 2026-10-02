import { describe, expect, it } from "vitest";

import {
  DISPOSABLE_DB_PREFIX,
  disposableDbUrl,
} from "./disposable-db";

const BASE = "postgresql://app:app_dev_password@127.0.0.1:5445/p8r_int?schema=public";

describe("disposable-db URL safety contract", () => {
  it("swaps the pathname to the owned name, preserving query + credentials", () => {
    const out = disposableDbUrl(BASE, `${DISPOSABLE_DB_PREFIX}rb_x1`);
    const u = new URL(out);
    expect(u.pathname).toBe(`/${DISPOSABLE_DB_PREFIX}rb_x1`);
    expect(u.search).toBe("?schema=public");
    expect(u.hostname).toBe("127.0.0.1");
    expect(out).not.toBe(BASE);
  });

  it("works when the base URL has no query string", () => {
    const out = disposableDbUrl(
      "postgresql://app:pw@127.0.0.1:5445/p8r_base",
      `${DISPOSABLE_DB_PREFIX}rb_y`,
    );
    expect(new URL(out).pathname).toBe(`/${DISPOSABLE_DB_PREFIX}rb_y`);
  });

  it("fails closed on non-loopback hosts — an env URL is never assumed disposable", () => {
    for (const host of ["db.internal.example.com", "10.0.0.5", "db.prod.local"]) {
      expect(() =>
        disposableDbUrl(`postgresql://u:p@${host}:5432/p8r_int`, `${DISPOSABLE_DB_PREFIX}rb_z`),
      ).toThrowError(/host|loopback|disposable/i);
    }
  });

  it("fails closed on non-postgres protocols and unparseable URLs", () => {
    expect(() =>
      disposableDbUrl("https://127.0.0.1/p8r_int", `${DISPOSABLE_DB_PREFIX}rb_a`),
    ).toThrowError(/protocol/i);
    expect(() =>
      disposableDbUrl("not a url", `${DISPOSABLE_DB_PREFIX}rb_a`),
    ).toThrowError();
  });

  it("requires the BASE database itself to carry the disposable prefix", () => {
    expect(() =>
      disposableDbUrl(
        "postgresql://app:pw@127.0.0.1:5432/production",
        `${DISPOSABLE_DB_PREFIX}rb_a`,
      ),
    ).toThrowError(/disposable|prefix/i);
  });

  it("requires the target name to carry the disposable prefix", () => {
    for (const bad of ["otherdb", "prod_1", "p8r-thing (dash)", "../x", ""]) {
      expect(() => disposableDbUrl(BASE, bad)).toThrowError(
        /disposable|prefix|name/i,
      );
    }
  });

  it("asserts the derived URL can never equal the supplied database", () => {
    const same = `${DISPOSABLE_DB_PREFIX}int`;
    expect(() => disposableDbUrl(BASE, same)).toThrowError(/same|distinct/i);
  });
});
