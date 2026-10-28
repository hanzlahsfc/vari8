// FULL-PACKAGE SLICE of #173
/**
 * Card 09 (#173): NutritionLog daily actuals on a disposable PostgreSQL
 * database (INTEGRATION_DATABASE_URL). Synthetic fixtures only.
 *
 * Asserts the card contract end to end at the service seam: three
 * independent nullable macro columns, no calories column anywhere, kcal
 * derived at 4/4/9 over the macros present, missing stays missing, and
 * entries survive a client switch between meal plan and macro counting.
 */

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import {
  DAILY_ENTRY_DEV_CONSENT,
  DailyEntryError,
} from "../../lib/daily-entry/service";
import {
  listStaffNutritionLogs,
  loadNutritionLogSurface,
  saveNutritionLog,
} from "../../lib/daily-entry/nutrition-log";
import { caloriesFromMacros } from "../../lib/nutrition/math";
import { createStaticConsentPolicy } from "../../lib/consent";
import type { SessionLike } from "../../lib/auth/guard";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const DEV_REGISTRY = createStaticConsentPolicy({
  PRIVACY_NOTICE: DAILY_ENTRY_DEV_CONSENT.PRIVACY_NOTICE,
  HEALTH_DATA: DAILY_ENTRY_DEV_CONSENT.HEALTH_DATA,
});

describe.skipIf(!enabled)("card 09 NutritionLog (real PG)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "nutrition_log","daily_entry_revision_value","daily_entry_revision","daily_entry","audit_event","client_setup_pin","client_setup","consent_record","coaching_template_version_parameter","coaching_template_version","coaching_template","parameter_definition","client_assignment","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let n = 0;
  const uid = () => `p173_${++n}_${Date.now()}`;

  async function seedClient() {
    const tag = uid();
    const ws = await prisma.workspace.create({
      data: { slug: `w-${tag}`, name: tag, status: "ACTIVE" },
    });
    const mkUser = async (suffix: string) =>
      prisma.user.create({
        data: {
          email: `${tag}-${suffix}@example.test`,
          passwordHash: "x",
          status: "ACTIVE",
          name: `${tag}-${suffix}`,
        },
      });
    const ownerUser = await mkUser("o");
    const clientUser = await mkUser("c");
    const mkMember = (userId: string, role: "WORKSPACE_OWNER" | "CLIENT") =>
      prisma.workspaceMember.create({
        data: { workspaceId: ws.id, userId, role, status: "ACTIVE" },
      });
    const ownerMember = await mkMember(ownerUser.id, "WORKSPACE_OWNER");
    const clientMember = await mkMember(clientUser.id, "CLIENT");
    const profile = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, userId: clientUser.id, name: "C" },
    });
    for (const [kind, version] of [
      ["PRIVACY_NOTICE", DAILY_ENTRY_DEV_CONSENT.PRIVACY_NOTICE],
      ["HEALTH_DATA", DAILY_ENTRY_DEV_CONSENT.HEALTH_DATA],
    ] as const)
      await prisma.consentRecord.create({
        data: { clientProfileId: profile.id, kind, version },
      });
    const session: SessionLike = { user: { id: clientUser.id } };
    const staffSession: SessionLike = { user: { id: ownerUser.id } };
    return {
      ws,
      ownerMember,
      clientMember,
      clientUser,
      profile,
      session,
      staffSession,
    };
  }

  /** Two template pins on one setup stand in for the meal-plan and
   * macro-counting modes: the log must survive a re-pin unchanged. */
  async function seedSetupWithPins(c: Awaited<ReturnType<typeof seedClient>>) {
    const template = await prisma.coachingTemplate.create({
      data: {
        workspaceId: c.ws.id,
        name: "T",
        createdByMemberId: c.ownerMember.id,
      },
    });
    const mkVersion = (seq: number) =>
      prisma.coachingTemplateVersion.create({
        data: {
          workspaceId: c.ws.id,
          templateId: template.id,
          versionSeq: seq,
          definition: { title: "T", sections: [], parameters: {} } as never,
          publishOriginRevision: seq,
          publishedByMemberId: c.ownerMember.id,
        },
      });
    const vMealPlan = await mkVersion(1);
    const vMacroCounting = await mkVersion(2);
    const setup = await prisma.clientSetup.create({
      data: { workspaceId: c.ws.id, clientProfileId: c.profile.id },
    });
    const pinMealPlan = await prisma.clientSetupPin.create({
      data: {
        clientSetupId: setup.id,
        workspaceId: c.ws.id,
        clientProfileId: c.profile.id,
        seq: 1,
        templateId: template.id,
        templateVersionId: vMealPlan.id,
        assignedByMemberId: c.ownerMember.id,
      },
    });
    return { setup, pinMealPlan, vMacroCounting };
  }

  const deps = () => ({ db: prisma, registry: DEV_REGISTRY });
  const DATE = "2026-10-12";
  const DATE2 = "2026-10-13";

  describe("schema", () => {
    it("nutrition_log has the three macro columns and no calories column", async () => {
      const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'nutrition_log'`,
      );
      const names = cols.map((c) => c.column_name);
      expect(names).toContain("protein");
      expect(names).toContain("carbohydrate");
      expect(names).toContain("fat");
      expect(names.some((n) => n.includes("calorie"))).toBe(false);
    });
  });

  describe("save + own read", () => {
    it("protein only: the other macros read null and kcal derives 4P", async () => {
      const c = await seedClient();
      const result = await saveNutritionLog(
        c.session,
        {
          workspaceId: c.ws.id,
          entryDate: DATE,
          macros: { protein: 180, carbohydrate: null, fat: null },
        },
        deps(),
      );
      expect(result.status).toBe("saved");

      const surface = await loadNutritionLogSurface(
        c.session,
        { workspaceId: c.ws.id, entryDate: DATE },
        deps(),
      );
      expect(surface.state).toBe("ready");
      if (surface.state !== "ready") return;
      expect(surface.log).toEqual({
        protein: 180,
        carbohydrate: null,
        fat: null,
        dayType: null,
        planFollowed: null,
      });
      expect(caloriesFromMacros(surface.log!)).toBe(720);
    });

    it("all three macros: values persist and kcal derives 4P+4C+9F", async () => {
      const c = await seedClient();
      await saveNutritionLog(
        c.session,
        {
          workspaceId: c.ws.id,
          entryDate: DATE,
          macros: { protein: 150, carbohydrate: 200, fat: 60 },
        },
        deps(),
      );
      // Hand check: 150*4 + 200*4 + 60*9 = 600 + 800 + 540 = 1940.
      const surface = await loadNutritionLogSurface(
        c.session,
        { workspaceId: c.ws.id, entryDate: DATE },
        deps(),
      );
      if (surface.state !== "ready") throw new Error(surface.state);
      expect(surface.log).toEqual({
        protein: 150,
        carbohydrate: 200,
        fat: 60,
        dayType: null,
        planFollowed: null,
      });
      expect(caloriesFromMacros(surface.log!)).toBe(1940);
    });

    it("recorded zeros stay zero, never null", async () => {
      const c = await seedClient();
      await saveNutritionLog(
        c.session,
        {
          workspaceId: c.ws.id,
          entryDate: DATE,
          macros: { protein: 0, carbohydrate: 0, fat: 0 },
        },
        deps(),
      );
      const surface = await loadNutritionLogSurface(
        c.session,
        { workspaceId: c.ws.id, entryDate: DATE },
        deps(),
      );
      if (surface.state !== "ready") throw new Error(surface.state);
      expect(surface.log).toEqual({
        protein: 0,
        carbohydrate: 0,
        fat: 0,
        dayType: null,
        planFollowed: null,
      });
      expect(caloriesFromMacros(surface.log!)).toBe(0);
    });

    it("re-saving replaces only the macros sent: null clears that macro alone", async () => {
      const c = await seedClient();
      await saveNutritionLog(
        c.session,
        {
          workspaceId: c.ws.id,
          entryDate: DATE,
          macros: { protein: 150, carbohydrate: 200, fat: 60 },
        },
        deps(),
      );
      await saveNutritionLog(
        c.session,
        {
          workspaceId: c.ws.id,
          entryDate: DATE,
          macros: { protein: 150, carbohydrate: null, fat: 60 },
        },
        deps(),
      );
      const surface = await loadNutritionLogSurface(
        c.session,
        { workspaceId: c.ws.id, entryDate: DATE },
        deps(),
      );
      if (surface.state !== "ready") throw new Error(surface.state);
      expect(surface.log).toEqual({
        protein: 150,
        carbohydrate: null,
        fat: 60,
        dayType: null,
        planFollowed: null,
      });
      // Hand check: 150*4 + 60*9 = 600 + 540 = 1140.
      expect(caloriesFromMacros(surface.log!)).toBe(1140);
    });

    it("an all-null save clears the day back to the empty state", async () => {
      const c = await seedClient();
      await saveNutritionLog(
        c.session,
        {
          workspaceId: c.ws.id,
          entryDate: DATE,
          macros: { protein: 180, carbohydrate: null, fat: null },
        },
        deps(),
      );
      await saveNutritionLog(
        c.session,
        {
          workspaceId: c.ws.id,
          entryDate: DATE,
          macros: { protein: null, carbohydrate: null, fat: null },
        },
        deps(),
      );
      const surface = await loadNutritionLogSurface(
        c.session,
        { workspaceId: c.ws.id, entryDate: DATE },
        deps(),
      );
      if (surface.state !== "ready") throw new Error(surface.state);
      expect(surface.log).toBeNull();
    });

    it("a day with no log reads the empty state, not zeros", async () => {
      const c = await seedClient();
      const surface = await loadNutritionLogSurface(
        c.session,
        { workspaceId: c.ws.id, entryDate: DATE },
        deps(),
      );
      if (surface.state !== "ready") throw new Error(surface.state);
      expect(surface.log).toBeNull();
    });

    it("reload keeps the values: a second read returns the same row", async () => {
      const c = await seedClient();
      await saveNutritionLog(
        c.session,
        {
          workspaceId: c.ws.id,
          entryDate: DATE,
          macros: { protein: 150, carbohydrate: 200, fat: 60 },
        },
        deps(),
      );
      const first = await loadNutritionLogSurface(
        c.session,
        { workspaceId: c.ws.id, entryDate: DATE },
        deps(),
      );
      const second = await loadNutritionLogSurface(
        c.session,
        { workspaceId: c.ws.id, entryDate: DATE },
        deps(),
      );
      if (first.state !== "ready" || second.state !== "ready")
        throw new Error("surface not ready");
      expect(second.log).toEqual(first.log);
      expect(second.log).toEqual({
        protein: 150,
        carbohydrate: 200,
        fat: 60,
        dayType: null,
        planFollowed: null,
      });
    });

    it("history lists recorded days newest first", async () => {
      const c = await seedClient();
      for (const [date, p] of [
        [DATE, 100],
        [DATE2, 110],
      ] as const)
        await saveNutritionLog(
          c.session,
          {
            workspaceId: c.ws.id,
            entryDate: date,
            macros: { protein: p, carbohydrate: null, fat: null },
          },
          deps(),
        );
      const surface = await loadNutritionLogSurface(
        c.session,
        { workspaceId: c.ws.id, entryDate: DATE2 },
        deps(),
      );
      if (surface.state !== "ready") throw new Error(surface.state);
      expect(surface.history.map((h) => h.entryDate)).toEqual([DATE2, DATE]);
    });
  });

  describe("validation and denial", () => {
    it("rejects a negative macro", async () => {
      const c = await seedClient();
      await expect(
        saveNutritionLog(
          c.session,
          {
            workspaceId: c.ws.id,
            entryDate: DATE,
            macros: { protein: -1, carbohydrate: null, fat: null },
          },
          deps(),
        ),
      ).rejects.toThrow(DailyEntryError);
    });

    it("rejects a non-finite macro", async () => {
      const c = await seedClient();
      await expect(
        saveNutritionLog(
          c.session,
          {
            workspaceId: c.ws.id,
            entryDate: DATE,
            macros: {
              protein: Number.POSITIVE_INFINITY,
              carbohydrate: null,
              fat: null,
            },
          },
          deps(),
        ),
      ).rejects.toThrow(DailyEntryError);
    });

    it("rejects a macro above the gram bound", async () => {
      const c = await seedClient();
      await expect(
        saveNutritionLog(
          c.session,
          {
            workspaceId: c.ws.id,
            entryDate: DATE,
            macros: { protein: 10001, carbohydrate: null, fat: null },
          },
          deps(),
        ),
      ).rejects.toThrow(DailyEntryError);
    });

    it("rejects a foreign workspace (the caller's profile is elsewhere)", async () => {
      const c = await seedClient();
      const other = await seedClient();
      await expect(
        saveNutritionLog(
          c.session,
          {
            workspaceId: other.ws.id,
            entryDate: DATE,
            macros: { protein: 10, carbohydrate: null, fat: null },
          },
          deps(),
        ),
      ).rejects.toThrow(AccessDeniedError);
    });

    it("a staff session cannot write to a client's own log", async () => {
      const c = await seedClient();
      await expect(
        saveNutritionLog(
          c.staffSession,
          {
            workspaceId: c.ws.id,
            entryDate: DATE,
            macros: { protein: 10, carbohydrate: null, fat: null },
          },
          deps(),
        ),
      ).rejects.toThrow(AccessDeniedError);
    });
  });

  describe("staff range read", () => {
    it("the coach reads the client's logs for a date range", async () => {
      const c = await seedClient();
      for (const [date, macros] of [
        [DATE, { protein: 150, carbohydrate: 200, fat: 60 }],
        [DATE2, { protein: 180, carbohydrate: null, fat: null }],
      ] as const)
        await saveNutritionLog(
          c.session,
          { workspaceId: c.ws.id, entryDate: date, macros },
          deps(),
        );
      const result = await listStaffNutritionLogs(
        c.staffSession,
        {
          workspaceId: c.ws.id,
          clientProfileId: c.profile.id,
          from: DATE,
          to: DATE2,
        },
        deps(),
      );
      if (result.state !== "ready") throw new Error(result.state);
      expect(result.clientName).toBe("C");
      expect(result.items).toHaveLength(2);
      const day2 = result.items.find((i) => i.entryDate === DATE2);
      expect(day2).toEqual({
        entryDate: DATE2,
        protein: 180,
        carbohydrate: null,
        fat: null,
        dayType: null,
        planFollowed: null,
      });
      // Hand check: 180*4 = 720 on the partial day.
      expect(
        caloriesFromMacros({
          protein: day2!.protein,
          carbohydrate: day2!.carbohydrate,
          fat: day2!.fat,
        }),
      ).toBe(720);
    });

    it("out-of-range days are excluded", async () => {
      const c = await seedClient();
      await saveNutritionLog(
        c.session,
        {
          workspaceId: c.ws.id,
          entryDate: "2026-10-01",
          macros: { protein: 100, carbohydrate: null, fat: null },
        },
        deps(),
      );
      const result = await listStaffNutritionLogs(
        c.staffSession,
        {
          workspaceId: c.ws.id,
          clientProfileId: c.profile.id,
          from: DATE,
          to: DATE2,
        },
        deps(),
      );
      if (result.state !== "ready") throw new Error(result.state);
      expect(result.items).toHaveLength(0);
    });

    it("the client cannot call the staff range read", async () => {
      const c = await seedClient();
      await expect(
        listStaffNutritionLogs(
          c.session,
          {
            workspaceId: c.ws.id,
            clientProfileId: c.profile.id,
            from: DATE,
            to: DATE2,
          },
          deps(),
        ),
      ).rejects.toThrow(AccessDeniedError);
    });
  });

  describe("mode switch", () => {
    it("switching the client's pinned template keeps earlier log entries", async () => {
      const c = await seedClient();
      const { setup, pinMealPlan, vMacroCounting } = await seedSetupWithPins(c);
      await saveNutritionLog(
        c.session,
        {
          workspaceId: c.ws.id,
          entryDate: DATE,
          macros: { protein: 150, carbohydrate: 200, fat: 60 },
        },
        deps(),
      );
      // Meal-plan pin ends; a new pin takes over (the mode switch).
      await prisma.clientSetupPin.update({
        where: { id: pinMealPlan.id },
        data: {
          status: "SUPERSEDED",
          endedAt: new Date(),
          endedByMemberId: c.ownerMember.id,
        },
      });
      await prisma.clientSetupPin.create({
        data: {
          clientSetupId: setup.id,
          workspaceId: c.ws.id,
          clientProfileId: c.profile.id,
          seq: 2,
          templateId: pinMealPlan.templateId,
          templateVersionId: vMacroCounting.id,
          assignedByMemberId: c.ownerMember.id,
        },
      });
      const surface = await loadNutritionLogSurface(
        c.session,
        { workspaceId: c.ws.id, entryDate: DATE },
        deps(),
      );
      if (surface.state !== "ready") throw new Error(surface.state);
      expect(surface.log).toEqual({
        protein: 150,
        carbohydrate: 200,
        fat: 60,
        dayType: null,
        planFollowed: null,
      });
      expect(caloriesFromMacros(surface.log!)).toBe(1940);
    });
  });

  describe("day type and plan followed (w2-t12)", () => {
    it("stores and reads back day-type and plan-followed", async () => {
      const c = await seedClient();
      const entry = await prisma.dailyEntry.create({
        data: {
          workspaceId: c.ws.id,
          clientProfileId: c.profile.id,
          entryDate: new Date(DATE),
          createdByMemberId: c.clientMember.id,
        },
      });
      await prisma.nutritionLog.create({
        data: {
          dailyEntryId: entry.id,
          workspaceId: c.ws.id,
          clientProfileId: c.profile.id,
          entryDate: new Date(DATE),
          protein: 150,
          carbohydrate: 200,
          fat: 60,
          dayType: "Rest day",
          planFollowed: true,
          createdByMemberId: c.clientMember.id,
          updatedByMemberId: c.clientMember.id,
        },
      });
      const surface = await loadNutritionLogSurface(
        c.session,
        { workspaceId: c.ws.id, entryDate: DATE },
        deps(),
      );
      if (surface.state !== "ready") throw new Error(surface.state);
      expect(surface.log).toEqual({
        protein: 150,
        carbohydrate: 200,
        fat: 60,
        dayType: "Rest day",
        planFollowed: true,
      });
      expect(surface.history[0]).toEqual({
        entryDate: DATE,
        protein: 150,
        carbohydrate: 200,
        fat: 60,
        dayType: "Rest day",
        planFollowed: true,
      });

      const staff = await listStaffNutritionLogs(
        c.staffSession,
        {
          workspaceId: c.ws.id,
          clientProfileId: c.profile.id,
          from: DATE,
          to: DATE,
        },
        deps(),
      );
      if (staff.state !== "ready") throw new Error(staff.state);
      expect(staff.items).toHaveLength(1);
      expect(staff.items[0].dayType).toBe("Rest day");
      expect(staff.items[0].planFollowed).toBe(true);
    });

    it("a macro-only save keeps day-type and plan-followed null", async () => {
      const c = await seedClient();
      await saveNutritionLog(
        c.session,
        {
          workspaceId: c.ws.id,
          entryDate: DATE,
          macros: { protein: 100, carbohydrate: null, fat: null },
        },
        deps(),
      );
      const surface = await loadNutritionLogSurface(
        c.session,
        { workspaceId: c.ws.id, entryDate: DATE },
        deps(),
      );
      if (surface.state !== "ready") throw new Error(surface.state);
      expect(surface.log?.dayType).toBeNull();
      expect(surface.log?.planFollowed).toBeNull();
    });
  });
});
