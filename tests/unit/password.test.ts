import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../../lib/password";

describe("password hashing", () => {
  it("stores a scrypt hash and never the plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash.split("$")).toHaveLength(6);
    expect(hash).not.toContain("correct horse battery staple");
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword("s3cret-pass");
    expect(await verifyPassword("s3cret-pass", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("s3cret-pass");
    expect(await verifyPassword("wrong-pass", hash)).toBe(false);
  });

  it("uses a unique salt per hash", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("returns false instead of throwing on malformed stored hashes", async () => {
    const malformed = [
      "",
      "not-a-hash",
      "scrypt$only-two-parts",
      "bcrypt$16384$8$1$c2FsdA==$aGFzaA==",
      "scrypt$0$8$1$c2FsdA==$aGFzaA==",
      "scrypt$16384$8$1$!!!!$!!!!",
    ];
    for (const stored of malformed) {
      expect(await verifyPassword("whatever", stored)).toBe(false);
    }
  });

  it("refuses to hash an empty password", async () => {
    await expect(hashPassword("")).rejects.toThrow();
  });
});
