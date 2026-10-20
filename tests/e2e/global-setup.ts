import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../../lib/password";

/**
 * S1-H E2E fixtures. Deterministic, namespaced and idempotent:
 * - reserved emails end `@s1h-e2e.test`
 * - reserved workspace slugs are `s1h-e2e-workspace` / `s1h-e2e-workspace-b`
 * No broad deletes; `global-teardown.ts` removes only these reserved rows.
 */
export const E2E = {
  password: "s1h-e2e-password",
  owner: "owner@s1h-e2e.test",
  coach: "coach@s1h-e2e.test",
  client: "client@s1h-e2e.test",
  assistant: "assistant@s1h-e2e.test",
  support: "support@s1h-e2e.test",
  nonmember: "nonmember@s1h-e2e.test",
  deactivated: "deactivated@s1h-e2e.test",
  workspaceSlug: "s1h-e2e-workspace",
  workspaceName: "S1H E2E Workspace",
  workspaceBSlug: "s1h-e2e-workspace-b",
  workspaceBName: "S1H E2E Workspace B",
};

export function e2eDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "postgresql://app:app_dev_password@127.0.0.1:5433/app_dev?schema=public"
  );
}

export default async function globalSetup(): Promise<void> {
  const url = e2eDatabaseUrl();
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const passwordHash = await hashPassword(E2E.password);
    const upsertUser = async (email: string) => {
      const user = await prisma.user.upsert({
        where: { email },
        update: { passwordHash, status: "ACTIVE", name: email },
        create: { email, passwordHash, status: "ACTIVE", name: email },
      });
      // PR-05: Better Auth verifies against the credential `accounts` row —
      // `users.passwordHash` stays as the legacy mirror only.
      await prisma.account.upsert({
        where: {
          providerId_accountId: {
            providerId: "credential",
            accountId: user.id,
          },
        },
        update: { password: passwordHash },
        create: {
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: passwordHash,
        },
      });
      return user;
    };

    const owner = await upsertUser(E2E.owner);
    const coach = await upsertUser(E2E.coach);
    const client = await upsertUser(E2E.client);
    const assistant = await upsertUser(E2E.assistant);
    const support = await upsertUser(E2E.support);
    await upsertUser(E2E.nonmember);
    await upsertUser(E2E.deactivated);

    const upsertWorkspace = (slug: string, name: string) =>
      prisma.workspace.upsert({
        where: { slug },
        update: { name, status: "ACTIVE" },
        create: { slug, name, status: "ACTIVE" },
      });
    const wsA = await upsertWorkspace(E2E.workspaceSlug, E2E.workspaceName);
    const wsB = await upsertWorkspace(E2E.workspaceBSlug, E2E.workspaceBName);

    const upsertMember = (
      workspaceId: string,
      userId: string,
      role:
        "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT",
    ) =>
      prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId, userId } },
        update: { role, status: "ACTIVE" },
        create: { workspaceId, userId, role, status: "ACTIVE" },
      });

    await upsertMember(wsA.id, owner.id, "WORKSPACE_OWNER");
    await upsertMember(wsA.id, coach.id, "COACH");
    await upsertMember(wsA.id, client.id, "CLIENT");
    await upsertMember(wsA.id, assistant.id, "ASSISTANT_COACH");
    await upsertMember(wsA.id, support.id, "SUPPORT");
    await upsertMember(wsB.id, owner.id, "WORKSPACE_OWNER");
  } finally {
    await prisma.$disconnect();
  }
}
