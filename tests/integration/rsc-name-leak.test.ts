// RSC-NAME-LEAK (issue #71) — a denied staff page must not carry tenant data.
//
// The reported defect: per-client pages under app/workspace/ ran
// `prisma.clientProfile.findFirst({ select: { name: true } })` keyed by raw URL
// ids BEFORE the authorizing boundary call, then rendered the name
// unconditionally. The workspace layout answers HTTP 403 for a foreign
// workspace, but the page's own render still completed and the foreign
// client's name was serialized into the RSC payload.
//
// This suite renders the REAL page components in-process against disposable
// PostgreSQL with a real Auth.js session cookie (the same pipeline
// s1-f2b-session-runtime drives). For every denied path it asserts three
// things: the denial copy is present (proving the denied branch rendered),
// the foreign client name is absent from the produced element tree (the RSC
// payload content), and no `select: { name: true }` clientProfile lookup ran
// at all (authorization before any lookup that returns tenant data).
// A same-workspace control proves the name still renders when authorized.

import { execFileSync } from "node:child_process";

import { encode } from "@auth/core/jwt";
import { PrismaClient } from "@prisma/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// route-guard + pages import next/navigation (redirect/forbidden/notFound) at
// top level; client components in the module graph import useRouter.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  forbidden: vi.fn(() => {
    throw new Error("forbidden");
  }),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
}));

import { prisma } from "../../lib/db";
import { setTestHeaders } from "./stubs/next-headers";
import StaffClientCheckInsPage from "../../app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/page";
import ClientCoachesPage from "../../app/workspace/[workspaceId]/clients/[clientProfileId]/coaches/page";
import StaffClientDashboardPage from "../../app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/page";
import StaffClientMealPlanPage from "../../app/workspace/[workspaceId]/clients/[clientProfileId]/meal-plan/page";
import StaffClientTrainingProgramsPage from "../../app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/page";
import StaffTrainingProgramPage from "../../app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/[programId]/page";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const AUTH_SECRET = "integration-test-auth-secret-not-for-production";
const COOKIE_NAME = "authjs.session-token";
const CLIENT_B_NAME = "Client B1 LEAK-MARKER-7431";

type AnyElement = unknown;

/** Collect every string in a React element tree — the values the RSC
 * serializer would emit into the flight payload. */
function collectStrings(
  node: AnyElement,
  out: string[] = [],
  seen = new Set<object>(),
): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (typeof node !== "object" || node === null || seen.has(node)) return out;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, out, seen);
    return out;
  }
  for (const value of Object.values(node)) collectStrings(value, out, seen);
  return out;
}

describe.skipIf(!enabled)("RSC-NAME-LEAK (real PG)", () => {
  let fixture: PrismaClient;
  let ids: {
    userA: string;
    wsA: string;
    wsB: string;
    ownerB: string;
    coachB: string;
    clientB: string;
  };

  // The page's own name lookup is the only caller that selects `name` —
  // internal authorization reads select id/workspaceId/userId only.
  let clientFind: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    fixture = new PrismaClient({ datasources: { db: { url: url as string } } });
    await fixture.$executeRawUnsafe(
      'TRUNCATE "training_program_version","training_program","consent_record","audit_event","client_assignment","client_profile","coach_profile","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );

    process.env.ENABLE_TRAINING_PLANS = "1";
    process.env.ENABLE_MEAL_PLANS = "1";
    process.env.ENABLE_CHECK_INS = "1";
    process.env.ENABLE_CLIENT_DASHBOARD = "1";
    process.env.APP_ENV = "test";

    const userA = await fixture.user.create({
      data: {
        email: `leak-a-${Date.now()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: "User A",
        status: "ACTIVE",
      },
    });
    const wsA = await fixture.workspace.create({
      data: {
        name: "Workspace A",
        slug: `ws-a-${Date.now()}`,
        status: "ACTIVE",
      },
    });
    await fixture.workspaceMember.create({
      data: {
        workspaceId: wsA.id,
        userId: userA.id,
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      },
    });

    const ownerB = await fixture.user.create({
      data: {
        email: `leak-ownerb-${Date.now()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: "Owner B",
        status: "ACTIVE",
      },
    });
    const coachB = await fixture.user.create({
      data: {
        email: `leak-coachb-${Date.now()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: "Coach B",
        status: "ACTIVE",
      },
    });
    const clientUserB = await fixture.user.create({
      data: {
        email: `leak-clientb-${Date.now()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: "Client user B",
        status: "ACTIVE",
      },
    });
    const wsB = await fixture.workspace.create({
      data: {
        name: "Workspace B",
        slug: `ws-b-${Date.now()}`,
        status: "ACTIVE",
      },
    });
    for (const [userId, role] of [
      [ownerB.id, "WORKSPACE_OWNER"],
      [coachB.id, "COACH"],
      [clientUserB.id, "CLIENT"],
    ] as const) {
      await fixture.workspaceMember.create({
        data: { workspaceId: wsB.id, userId, role, status: "ACTIVE" },
      });
    }
    const clientB = await fixture.clientProfile.create({
      data: {
        workspaceId: wsB.id,
        userId: clientUserB.id,
        name: CLIENT_B_NAME,
      },
    });
    for (const [kind, version] of [
      ["PRIVACY_NOTICE", "training-plan-dev-privacy-v1"],
      ["HEALTH_DATA", "training-plan-dev-health-v1"],
    ] as const) {
      await fixture.consentRecord.create({
        data: { clientProfileId: clientB.id, kind, version },
      });
    }

    ids = {
      userA: userA.id,
      wsA: wsA.id,
      wsB: wsB.id,
      ownerB: ownerB.id,
      coachB: coachB.id,
      clientB: clientB.id,
    };

    clientFind = vi.spyOn(prisma.clientProfile, "findFirst");
  });

  beforeEach(() => {
    clientFind?.mockClear();
  });

  afterAll(async () => {
    clientFind?.mockRestore();
    delete process.env.ENABLE_TRAINING_PLANS;
    delete process.env.ENABLE_MEAL_PLANS;
    delete process.env.ENABLE_CHECK_INS;
    delete process.env.ENABLE_CLIENT_DASHBOARD;
    delete process.env.APP_ENV;
    await fixture?.$disconnect();
  });

  /** Real Auth.js session cookie through the stubbed headers hook. */
  async function asUser(userId: string) {
    const jwt = await encode({
      token: {
        iat: Math.floor(Date.now() / 1000),
        sub: userId,
        sv: 0,
      } as never,
      secret: AUTH_SECRET,
      salt: COOKIE_NAME,
      maxAge: 30 * 24 * 60 * 60,
    });
    setTestHeaders(
      new Headers({
        cookie: `${COOKIE_NAME}=${jwt}`,
        host: "localhost",
        "x-forwarded-proto": "http",
      }),
    );
  }

  /** Count page-level name lookups — the select: { name: true } shape only the
   * pre-authorization clientProfile read uses. */
  function nameLookupCount(): number {
    const calls = clientFind.mock.calls as Array<
      [{ select?: Record<string, unknown> }?]
    >;
    return calls.filter(([args]) => args?.select?.name === true).length;
  }

  function expectDeniedBody(tree: AnyElement, denialCopy: string) {
    const text = collectStrings(tree).join("\n");
    expect(text).toContain(denialCopy);
    expect(text).not.toContain(CLIENT_B_NAME);
    expect(nameLookupCount()).toBe(0);
  }

  it("training-program list: denied render carries the denial copy, never the foreign name", async () => {
    await asUser(ids.userA);
    const tree = await StaffClientTrainingProgramsPage({
      params: Promise.resolve({
        workspaceId: ids.wsB,
        clientProfileId: ids.clientB,
      }),
    });
    expectDeniedBody(tree, "have access");
  });

  it("training-program list: the workspace-B owner still sees the client name", async () => {
    await asUser(ids.ownerB);
    const tree = await StaffClientTrainingProgramsPage({
      params: Promise.resolve({
        workspaceId: ids.wsB,
        clientProfileId: ids.clientB,
      }),
    });
    const text = collectStrings(tree).join("\n");
    expect(text).toContain(CLIENT_B_NAME);
    expect(nameLookupCount()).toBe(1);
  });

  it("training-program detail: denied render carries no foreign name", async () => {
    await asUser(ids.userA);
    const tree = await StaffTrainingProgramPage({
      params: Promise.resolve({
        workspaceId: ids.wsB,
        clientProfileId: ids.clientB,
        programId: "no-such-program",
      }),
    });
    expectDeniedBody(tree, "have access");
  });

  it("meal-plan: denied render carries no foreign name", async () => {
    await asUser(ids.userA);
    const tree = await StaffClientMealPlanPage({
      params: Promise.resolve({
        workspaceId: ids.wsB,
        clientProfileId: ids.clientB,
      }),
    });
    expectDeniedBody(tree, "have access");
  });

  it("checkins: denied render carries no foreign name", async () => {
    await asUser(ids.userA);
    const tree = await StaffClientCheckInsPage({
      params: Promise.resolve({
        workspaceId: ids.wsB,
        clientProfileId: ids.clientB,
      }),
      searchParams: Promise.resolve({}),
    });
    expectDeniedBody(tree, "have access");
  });

  it("coaches: denial is uniform 403 — no pre-authz lookup, no existence oracle", async () => {
    await asUser(ids.userA);
    await expect(
      ClientCoachesPage({
        params: Promise.resolve({
          workspaceId: ids.wsB,
          clientProfileId: ids.clientB,
        }),
      }),
    ).rejects.toThrow("forbidden");
    // A nonexistent client id must fail the same way — the URL-id lookup only
    // runs after authorization.
    await expect(
      ClientCoachesPage({
        params: Promise.resolve({
          workspaceId: ids.wsB,
          clientProfileId: "no-such-client",
        }),
      }),
    ).rejects.toThrow("forbidden");
    expect(nameLookupCount()).toBe(0);
  });

  it("dashboard: assigned-scope member on an unassigned client is denied before the name lookup", async () => {
    await asUser(ids.coachB);
    await expect(
      StaffClientDashboardPage({
        params: Promise.resolve({
          workspaceId: ids.wsB,
          clientProfileId: ids.clientB,
        }),
      }),
    ).rejects.toThrow("not-found");
    expect(nameLookupCount()).toBe(0);
  });

  it("dashboard: a foreign-workspace user is denied before the name lookup", async () => {
    await asUser(ids.userA);
    await expect(
      StaffClientDashboardPage({
        params: Promise.resolve({
          workspaceId: ids.wsB,
          clientProfileId: ids.clientB,
        }),
      }),
    ).rejects.toThrow("not-found");
    expect(nameLookupCount()).toBe(0);
  });
});
