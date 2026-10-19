// Development user for lanes that run before PR-04's seed exists (RUNBOOK "Dev user before PR-04").
// Usage: DATABASE_URL=...app_<lane> DEV_USER_EMAIL=owner@vari8.test DEV_USER_PASSWORD=<15+ chars> \
//        npx tsx icm/05-build/tools/dev-user.ts
// Creates the canvas demo coach (Liliana Mansfeld) as WORKSPACE_OWNER of one workspace. Synthetic only.
import { prisma } from "../../../lib/db";
import { hashPassword } from "../../../lib/password";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const db = new URL(url).pathname.replace(/^\//, "");
  if (!/^app_[a-z0-9_]+$/.test(db) || db === "app_dev") {
    throw new Error(`refusing to write to database "${db}": lane databases only (app_<lane>)`);
  }
  const email = process.env.DEV_USER_EMAIL;
  const password = process.env.DEV_USER_PASSWORD;
  if (!email || !password) throw new Error("set DEV_USER_EMAIL and DEV_USER_PASSWORD");
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, status: "ACTIVE" },
    create: { email, passwordHash, name: "Liliana Mansfeld", status: "ACTIVE" },
  });
  const workspace = await prisma.workspace.upsert({
    where: { slug: "canvas-demo" },
    update: {},
    create: { name: "Liliana Mansfeld Coaching", slug: "canvas-demo" },
  });
  const existing = await prisma.workspaceMember.findFirst({ where: { workspaceId: workspace.id, userId: user.id } });
  if (!existing) {
    await prisma.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: user.id, role: "WORKSPACE_OWNER", status: "ACTIVE" },
    });
  }
  console.log(`dev user ready: ${email} owner of workspace ${workspace.slug} (${workspace.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
