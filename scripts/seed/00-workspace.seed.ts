import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { hashPassword } from "../../lib/password";
import type { SeedContext } from "./index";

/**
 * PR-04 (D17, D18) — canvas demo workspace seed.
 *
 * Creates the workspace the canvas shows (`canvas-demo`, "Liliana Mansfeld
 * Coaching"), the owner the canvas account block names (Liliana Mansfeld,
 * WORKSPACE_OWNER), one staff coach (Sofia Miller, the canvas brand coach
 * name), and the fifteen canvas demo clients as ClientProfile rows whose
 * synthetic names come from the frontend roster data
 * (`frontend/src/data/mock-data.json`, surfaced by
 * `frontend/src/components/coach/model.ts`). Client profiles carry no user
 * account yet — PR-01's identity slice (`10-identity.seed.ts`) owns client
 * sign-in.
 *
 * Credentials come from environment variables only and are never committed:
 *   SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD — sign-in for the owner.
 *   SEED_COACH_EMAIL, SEED_COACH_PASSWORD — sign-in for the coach.
 * Every write is an idempotent upsert so `npm run seed:dev` is safe to re-run.
 */

const WORKSPACE_SLUG = "canvas-demo";
const WORKSPACE_NAME = "Liliana Mansfeld Coaching";
const OWNER_NAME = "Liliana Mansfeld";
const COACH_NAME = "Sofia Miller";

type CanvasClient = { id: string; name: string };

function canvasClientNames(): string[] {
  const dataPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../frontend/src/data/mock-data.json",
  );
  const data = JSON.parse(readFileSync(dataPath, "utf8")) as {
    clients?: CanvasClient[];
  };
  const names = (data.clients ?? []).map((client) => client.name);
  if (names.length === 0)
    throw new Error(`no canvas client names found in ${dataPath}`);
  return names;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`set ${name} (seed credentials are env-only)`);
  return value;
}

export default async function seed(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;

  const ownerEmail = requiredEnv("SEED_OWNER_EMAIL");
  const ownerPassword = requiredEnv("SEED_OWNER_PASSWORD");
  const coachEmail = requiredEnv("SEED_COACH_EMAIL");
  const coachPassword = requiredEnv("SEED_COACH_PASSWORD");

  const workspace = await prisma.workspace.upsert({
    where: { slug: WORKSPACE_SLUG },
    update: {},
    create: { name: WORKSPACE_NAME, slug: WORKSPACE_SLUG },
  });

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      passwordHash: await hashPassword(ownerPassword),
      name: OWNER_NAME,
      status: "ACTIVE",
    },
    create: {
      email: ownerEmail,
      passwordHash: await hashPassword(ownerPassword),
      name: OWNER_NAME,
      status: "ACTIVE",
    },
  });
  await upsertMember(prisma, workspace.id, owner.id, "WORKSPACE_OWNER");

  const coach = await prisma.user.upsert({
    where: { email: coachEmail },
    update: {
      passwordHash: await hashPassword(coachPassword),
      name: COACH_NAME,
      status: "ACTIVE",
    },
    create: {
      email: coachEmail,
      passwordHash: await hashPassword(coachPassword),
      name: COACH_NAME,
      status: "ACTIVE",
    },
  });
  await upsertMember(prisma, workspace.id, coach.id, "COACH");

  let created = 0;
  for (const name of canvasClientNames()) {
    const existing = await prisma.clientProfile.findFirst({
      where: { workspaceId: workspace.id, name },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.clientProfile.create({
      data: { workspaceId: workspace.id, name },
    });
    created += 1;
  }
  const total = await prisma.clientProfile.count({
    where: { workspaceId: workspace.id },
  });
  console.log(
    `[seed] workspace ${workspace.slug}: owner+coach ready, ` +
      `${created} client profile(s) created, ${total} total`,
  );
}

async function upsertMember(
  prisma: SeedContext["prisma"],
  workspaceId: string,
  userId: string,
  role: "WORKSPACE_OWNER" | "COACH",
): Promise<void> {
  const existing = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId },
  });
  if (existing) {
    if (existing.role !== role || existing.status !== "ACTIVE")
      await prisma.workspaceMember.update({
        where: { id: existing.id },
        data: { role, status: "ACTIVE" },
      });
    return;
  }
  await prisma.workspaceMember.create({
    data: { workspaceId, userId, role, status: "ACTIVE" },
  });
}
