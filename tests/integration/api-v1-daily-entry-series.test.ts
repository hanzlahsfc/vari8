import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { DAILY_ENTRY_DEV_CONSENT } from "../../lib/daily-entry/service";
import { hashPassword } from "../../lib/password";
import { GET } from "../../app/api/v1/workspaces/[workspaceId]/clients/[clientProfileId]/daily-entries/series/route";

/**
 * PR-SV2: GET /api/v1/workspaces/:ws/clients/:client/daily-entries/series on a dedicated
 * disposable PostgreSQL database (INTEGRATION_DATABASE_URL). Calls the
 * route the way a client does (real Request, bearer credential from a real
 * sign-in) and asserts the literal JSON contract, latest-revision
 * selection, missing-vs-zero semantics and the authorization matrix.
 * Synthetic fixtures only.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

function call(
  workspaceId: string,
  clientProfileId: string,
  qs: string,
  headers: Record<string, string> = {},
) {
  return GET(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/clients/${clientProfileId}/daily-entries/series${qs}`,
      { headers },
    ),
    { params: Promise.resolve({ workspaceId, clientProfileId }) },
  );
}

describe.skipIf(!enabled)(
  "GET /api/v1/workspaces/:ws/clients/:client/daily-entries/series (real PG)",
  () => {
    let prisma: PrismaClient;
    let n = 0;
    const PASSWORD = "fixture-pass-1";
    const uid = () => `sv2_${++n}_${Date.now()}`;

    async function signInToken(email: string) {
      const res = await auth.handler(
        new Request(`${BASE}/api/auth/sign-in/email`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `10.222.0.${++n}`,
          },
          body: JSON.stringify({ email, password: PASSWORD }),
        }),
      );
      expect(res.status).toBe(200);
      const token = res.headers.get("set-auth-token");
      expect(token).toBeTruthy();
      return token as string;
    }

    async function mkUser(email: string) {
      const user = await prisma.user.create({
        data: { email, passwordHash: "fixture", name: email, status: "ACTIVE" },
      });
      await prisma.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: await hashPassword(PASSWORD),
        },
      });
      return user;
    }

    /**
     * One workspace with a staff member, a client member + profile, a
     * numeric parameter set and the setup/pin scaffolding entries need.
     */
    async function seed() {
      const tag = uid();
      const ws = await prisma.workspace.create({
        data: { name: tag, slug: tag, status: "ACTIVE" },
      });
      const owner = await mkUser(`${tag}-o@example.test`);
      const coach = await mkUser(`${tag}-ch@example.test`);
      const client = await mkUser(`${tag}-c@example.test`);
      const mkMember = (
        userId: string,
        role: "WORKSPACE_OWNER" | "COACH" | "CLIENT",
      ) =>
        prisma.workspaceMember.create({
          data: { workspaceId: ws.id, userId, role, status: "ACTIVE" },
        });
      const ownerMember = await mkMember(owner.id, "WORKSPACE_OWNER");
      await mkMember(coach.id, "COACH");
      const clientMember = await mkMember(client.id, "CLIENT");
      const profile = await prisma.clientProfile.create({
        data: { workspaceId: ws.id, userId: client.id, name: "C" },
      });
      const mkParam = (
        suffix: string,
        kind: "MEASUREMENT" | "RATING" | "TEXT",
        extra: Record<string, unknown> = {},
      ) =>
        prisma.parameterDefinition.create({
          data: {
            workspaceId: ws.id,
            key: `p_${tag}_${suffix}`,
            kind,
            label: `Label ${suffix}`,
            unit: kind === "MEASUREMENT" ? "kg" : null,
            ratingScheme: kind === "RATING" ? "SCALE_1_10" : null,
            dataClassification: "GENERAL_HEALTH",
            createdByMemberId: ownerMember.id,
            updatedByMemberId: ownerMember.id,
            ...extra,
          },
        });
      const weight = await mkParam("w", "MEASUREMENT");
      const mood = await mkParam("m", "RATING");
      const note = await mkParam("n", "TEXT");
      const cycle = await mkParam("cy", "MEASUREMENT", {
        dataClassification: "CYCLE",
      });
      const template = await prisma.coachingTemplate.create({
        data: {
          workspaceId: ws.id,
          name: "T",
          createdByMemberId: ownerMember.id,
        },
      });
      const version = await prisma.coachingTemplateVersion.create({
        data: {
          workspaceId: ws.id,
          templateId: template.id,
          versionSeq: 1,
          definition: { title: "T", sections: [], parameters: {} },
          publishOriginRevision: 1,
          publishedByMemberId: ownerMember.id,
        },
      });
      const setup = await prisma.clientSetup.create({
        data: { workspaceId: ws.id, clientProfileId: profile.id },
      });
      const pin = await prisma.clientSetupPin.create({
        data: {
          clientSetupId: setup.id,
          workspaceId: ws.id,
          clientProfileId: profile.id,
          seq: 1,
          templateId: template.id,
          templateVersionId: version.id,
          assignedByMemberId: ownerMember.id,
        },
      });
      // Dev consent rows matching the parked-gate dev policy versions.
      for (const [kind, version] of [
        ["PRIVACY_NOTICE", DAILY_ENTRY_DEV_CONSENT.PRIVACY_NOTICE],
        ["HEALTH_DATA", DAILY_ENTRY_DEV_CONSENT.HEALTH_DATA],
      ] as const)
        await prisma.consentRecord.create({
          data: { clientProfileId: profile.id, kind, version },
        });
      return {
        ws,
        owner,
        coach,
        client,
        clientMember,
        profile,
        weight,
        mood,
        note,
        cycle,
        version,
        pin,
      };
    }

    /** Entry + one current revision holding `values` for `date`. */
    async function mkEntry(
      fx: Awaited<ReturnType<typeof seed>>,
      profileId: string,
      date: string,
      values: Array<{
        parameterId: string;
        kind: "MEASUREMENT" | "RATING" | "TEXT";
        numeric?: string;
        rating?: number;
        text?: string;
      }>,
      opts: { revs?: Array<typeof values>; pointToLatest?: boolean } = {},
    ) {
      const entry = await prisma.dailyEntry.create({
        data: {
          workspaceId: fx.ws.id,
          clientProfileId: profileId,
          entryDate: new Date(`${date}T00:00:00Z`),
          createdByMemberId: fx.clientMember.id,
        },
      });
      const seqs = opts.revs ?? [values];
      let lastRev = null;
      for (const [i, vs] of seqs.entries()) {
        const rev = await prisma.dailyEntryRevision.create({
          data: {
            dailyEntryId: entry.id,
            workspaceId: fx.ws.id,
            clientProfileId: profileId,
            clientSetupPinId: fx.pin.id,
            templateVersionId: fx.version.id,
            seq: i + 1,
            canonicalHash: `h_${entry.id}_${i + 1}`,
            declaredAt: new Date(),
            createdByMemberId: fx.clientMember.id,
          },
        });
        for (const v of vs) {
          await prisma.dailyEntryRevisionValue.create({
            data: {
              revisionId: rev.id,
              workspaceId: fx.ws.id,
              parameterId: v.parameterId,
              kind: v.kind,
              valueNumeric: v.numeric,
              valueRating: v.rating,
              valueText: v.text,
            },
          });
        }
        lastRev = rev;
      }
      if (lastRev)
        await prisma.dailyEntry.update({
          where: { id: entry.id },
          data: { currentRevisionId: lastRev.id },
        });
      return entry;
    }

    beforeAll(async () => {
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: url as string },
      });
      prisma = new PrismaClient({
        datasources: { db: { url: url as string } },
      });
      await prisma.$executeRawUnsafe(
        'TRUNCATE "daily_entry_revision_value","daily_entry_revision","daily_entry","client_setup_pin","client_setup","coaching_template_version_parameter","coaching_template_version","coaching_template","parameter_definition","consent_record","client_profile","client_assignment","workspace_member","workspace","rate_limit","verifications","sessions","accounts","users" RESTART IDENTITY CASCADE',
      );
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });

    const seriesQs = (fx: Awaited<ReturnType<typeof seed>>, extra = "") =>
      `?parameterId=${fx.weight.id}&from=2026-10-01&to=2026-10-31${extra}`;

    it("returns the literal ascending series for a staff reader", async () => {
      const fx = await seed();
      await mkEntry(fx, fx.profile.id, "2026-10-03", [
        { parameterId: fx.weight.id, kind: "MEASUREMENT", numeric: "84.0" },
      ]);
      await mkEntry(fx, fx.profile.id, "2026-10-01", [
        { parameterId: fx.weight.id, kind: "MEASUREMENT", numeric: "83.5" },
      ]);
      const token = await signInToken(fx.owner.email);
      const res = await call(fx.ws.id, fx.profile.id, seriesQs(fx), {
        authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        state: "ready",
        parameter: {
          parameterId: fx.weight.id,
          key: fx.weight.key,
          label: fx.weight.label,
          unit: "kg",
          kind: "MEASUREMENT",
        },
        from: "2026-10-01",
        to: "2026-10-31",
        points: [
          { date: "2026-10-01", value: 83.5 },
          { date: "2026-10-03", value: 84 },
        ],
      });
    });

    it("returns a literal RATING series from the current revisions", async () => {
      const fx = await seed();
      await mkEntry(fx, fx.profile.id, "2026-10-04", [
        { parameterId: fx.mood.id, kind: "RATING", rating: 6 },
      ]);
      await mkEntry(fx, fx.profile.id, "2026-10-02", [], {
        revs: [
          [{ parameterId: fx.mood.id, kind: "RATING", rating: 4 }],
          [{ parameterId: fx.mood.id, kind: "RATING", rating: 7 }],
        ],
      });
      const token = await signInToken(fx.owner.email);
      const res = await call(
        fx.ws.id,
        fx.profile.id,
        `?parameterId=${fx.mood.id}&from=2026-10-01&to=2026-10-31`,
        { authorization: `Bearer ${token}` },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        state: "ready",
        parameter: {
          parameterId: fx.mood.id,
          key: fx.mood.key,
          label: fx.mood.label,
          unit: null,
          kind: "RATING",
        },
        from: "2026-10-01",
        to: "2026-10-31",
        points: [
          { date: "2026-10-02", value: 7 },
          { date: "2026-10-04", value: 6 },
        ],
      });
    });

    it("reads the latest revision only", async () => {
      const fx = await seed();
      await mkEntry(fx, fx.profile.id, "2026-10-02", [], {
        revs: [
          [
            {
              parameterId: fx.weight.id,
              kind: "MEASUREMENT",
              numeric: "80.0",
            },
          ],
          [
            {
              parameterId: fx.weight.id,
              kind: "MEASUREMENT",
              numeric: "81.25",
            },
          ],
        ],
      });
      const token = await signInToken(fx.coach.email);
      const res = await call(fx.ws.id, fx.profile.id, seriesQs(fx), {
        authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);
      expect((await res.json()).points).toEqual([
        { date: "2026-10-02", value: 81.25 },
      ]);
    });

    it("keeps a recorded zero and omits dates without a value", async () => {
      const fx = await seed();
      await mkEntry(fx, fx.profile.id, "2026-10-05", [
        { parameterId: fx.weight.id, kind: "MEASUREMENT", numeric: "0" },
      ]);
      // Entry whose current revision holds a different parameter only.
      await mkEntry(fx, fx.profile.id, "2026-10-06", [
        { parameterId: fx.mood.id, kind: "RATING", rating: 7 },
      ]);
      const token = await signInToken(fx.owner.email);
      const res = await call(fx.ws.id, fx.profile.id, seriesQs(fx), {
        authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);
      expect((await res.json()).points).toEqual([
        { date: "2026-10-05", value: 0 },
      ]);
    });

    it("bounds the series to the inclusive from/to window", async () => {
      const fx = await seed();
      for (const [date, numeric] of [
        ["2026-09-30", "70.0"],
        ["2026-10-01", "71.0"],
        ["2026-10-31", "72.0"],
        ["2026-11-01", "73.0"],
      ] as const)
        await mkEntry(fx, fx.profile.id, date, [
          { parameterId: fx.weight.id, kind: "MEASUREMENT", numeric },
        ]);
      const token = await signInToken(fx.owner.email);
      const res = await call(fx.ws.id, fx.profile.id, seriesQs(fx), {
        authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);
      expect((await res.json()).points).toEqual([
        { date: "2026-10-01", value: 71 },
        { date: "2026-10-31", value: 72 },
      ]);
    });

    it("lets a client read its own series", async () => {
      const fx = await seed();
      await mkEntry(fx, fx.profile.id, "2026-10-04", [
        { parameterId: fx.weight.id, kind: "MEASUREMENT", numeric: "82.5" },
      ]);
      const token = await signInToken(fx.client.email);
      const res = await call(fx.ws.id, fx.profile.id, seriesQs(fx), {
        authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);
      expect((await res.json()).points).toEqual([
        { date: "2026-10-04", value: 82.5 },
      ]);
    });

    it("denies a client reading another client's series", async () => {
      const fx = await seed();
      const other = await prisma.clientProfile.create({
        data: { workspaceId: fx.ws.id, name: "Other" },
      });
      const token = await signInToken(fx.client.email);
      const res = await call(fx.ws.id, other.id, seriesQs(fx), {
        authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: { code: "forbidden" } });
    });

    it("denies a member of a foreign workspace", async () => {
      const fx = await seed();
      const foreign = await seed();
      const token = await signInToken(foreign.owner.email);
      const res = await call(fx.ws.id, fx.profile.id, seriesQs(fx), {
        authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: { code: "forbidden" } });
    });

    it("denies a request with no credentials", async () => {
      const fx = await seed();
      const res = await call(fx.ws.id, fx.profile.id, seriesQs(fx));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: { code: "unauthenticated" } });
    });

    it("still returns history for an archived client (D27: records stay)", async () => {
      const fx = await seed();
      await mkEntry(fx, fx.profile.id, "2026-10-02", [
        { parameterId: fx.weight.id, kind: "MEASUREMENT", numeric: "79.5" },
      ]);
      await prisma.clientProfile.update({
        where: { id: fx.profile.id },
        data: { archivedAt: new Date(), archiveReason: "paused" },
      });
      const token = await signInToken(fx.owner.email);
      const res = await call(fx.ws.id, fx.profile.id, seriesQs(fx), {
        authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);
      expect((await res.json()).points).toEqual([
        { date: "2026-10-02", value: 79.5 },
      ]);
    });

    it("returns 403 for non-numeric, non-GENERAL_HEALTH or foreign parameters", async () => {
      const fx = await seed();
      const foreign = await seed();
      const token = await signInToken(fx.owner.email);
      for (const parameterId of [
        fx.note.id,
        fx.cycle.id,
        foreign.weight.id,
        "does-not-exist",
      ]) {
        const res = await call(
          fx.ws.id,
          fx.profile.id,
          `?parameterId=${parameterId}&from=2026-10-01&to=2026-10-31`,
          { authorization: `Bearer ${token}` },
        );
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({
          error: { code: "not_available" },
        });
      }
    });

    it("rejects inverted, malformed and oversized ranges with 400", async () => {
      const fx = await seed();
      const token = await signInToken(fx.owner.email);
      for (const range of [
        "from=2026-10-31&to=2026-10-01",
        "from=2026-02-30&to=2026-10-01",
        "from=2024-01-01&to=2026-10-01",
      ]) {
        const res = await call(
          fx.ws.id,
          fx.profile.id,
          `?parameterId=${fx.weight.id}&${range}`,
          { authorization: `Bearer ${token}` },
        );
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: { code: "invalid_input" } });
      }
    });
  },
);
