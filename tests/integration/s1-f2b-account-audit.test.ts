import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AuditError,
  listAccountAuditEvents,
  listAuditEvents,
  writeAccountAuditEvent,
  writeAuditEvent,
} from "../../lib/audit";

/**
 * S1-F2B account-scoped audit — real migrated PostgreSQL in a disposable
 * database (`INTEGRATION_DATABASE_URL`). Proves the WORKSPACE/ACCOUNT scope
 * boundary at the database, writer, and reader layers.
 */
const baseUrl = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof baseUrl === "string" && baseUrl.length > 0;

function runPrisma(args: string[], env: Record<string, string> = {}): void {
  execFileSync("npx", ["prisma", ...args], {
    stdio: "pipe",
    env: { ...process.env, ...env },
  });
}

let n = 0;
const uid = () => `u${++n}_${Date.now()}`;

describe.skipIf(!enabled)(
  "S1-F2B account-scoped audit (real PostgreSQL)",
  () => {
    const url = baseUrl as string;
    let prisma: PrismaClient;

    beforeAll(async () => {
      runPrisma(["migrate", "deploy"], { DATABASE_URL: url });
      prisma = new PrismaClient({ datasources: { db: { url } } });
      await prisma.$executeRawUnsafe(
        'TRUNCATE "audit_event","consent_record","client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
      );
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });

    async function user() {
      return prisma.user.create({
        data: {
          email: `${uid()}@example.test`,
          passwordHash: "scrypt$x",
        },
      });
    }
    async function workspace() {
      return prisma.workspace.create({
        data: { name: `w${++n}`, slug: `ws${n}_${Date.now()}` },
      });
    }
    async function member(workspaceId: string, userId: string) {
      return prisma.workspaceMember.create({
        data: {
          workspaceId,
          userId,
          role: "WORKSPACE_OWNER",
          status: "ACTIVE",
        },
      });
    }
    const s = (id: string) => ({ user: { id } }) as never;
    const ownerCtx = (wsId: string, userId: string) => ({
      userId,
      platformRole: "USER" as const,
      workspaceId: wsId,
      workspaceRole: "WORKSPACE_OWNER" as const,
      grantedScope: "workspace" as const,
    });

    async function writeWorkspaceEvent(wsId: string, uId: string) {
      await prisma.$transaction((tx) =>
        writeAuditEvent(tx, ownerCtx(wsId, uId), {
          action: "INVITE",
          resourceType: "access_token",
        }),
      );
    }
    async function writeAccountEvent(
      subjectUserId: string,
      actorUserId?: string,
    ) {
      await prisma.$transaction((tx) =>
        writeAccountAuditEvent(tx, {
          subjectUserId,
          actorUserId,
          action: "PASSWORD_RESET",
          resourceType: "user",
        }),
      );
    }
    async function eventsOf(where: string, ...params: unknown[]) {
      return prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "audit_event" WHERE ${where}`,
        ...params,
      );
    }

    it("deploys the migration with named CHECKs and the account index", async () => {
      const checks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
        `SELECT conname FROM pg_constraint WHERE contype='c' AND conrelid='"audit_event"'::regclass`,
      );
      expect(checks.map((c) => c.conname)).toEqual(
        expect.arrayContaining([
          "audit_event_workspace_scope_shape",
          "audit_event_account_scope_shape",
        ]),
      );
      const idx = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
        `SELECT indexname FROM pg_indexes WHERE tablename='audit_event'`,
      );
      expect(idx.map((i) => i.indexname)).toContain(
        "audit_event_subject_user_id_at_idx",
      );
      const fk = await prisma.$queryRawUnsafe<
        Array<{ conname: string; confdeltype: string }>
      >(
        `SELECT conname, confdeltype FROM pg_constraint WHERE conname='audit_event_subject_user_id_fkey'`,
      );
      expect(fk[0]?.confdeltype).toBe("r"); // RESTRICT — user history not erasable
    });

    it("workspace events are WORKSPACE-scoped; account events are ACCOUNT-scoped", async () => {
      const ws = await workspace();
      const u = await user();
      await member(ws.id, u.id);
      await writeWorkspaceEvent(ws.id, u.id);
      const subj = await user();
      await writeAccountEvent(subj.id, u.id);
      const all = await eventsOf("TRUE");
      const wsEvent = all.find((r) => r["scope"] === "WORKSPACE")!;
      const acctEvent = all.find((r) => r["scope"] === "ACCOUNT")!;
      expect(wsEvent["workspace_id"]).toBe(ws.id);
      expect(wsEvent["subject_user_id"]).toBeNull();
      expect(acctEvent["subject_user_id"]).toBe(subj.id);
      expect(acctEvent["workspace_id"]).toBeNull();
      expect(acctEvent["actor_user_id"]).toBe(u.id);
    });

    it("account events accept a null actor (future unauthenticated reset request)", async () => {
      const subj = await user();
      await writeAccountEvent(subj.id);
      const rows = await eventsOf('"scope" = $1::"AuditScope"', "ACCOUNT");
      expect(rows.at(-1)!["actor_user_id"]).toBeNull();
    });

    it("database CHECKs reject every wrong ownership shape", async () => {
      const ws = await workspace();
      const u = await user();
      const attempts: Array<[string, string, string | null, string | null]> = [
        ["WORKSPACE without workspace", "WORKSPACE", null, null],
        ["WORKSPACE with subject", "WORKSPACE", ws.id, u.id],
        ["ACCOUNT without subject", "ACCOUNT", null, null],
        ["ACCOUNT with workspace", "ACCOUNT", ws.id, u.id],
      ];
      for (const [label, scope, wsId, subId] of attempts) {
        await expect(
          prisma.$executeRawUnsafe(
            `INSERT INTO "audit_event" ("scope","action","resource_type","result","workspace_id","subject_user_id") VALUES ($1::"AuditScope",'INVITE'::"AuditAction",'user','ALLOW',$2,$3)`,
            scope,
            wsId,
            subId,
          ),
          label,
        ).rejects.toThrow();
      }
    });

    it("user deletion is Restricted while account security history exists", async () => {
      const subj = await user();
      await writeAccountEvent(subj.id);
      await expect(
        prisma.user.delete({ where: { id: subj.id } }),
      ).rejects.toThrow();
    });

    it("workspace listing never returns account rows (and vice versa)", async () => {
      const ws = await workspace();
      const u = await user();
      await member(ws.id, u.id);
      const subj = await user();
      await writeWorkspaceEvent(ws.id, u.id);
      await writeAccountEvent(subj.id, u.id);
      const wsList = await listAuditEvents(
        s(u.id),
        { workspaceId: ws.id },
        prisma,
      );
      for (const row of wsList.items) {
        const dbRow = await prisma.auditEvent.findUnique({
          where: { id: row.id },
        });
        expect(dbRow?.scope).toBe("WORKSPACE");
        expect(dbRow?.workspaceId).toBe(ws.id);
      }
      const acctList = await listAccountAuditEvents(
        { subjectUserId: subj.id },
        prisma,
      );
      expect(acctList.items.length).toBe(1);
      expect(acctList.items[0].action).toBe("PASSWORD_RESET");
      for (const row of acctList.items) {
        const dbRow = await prisma.auditEvent.findUnique({
          where: { id: row.id },
        });
        expect(dbRow?.scope).toBe("ACCOUNT");
        expect(dbRow?.subjectUserId).toBe(subj.id);
        // Workspace events must not appear in account listings.
        expect(dbRow?.workspaceId).toBeNull();
      }
    });

    it("account listing is bounded, cursor-paginated, and subject-scoped", async () => {
      const a = await user();
      const b = await user();
      for (let i = 0; i < 30; i++) {
        await writeAccountEvent(a.id);
      }
      await writeAccountEvent(b.id);
      const first = await listAccountAuditEvents(
        { subjectUserId: a.id },
        prisma,
      );
      expect(first.items.length).toBe(25);
      expect(first.nextCursor).not.toBeNull();
      const rest = await listAccountAuditEvents(
        { subjectUserId: a.id, limit: 100, cursor: first.nextCursor! },
        prisma,
      );
      expect(rest.items.length).toBe(5);
      // None of user b's events leak into a's listing.
      const bRows = await listAccountAuditEvents(
        { subjectUserId: b.id },
        prisma,
      );
      expect(bRows.items.length).toBe(1);
    });

    it("account writer rejects workspace actions/resources and forbidden meta", async () => {
      const subj = await user();
      await expect(
        prisma.$transaction((tx) =>
          writeAccountAuditEvent(tx, {
            subjectUserId: subj.id,
            action: "INVITE" as never,
            resourceType: "user",
          }),
        ),
      ).rejects.toThrow(AuditError);
      await expect(
        prisma.$transaction((tx) =>
          writeAccountAuditEvent(tx, {
            subjectUserId: subj.id,
            action: "PASSWORD_RESET",
            resourceType: "consent" as never,
          }),
        ),
      ).rejects.toThrow(AuditError);
      await expect(
        prisma.$transaction((tx) =>
          writeAccountAuditEvent(tx, {
            subjectUserId: subj.id,
            action: "PASSWORD_RESET",
            resourceType: "user",
            meta: { note: "user@example.test" } as never,
          }),
        ),
      ).rejects.toThrow(AuditError);
      await expect(
        prisma.$transaction((tx) =>
          writeAccountAuditEvent(tx, {
            subjectUserId: "",
            action: "PASSWORD_RESET",
            resourceType: "user",
          }),
        ),
      ).rejects.toThrow(AuditError);
    });

    it("a failed account audit write rolls back the enclosing mutation", async () => {
      const subj = await user();
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: subj.id },
            data: { name: "rolled-back" },
          });
          await writeAccountAuditEvent(tx, {
            subjectUserId: subj.id,
            action: "PASSWORD_RESET",
            resourceType: "user",
            meta: { garbage: true } as never,
          });
        }),
      ).rejects.toThrow(AuditError);
      const after = await prisma.user.findUnique({ where: { id: subj.id } });
      expect(after?.name).not.toBe("rolled-back");
    });

    it("all prior raw constraints and indexes remain live", async () => {
      const idx = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
        `SELECT indexname FROM pg_indexes WHERE tablename='audit_event'`,
      );
      expect(idx.map((i) => i.indexname)).toEqual(
        expect.arrayContaining([
          "audit_event_workspace_id_at_idx",
          "audit_event_workspace_id_id_idx",
        ]),
      );
      const tokenChecks = await prisma.$queryRawUnsafe<
        Array<{ conname: string }>
      >(
        `SELECT conname FROM pg_constraint WHERE contype='c' AND conrelid='"access_token"'::regclass`,
      );
      expect(tokenChecks.map((c) => c.conname)).toEqual(
        expect.arrayContaining([
          "access_token_invite_shape",
          "access_token_reset_shape",
          "access_token_token_hash_sha256_hex",
        ]),
      );
    });
  },
);
