import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { MemberRole } from "@prisma/client";

import { hashPassword } from "../../lib/password";
import type { SeedContext } from "./index";

/**
 * PR-04 (D17, D18) — canvas demo workspace seed. SEED-FIX: every seeded
 * sign-in user also gets a Better Auth credential `accounts` row, so a
 * freshly seeded lane database can actually sign in.
 *
 * Creates the workspace the canvas shows (`canvas-demo`, "Liliana Mansfeld
 * Coaching"), the owner the canvas account block names (Liliana Mansfeld,
 * WORKSPACE_OWNER), one staff coach (Sofia Miller, the canvas brand coach
 * name), one sign-in client linked to the first canvas demo client profile,
 * and the fifteen canvas demo clients as ClientProfile rows whose synthetic
 * names come from the canvas roster data
 * (`lib/canvas/data/mock-data.json`, surfaced by
 * `components/canvas/coach/model.ts`). A second workspace
 * (`seed-second-workspace`) carries one staff coach, so seeded sign-in also
 * covers a membership outside `canvas-demo`.
 *
 * Since PR-05, credential sign-in reads the `accounts` table — the seed
 * writes `providerId="credential"`, `accountId=user.id`,
 * `password=hashPassword(...)`, exactly as `lib/auth/signup.ts` does.
 * `users.passwordHash` is read-dead (schema comment marks it for PR-R2
 * removal) and the seed no longer writes it.
 *
 * Credentials come from environment variables only and are never committed:
 *   SEED_OWNER_EMAIL,  SEED_OWNER_PASSWORD  — owner of `canvas-demo`.
 *   SEED_COACH_EMAIL,  SEED_COACH_PASSWORD  — coach of `canvas-demo`.
 *   SEED_CLIENT_EMAIL, SEED_CLIENT_PASSWORD — client of `canvas-demo`, linked
 *     to the first canvas demo client profile.
 *   SEED_STAFF2_EMAIL, SEED_STAFF2_PASSWORD — coach of `seed-second-workspace`.
 * Passwords need >= 10 code points and one ASCII digit (owner-decided policy).
 * Every write is an idempotent upsert so `npm run seed:dev` is safe to re-run.
 */

const WORKSPACE_SLUG = "canvas-demo";
const WORKSPACE_NAME = "Liliana Mansfeld Coaching";
const OWNER_NAME = "Liliana Mansfeld";
const COACH_NAME = "Sofia Miller";
const SECOND_WORKSPACE_SLUG = "seed-second-workspace";
const SECOND_WORKSPACE_NAME = "Seed Second Workspace";
const STAFF2_NAME = "Second Workspace Coach";

type CanvasClient = { id: string; name: string };

function canvasClientNames(): string[] {
  const dataPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../lib/canvas/data/mock-data.json",
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
  const clientEmail = requiredEnv("SEED_CLIENT_EMAIL");
  const clientPassword = requiredEnv("SEED_CLIENT_PASSWORD");
  const staff2Email = requiredEnv("SEED_STAFF2_EMAIL");
  const staff2Password = requiredEnv("SEED_STAFF2_PASSWORD");

  const workspace = await prisma.workspace.upsert({
    where: { slug: WORKSPACE_SLUG },
    update: {},
    create: { name: WORKSPACE_NAME, slug: WORKSPACE_SLUG },
  });

  const owner = await upsertUser(prisma, ownerEmail, OWNER_NAME);
  await upsertCredentialAccount(prisma, owner.id, ownerPassword);
  await upsertMember(prisma, workspace.id, owner.id, "WORKSPACE_OWNER");

  const coach = await upsertUser(prisma, coachEmail, COACH_NAME);
  await upsertCredentialAccount(prisma, coach.id, coachPassword);
  await upsertMember(prisma, workspace.id, coach.id, "COACH");

  const names = canvasClientNames();
  // The seeded client signs in as the first canvas demo client so a lane can
  // exercise the client role against a roster row the canvas already shows.
  const clientName = names[0];
  const client = await upsertUser(prisma, clientEmail, clientName);
  await upsertCredentialAccount(prisma, client.id, clientPassword);
  await upsertMember(prisma, workspace.id, client.id, "CLIENT");
  await linkClientProfile(prisma, workspace.id, client.id, clientName);

  const secondWorkspace = await prisma.workspace.upsert({
    where: { slug: SECOND_WORKSPACE_SLUG },
    update: {},
    create: { name: SECOND_WORKSPACE_NAME, slug: SECOND_WORKSPACE_SLUG },
  });
  const staff2 = await upsertUser(prisma, staff2Email, STAFF2_NAME);
  await upsertCredentialAccount(prisma, staff2.id, staff2Password);
  await upsertMember(prisma, secondWorkspace.id, staff2.id, "COACH");

  let created = 0;
  for (const name of names) {
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
    `[seed] workspace ${workspace.slug}: owner+coach+client ready, ` +
      `${created} client profile(s) created, ${total} total; ` +
      `second workspace ${secondWorkspace.slug}: staff ready`,
  );
}

async function upsertUser(
  prisma: SeedContext["prisma"],
  email: string,
  name: string,
) {
  return prisma.user.upsert({
    where: { email },
    update: { name, status: "ACTIVE" },
    create: { email, name, status: "ACTIVE" },
  });
}

/**
 * The Better Auth credential row — same shape `lib/auth/signup.ts` writes
 * (`providerId="credential"`, `accountId=user.id`, `password=hashPassword`).
 */
async function upsertCredentialAccount(
  prisma: SeedContext["prisma"],
  userId: string,
  password: string,
): Promise<void> {
  const passwordHash = await hashPassword(password);
  await prisma.account.upsert({
    where: {
      providerId_accountId: { providerId: "credential", accountId: userId },
    },
    update: { password: passwordHash },
    create: {
      userId,
      accountId: userId,
      providerId: "credential",
      password: passwordHash,
    },
  });
}

async function linkClientProfile(
  prisma: SeedContext["prisma"],
  workspaceId: string,
  userId: string,
  name: string,
): Promise<void> {
  const existing = await prisma.clientProfile.findFirst({
    where: { workspaceId, name },
    select: { id: true, userId: true },
  });
  if (existing) {
    if (existing.userId !== userId)
      await prisma.clientProfile.update({
        where: { id: existing.id },
        data: { userId },
      });
    return;
  }
  await prisma.clientProfile.create({
    data: { workspaceId, userId, name },
  });
}

async function upsertMember(
  prisma: SeedContext["prisma"],
  workspaceId: string,
  userId: string,
  role: MemberRole,
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
