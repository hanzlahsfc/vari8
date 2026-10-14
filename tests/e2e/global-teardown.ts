import { PrismaClient } from "@prisma/client";

import { E2E, e2eDatabaseUrl } from "./global-setup";
import { sweepFixtureWorkspaces } from "./fixture-sweep";

/**
 * Removes ONLY the reserved S1-H E2E rows created by `global-setup.ts`
 * (workspaces by reserved slug, users by reserved email). No broad deletes.
 */
export default async function globalTeardown(): Promise<void> {
  const url = e2eDatabaseUrl();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const emails = [
      E2E.owner,
      E2E.coach,
      E2E.client,
      E2E.assistant,
      E2E.support,
      E2E.nonmember,
      E2E.deactivated,
    ];
    const slugs = [E2E.workspaceSlug, E2E.workspaceBSlug];
    const workspaces = await prisma.workspace.findMany({
      where: { slug: { in: slugs } },
      select: { id: true },
    });
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    await sweepFixtureWorkspaces(
      prisma,
      workspaces.map((w) => w.id),
      users.map((u) => u.id),
    );
  } finally {
    await prisma.$disconnect();
  }
}
