import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * S1-F1 schema tests — `access_token` table + `users.session_version`.
 *
 * These run against the REAL migrated PostgreSQL schema in a dedicated
 * disposable database supplied via `INTEGRATION_DATABASE_URL` (never the
 * application/E2E database). Synthetic fixtures only: fixed canary hashes,
 * never realistic tokens.
 */
const baseUrl = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof baseUrl === "string" && baseUrl.length > 0;

const PRIOR_MIGRATIONS = [
  "db/migrations/20260929000000_init/migration.sql",
  "db/migrations/20260929120000_stage1_identity_tenancy/migration.sql",
  "db/migrations/20260929150000_stage1_versioned_consent/migration.sql",
  "db/migrations/20260929160000_stage1_audit_events/migration.sql",
  "db/migrations/20260929170000_stage1_audit_read_index/migration.sql",
];
const S1F1_MIGRATION =
  "db/migrations/20260930150000_stage1_access_tokens/migration.sql";

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

function runPrisma(args: string[], env: Record<string, string> = {}): void {
  execFileSync("npx", ["prisma", ...args], {
    stdio: "pipe",
    env: { ...process.env, ...env },
  });
}

function unique(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

// Clearly synthetic digest fixture — 64 hex chars, not derived from a real
// token. Raw token material must never appear in any row.
const SYNTHETIC_HASH = "f".repeat(64);
const RAW_CANARY = "synthetic-raw-token-CANARY-never-stored";
const CANARY_HASH = createHash("sha256").update(RAW_CANARY).digest("hex");

describe.skipIf(!enabled)(
  "S1-F1 access_token + session_version (real PostgreSQL)",
  () => {
    const url = baseUrl as string;
    let prisma: PrismaClient;

    beforeAll(async () => {
      runPrisma(["migrate", "deploy"], { DATABASE_URL: url });
      prisma = new PrismaClient({ datasources: { db: { url } } });
      await prisma.$executeRawUnsafe(
        'TRUNCATE "access_token","audit_event","consent_record","client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
      );
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    async function makeUser(tag: string) {
      return prisma.user.create({
        data: {
          email: `${tag}.${unique("u")}@example.test`,
          passwordHash: "scrypt$synthetic$hash",
        },
      });
    }
    async function makeWorkspace(tag: string) {
      return prisma.workspace.create({
        data: { name: tag, slug: unique(tag) },
      });
    }

    type TokenRow = {
      purpose: string;
      tokenHash?: string;
      workspaceId?: string | null;
      userId?: string | null;
      targetEmail?: string | null;
      intendedRole?: string | null;
      createdByUserId?: string | null;
      expiresAt?: Date;
      consumedAt?: Date | null;
      revokedAt?: Date | null;
    };

    async function insertToken(row: TokenRow) {
      return prisma.$executeRawUnsafe(
        `INSERT INTO "access_token"
        ("id","purpose","token_hash","workspace_id","user_id","target_email",
         "intended_role","created_by_user_id","expires_at","consumed_at","revoked_at")
       VALUES ($1,$2::"AccessTokenPurpose",$3,$4,$5,$6,$7::"MemberRole",$8,$9,$10,$11)`,
        unique("tok"),
        row.purpose,
        row.tokenHash ??
          createHash("sha256").update(unique("tok")).digest("hex"),
        row.workspaceId ?? null,
        row.userId ?? null,
        row.targetEmail ?? null,
        row.intendedRole ?? null,
        row.createdByUserId ?? null,
        row.expiresAt ?? new Date(Date.now() + 12 * 60 * 60 * 1000),
        row.consumedAt ?? null,
        row.revokedAt ?? null,
      );
    }

    async function inviteRow(
      overrides: Partial<TokenRow> = {},
    ): Promise<TokenRow> {
      const ws = await makeWorkspace("ws");
      const issuer = await makeUser("issuer");
      return {
        purpose: "WORKSPACE_INVITE",
        workspaceId: ws.id,
        targetEmail: `${unique("invitee")}@example.test`,
        intendedRole: "CLIENT",
        createdByUserId: issuer.id,
        ...overrides,
      };
    }

    async function resetRow(
      overrides: Partial<TokenRow> = {},
    ): Promise<TokenRow> {
      const user = await makeUser("reset");
      return { purpose: "PASSWORD_RESET", userId: user.id, ...overrides };
    }

    it("deploys all migrations including the access-token migration", async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ migration_name: string }>
      >(
        'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name',
      );
      const names = rows.map((r) => r.migration_name);
      expect(names.some((n) => n.includes("stage1_access_tokens"))).toBe(true);
    });

    it("stores a valid workspace-invitation-shaped row", async () => {
      await insertToken(await inviteRow());
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          purpose: string;
          intended_role: string;
          user_id: string | null;
        }>
      >('SELECT purpose, intended_role, user_id FROM "access_token"');
      expect(rows).toHaveLength(1);
      expect(rows[0].purpose).toBe("WORKSPACE_INVITE");
      expect(rows[0].intended_role).toBe("CLIENT");
      expect(rows[0].user_id).toBeNull();
    });

    it("stores a valid password-reset-shaped row", async () => {
      await insertToken(await resetRow());
      const rows = await prisma.$queryRawUnsafe<
        Array<{ purpose: string; user_id: string | null }>
      >(
        'SELECT purpose, user_id FROM "access_token" WHERE purpose = $1::"AccessTokenPurpose"',
        "PASSWORD_RESET",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).not.toBeNull();
    });

    it("never stores a raw token — only its digest appears in the row", async () => {
      await insertToken(await inviteRow({ tokenHash: CANARY_HASH }));
      const rows = await prisma.$queryRawUnsafe<Array<{ rowtext: string }>>(
        'SELECT "access_token"::text AS rowtext FROM "access_token"',
      );
      for (const row of rows) {
        expect(row.rowtext).not.toContain(RAW_CANARY);
      }
      const leaked = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
        'SELECT COUNT(*)::int AS n FROM "access_token" WHERE token_hash::text LIKE $1',
        `%${RAW_CANARY}%`,
      );
      expect(leaked[0].n).toBe(0);
    });

    it("rejects a duplicate token_hash", async () => {
      await insertToken(await inviteRow({ tokenHash: SYNTHETIC_HASH }));
      await expect(
        insertToken(await resetRow({ tokenHash: SYNTHETIC_HASH })),
      ).rejects.toThrow();
    });

    it("rejects token_hash values that are not canonical SHA-256 hex digests", async () => {
      // Only the S1-F0 SHA-256 output shape (64 lowercase hex chars) may be
      // persisted. Anything else — including a raw 43-char base64url bearer
      // token — must be rejected at the database boundary.
      const bad: Array<[string, string]> = [
        ["raw 43-char base64url bearer token", "A".repeat(43)],
        ["uppercase 64-char hex", "F".repeat(64)],
        ["whitespace-padded text", ` ${"a".repeat(62)} `],
        ["arbitrary text", "not-a-digest"],
        ["empty string", ""],
        ["63-char lowercase hex", "a".repeat(63)],
        ["65-char lowercase hex", "a".repeat(65)],
        ["oversized text", "a".repeat(10_000)],
      ];
      for (const [label, tokenHash] of bad) {
        await expect(
          insertToken(await inviteRow({ tokenHash })),
          label,
        ).rejects.toThrow();
      }
      // …and a valid canonical digest is accepted.
      await insertToken(await inviteRow({ tokenHash: "a".repeat(64) }));
    });

    it("rejects an invite without workspace_id", async () => {
      await expect(
        insertToken(await inviteRow({ workspaceId: null })),
      ).rejects.toThrow();
    });

    it("rejects an invite without target_email", async () => {
      await expect(
        insertToken(await inviteRow({ targetEmail: null })),
      ).rejects.toThrow();
    });

    it("rejects an invite without intended_role", async () => {
      await expect(
        insertToken(await inviteRow({ intendedRole: null })),
      ).rejects.toThrow();
    });

    it("rejects an invite without created_by_user_id", async () => {
      await expect(
        insertToken(await inviteRow({ createdByUserId: null })),
      ).rejects.toThrow();
    });

    it("rejects OWNER, SUPPORT invites at the database boundary", async () => {
      for (const role of ["WORKSPACE_OWNER", "SUPPORT"] as const) {
        await expect(
          insertToken(await inviteRow({ intendedRole: role })),
        ).rejects.toThrow();
      }
    });

    it("rejects an invite carrying user_id while unconsumed", async () => {
      const user = await makeUser("premature");
      await expect(
        insertToken(await inviteRow({ userId: user.id })),
      ).rejects.toThrow();
      // …but a consumed invite MAY carry the bound user (post-acceptance shape).
      await insertToken(
        await inviteRow({ userId: user.id, consumedAt: new Date() }),
      );
    });

    it("rejects a reset without user_id", async () => {
      await expect(
        insertToken({ purpose: "PASSWORD_RESET", userId: null }),
      ).rejects.toThrow();
    });

    it("rejects a reset carrying workspace/email/role/creator fields", async () => {
      const ws = await makeWorkspace("ws");
      const user = await makeUser("u");
      const extra: Array<Partial<TokenRow>> = [
        { workspaceId: ws.id },
        { targetEmail: `${unique("x")}@example.test` },
        { intendedRole: "CLIENT" },
        { createdByUserId: user.id },
      ];
      for (const patch of extra) {
        await expect(insertToken(await resetRow(patch))).rejects.toThrow();
      }
    });

    it("rejects purposes outside the enum", async () => {
      for (const purpose of ["EMAIL_VERIFICATION", "MAGIC_LINK"]) {
        await expect(
          insertToken(await inviteRow({ purpose })),
        ).rejects.toThrow();
      }
    });

    it("rejects expires_at at or before created_at", async () => {
      await expect(
        insertToken(
          await inviteRow({ expiresAt: new Date(Date.now() - 1000) }),
        ),
      ).rejects.toThrow();
    });

    it("cannot fabricate tenancy: invite workspace_id must reference a real workspace", async () => {
      await expect(
        insertToken(await inviteRow({ workspaceId: "ws_nonexistent" })),
      ).rejects.toThrow();
    });

    it("cannot fabricate ownership: reset user_id must reference a real user", async () => {
      await expect(
        insertToken({ purpose: "PASSWORD_RESET", userId: "u_nonexistent" }),
      ).rejects.toThrow();
    });

    it("defaults users.session_version to 0 and increments atomically", async () => {
      const user = await makeUser("sv");
      const rows = await prisma.$queryRawUnsafe<
        Array<{ session_version: number }>
      >('SELECT session_version FROM "users" WHERE id = $1', user.id);
      expect(rows[0].session_version).toBe(0);
      await prisma.$executeRawUnsafe(
        'UPDATE "users" SET session_version = session_version + 1 WHERE id = $1',
        user.id,
      );
      const after = await prisma.$queryRawUnsafe<
        Array<{ session_version: number }>
      >('SELECT session_version FROM "users" WHERE id = $1', user.id);
      expect(after[0].session_version).toBe(1);
    });

    it("Restrict: workspace delete with an outstanding invite fails", async () => {
      const ws = await makeWorkspace("wsdel");
      const issuer = await makeUser("issuer");
      await insertToken({
        purpose: "WORKSPACE_INVITE",
        workspaceId: ws.id,
        targetEmail: `${unique("i")}@example.test`,
        intendedRole: "COACH",
        createdByUserId: issuer.id,
      });
      await expect(
        prisma.workspace.delete({ where: { id: ws.id } }),
      ).rejects.toThrow();
    });

    it("Cascade: deleting a user removes that user's reset tokens", async () => {
      const user = await makeUser("resetown");
      await insertToken({ purpose: "PASSWORD_RESET", userId: user.id });
      await prisma.user.delete({ where: { id: user.id } });
      const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
        'SELECT COUNT(*)::int AS n FROM "access_token" WHERE user_id = $1',
        user.id,
      );
      expect(rows[0].n).toBe(0);
    });

    it("Restrict: deleting an issuer with outstanding invites fails", async () => {
      const issuer = await makeUser("issuerdel");
      const ws = await makeWorkspace("wsi");
      await insertToken({
        purpose: "WORKSPACE_INVITE",
        workspaceId: ws.id,
        targetEmail: `${unique("i")}@example.test`,
        intendedRole: "CLIENT",
        createdByUserId: issuer.id,
      });
      await expect(
        prisma.user.delete({ where: { id: issuer.id } }),
      ).rejects.toThrow();
    });

    it("has the purpose-shape CHECK constraints, unique hash, and indexes", async () => {
      const checks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
        `SELECT conname FROM pg_constraint WHERE contype = 'c' AND conrelid = '"access_token"'::regclass`,
      );
      const names = checks.map((r) => r.conname).sort();
      expect(names).toEqual(
        expect.arrayContaining([
          "access_token_invite_shape",
          "access_token_reset_shape",
          "access_token_expiry_after_creation",
          "access_token_token_hash_sha256_hex",
        ]),
      );
      const idx = await prisma.$queryRawUnsafe<
        Array<{ indexname: string; indexdef: string }>
      >(
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'access_token'`,
      );
      const idxNames = idx.map((r) => r.indexname).sort();
      expect(idxNames).toEqual(
        expect.arrayContaining([
          "access_token_invite_target_idx",
          "access_token_user_id_purpose_idx",
          "access_token_expires_at_idx",
        ]),
      );
      const unique = idx.find((r) => r.indexdef.includes("token_hash"));
      expect(unique?.indexdef).toContain("UNIQUE");
      // target_email must never be indexed standalone.
      const emailAlone = idx.filter(
        (r) =>
          r.indexdef.includes("target_email") &&
          !r.indexdef.includes("workspace_id"),
      );
      expect(emailAlone).toHaveLength(0);
    });

    it("keeps every prior raw constraint and index", async () => {
      const fks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
        "SELECT conname FROM pg_constraint WHERE contype = 'f' AND conname IN ('client_assignment_client_workspace_fkey','client_assignment_member_workspace_fkey')",
      );
      expect(fks.map((r) => r.conname).sort()).toEqual([
        "client_assignment_client_workspace_fkey",
        "client_assignment_member_workspace_fkey",
      ]);
      const idx = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
        `SELECT indexname FROM pg_indexes WHERE indexname IN ('client_assignment_one_active_primary_key','consent_record_active_version_key','audit_event_workspace_id_at_idx','audit_event_workspace_id_id_idx')`,
      );
      expect(idx.map((r) => r.indexname).sort()).toEqual([
        "audit_event_workspace_id_at_idx",
        "audit_event_workspace_id_id_idx",
        "client_assignment_one_active_primary_key",
        "consent_record_active_version_key",
      ]);
    });
  },
);

describe.skipIf(!enabled)(
  "S1-F1 migration applies on top of existing data",
  () => {
    const url = baseUrl as string;
    const scratchName = unique("s1f1_pre");
    let scratchUrl = "";
    let admin: PrismaClient;
    let scratch: PrismaClient;

    beforeAll(async () => {
      admin = new PrismaClient({
        datasources: { db: { url: withDatabase(url, "postgres") } },
      });
      await admin.$executeRawUnsafe(`CREATE DATABASE "${scratchName}"`);
      scratchUrl = withDatabase(url, scratchName);
      for (const file of PRIOR_MIGRATIONS) {
        runPrisma(["db", "execute", "--url", scratchUrl, "--file", file]);
      }
      scratch = new PrismaClient({ datasources: { db: { url: scratchUrl } } });
      await scratch.$executeRawUnsafe(
        `INSERT INTO "users" ("id","email","password_hash","name","platform_role","status","created_at","updated_at")
         VALUES ($1,$2,$3,$4,'USER','ACTIVE',NOW(),NOW())`,
        "pre-existing-user",
        "preexisting@example.test",
        "scrypt$synthetic$hash",
        "Pre Existing",
      );
      runPrisma([
        "db",
        "execute",
        "--url",
        scratchUrl,
        "--file",
        S1F1_MIGRATION,
      ]);
    });

    afterAll(async () => {
      await scratch?.$disconnect();
      await admin?.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${scratchName}"`,
      );
      await admin?.$disconnect();
    });

    it("existing users receive session_version = 0 (no rewrite)", async () => {
      const rows = await scratch.$queryRawUnsafe<
        Array<{ session_version: number }>
      >(
        'SELECT session_version FROM "users" WHERE id = $1',
        "pre-existing-user",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].session_version).toBe(0);
    });

    it("access_token accepts rows after the incremental apply", async () => {
      const ws = await scratch.workspace.create({
        data: { name: "w", slug: unique("w") },
      });
      await scratch.$executeRawUnsafe(
        `INSERT INTO "access_token"
          ("id","purpose","token_hash","workspace_id","target_email","intended_role","created_by_user_id","expires_at")
         VALUES ($1,'WORKSPACE_INVITE'::"AccessTokenPurpose",$2,$3,$4,'CLIENT'::"MemberRole",$5,NOW() + INTERVAL '12 hours')`,
        unique("tok"),
        SYNTHETIC_HASH,
        ws.id,
        `${unique("i")}@example.test`,
        "pre-existing-user",
      );
      const rows = await scratch.$queryRawUnsafe<Array<{ n: number }>>(
        'SELECT COUNT(*)::int AS n FROM "access_token"',
      );
      expect(rows[0].n).toBe(1);
    });
  },
);
