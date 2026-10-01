import { describe, expect, it } from "vitest";

import { PasswordPolicyError } from "../../lib/password-policy";
import { InvitationError } from "../../lib/workspace/invitations";
import { WorkspaceServiceError } from "../../lib/workspace/clients";
import {
  acceptInvitationMessage,
  getInviteLinkState,
} from "../../lib/workspace/invite-acceptance";

/**
 * Phase 3.1 — invite-acceptance boundary. `getInviteLinkState` is the
 * non-consuming peek behind `/invite`; `acceptInvitationMessage` maps the
 * service's structural error codes to safe UI copy. Neither may leak the raw
 * token, the invited email, or internals.
 */

const VALID_TOKEN = `${"a".repeat(42)}A`; // well-formed 43-char base64url
const VALID_WS = "ws_01";

function fakeDb(row: unknown) {
  return {
    accessToken: {
      findUnique: async () => row,
    },
  };
}

describe("getInviteLinkState (non-consuming peek)", () => {
  const active = {
    purpose: "WORKSPACE_INVITE",
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    revokedAt: null,
  };

  it("returns ready for an active WORKSPACE_INVITE token", async () => {
    await expect(
      getInviteLinkState(
        { workspaceId: VALID_WS, rawToken: VALID_TOKEN },
        fakeDb(active) as never,
      ),
    ).resolves.toEqual({ state: "ready" });
  });

  it("returns invalid for every non-active or foreign shape", async () => {
    const variants: unknown[] = [
      null, // unknown token hash
      { ...active, purpose: "PASSWORD_RESET" }, // wrong purpose
      { ...active, consumedAt: new Date() }, // consumed
      { ...active, revokedAt: new Date() }, // revoked
      { ...active, expiresAt: new Date(Date.now() - 1) }, // expired
    ];
    for (const row of variants) {
      await expect(
        getInviteLinkState(
          { workspaceId: VALID_WS, rawToken: VALID_TOKEN },
          fakeDb(row) as never,
        ),
      ).resolves.toEqual({ state: "invalid" });
    }
  });

  it("returns invalid for malformed or missing inputs without a DB read", async () => {
    let reads = 0;
    const counting = {
      accessToken: {
        findUnique: async () => {
          reads++;
          return active;
        },
      },
    };
    const bad: Array<{ workspaceId: unknown; rawToken: unknown }> = [
      { workspaceId: "", rawToken: VALID_TOKEN },
      { workspaceId: null, rawToken: VALID_TOKEN },
      { workspaceId: VALID_WS, rawToken: "" },
      { workspaceId: VALID_WS, rawToken: "not-a-token" },
      { workspaceId: VALID_WS, rawToken: "a".repeat(200) },
      { workspaceId: VALID_WS, rawToken: null },
      { workspaceId: VALID_WS, rawToken: ["a"] },
    ];
    for (const input of bad) {
      await expect(
        getInviteLinkState(input, counting as never),
      ).resolves.toEqual({ state: "invalid" });
    }
    expect(reads).toBe(0);
  });
});

describe("acceptInvitationMessage (safe error mapping)", () => {
  it("maps token failures to one generic invalid-link message", async () => {
    const message = acceptInvitationMessage(
      new InvitationError("invalid_token"),
    );
    expect(message).toMatch(
      /invalid or (has )?already been used|no longer valid/i,
    );
    expect(message).not.toContain("token"); // no internals
    // Same message for the whole invalid family — no oracle.
    expect(acceptInvitationMessage(new InvitationError("invalid_token"))).toBe(
      message,
    );
  });

  it("explains identity and policy failures accessibly", () => {
    expect(
      acceptInvitationMessage(new InvitationError("identity_required")),
    ).toMatch(/sign in/i);
    expect(
      acceptInvitationMessage(new InvitationError("identity_mismatch")),
    ).toMatch(/different account|another account/i);
    expect(
      acceptInvitationMessage(new PasswordPolicyError("password_too_short")),
    ).toMatch(/at least 10 characters/i);
    expect(
      acceptInvitationMessage(new PasswordPolicyError("password_needs_digit")),
    ).toMatch(/at least one (number|digit)/i);
    expect(
      acceptInvitationMessage(new PasswordPolicyError("password_too_long")),
    ).toMatch(/128/);
    expect(
      acceptInvitationMessage(new WorkspaceServiceError("invalid_input")),
    ).toMatch(/details|try again/i);
  });

  it("never echoes input or internals for remaining codes", () => {
    const marker = `raw-secret-${Date.now()}`;
    for (const error of [
      new InvitationError("account_ineligible"),
      new InvitationError("membership_conflict"),
      new InvitationError("serialization_conflict"),
      new InvitationError("invitation_failed"),
      new Error(marker),
      marker, // non-Error input
      null,
    ]) {
      const message = acceptInvitationMessage(error);
      expect(typeof message).toBe("string");
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain(marker);
      expect(message).not.toContain("@");
    }
  });
});
