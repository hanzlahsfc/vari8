import { beforeAll, describe, expect, it, vi } from "vitest";

import { authorizeCredentials, normalizeEmail } from "../../lib/credentials";
import { hashPassword } from "../../lib/password";

let passwordHash = "";

beforeAll(async () => {
  passwordHash = await hashPassword("right-password");
});

const lookup = async (email: string) =>
  email === "user@example.com"
    ? { id: "u1", email: "user@example.com", name: "Test User", passwordHash }
    : null;

describe("authorizeCredentials", () => {
  it("returns the safe user shape for valid credentials", async () => {
    const result = await authorizeCredentials(
      { email: "user@example.com", password: "right-password" },
      lookup,
    );
    expect(result).toEqual({ id: "u1", email: "user@example.com", name: "Test User" });
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("normalizes the email before lookup", async () => {
    const spy = vi.fn(lookup);
    const result = await authorizeCredentials(
      { email: "  USER@Example.com ", password: "right-password" },
      spy,
    );
    expect(spy).toHaveBeenCalledWith("user@example.com");
    expect(result?.id).toBe("u1");
  });

  it("returns null for a wrong password", async () => {
    const result = await authorizeCredentials(
      { email: "user@example.com", password: "wrong-password" },
      lookup,
    );
    expect(result).toBeNull();
  });

  it("returns null for an unknown email (same as wrong password)", async () => {
    const unknown = await authorizeCredentials(
      { email: "nobody@example.com", password: "right-password" },
      lookup,
    );
    const wrongPassword = await authorizeCredentials(
      { email: "user@example.com", password: "wrong-password" },
      lookup,
    );
    expect(unknown).toBeNull();
    expect(wrongPassword).toBeNull();
  });

  it("returns null without calling the lookup when fields are missing", async () => {
    const spy = vi.fn(lookup);
    expect(await authorizeCredentials(undefined, spy)).toBeNull();
    expect(await authorizeCredentials({ email: "", password: "x" }, spy)).toBeNull();
    expect(await authorizeCredentials({ email: "user@example.com" }, spy)).toBeNull();
    expect(await authorizeCredentials({ email: "user@example.com", password: 123 }, spy)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases strings and rejects non-strings", () => {
    expect(normalizeEmail("  A@B.COM ")).toBe("a@b.com");
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(42)).toBe("");
  });
});
