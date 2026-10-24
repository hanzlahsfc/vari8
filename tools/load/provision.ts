// K6-GATE fixture lifecycle (issue #178). Two commands:
//
//   tsx tools/load/provision.ts create  --clients 30 --coaches 4 --out fixtures.json
//   tsx tools/load/provision.ts cleanup --file fixtures.json
//
// `create` builds a self-contained `loadgate-<ts>` workspace: sign-in
// users (owner + coaches + clients, Better Auth credential rows via the
// same hashPassword the real seed uses), ACTIVE memberships, client
// profiles and PRIMARY assignments. All fixture emails end in
// `@loadgate.invalid` and every id the run owns is recorded in the
// fixture file — `cleanup` deletes exactly those ids in FK order and
// nothing else. No cleanup path ever touches a row it did not record.
//
// Synthetic local data only. Passwords are random per run; they live in
// the fixture file, which stays uncommitted and is deleted by cleanup.

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../../lib/password";

const FIXTURE_DOMAIN = "loadgate.invalid";
const CLIENT_PROFILE_NAME_PREFIX = "Load Gate Synthetic Client";

type FixtureFile = {
  createdAt: string;
  workspaceId: string;
  userIds: string[];
  clientProfileIds: string[];
  coaches: { email: string; password: string }[];
  clients: { email: string; password: string }[];
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const db = new PrismaClient();
  const cmd = process.argv[2];
  try {
    if (cmd === "create") {
      const clients = Number(arg("clients") ?? "30");
      const coaches = Number(arg("coaches") ?? "4");
      const out = arg("out") ?? "tools/load/out/fixtures.json";
      if (!Number.isInteger(clients) || clients < 1 || clients > 500)
        throw new Error("--clients must be an integer 1..500");
      if (!Number.isInteger(coaches) || coaches < 1 || coaches > 50)
        throw new Error("--coaches must be an integer 1..50");

      const tag = `loadgate-${Date.now()}-${randomBytes(3).toString("hex")}`;
      const fixture: FixtureFile = {
        createdAt: new Date().toISOString(),
        workspaceId: "",
        userIds: [],
        clientProfileIds: [],
        coaches: [],
        clients: [],
      };

      const ws = await db.workspace.create({
        data: { name: tag, slug: tag },
      });
      fixture.workspaceId = ws.id;

      const makeUser = async (email: string, role: "COACH" | "CLIENT") => {
        const password = `Lg!${randomBytes(8).toString("hex")}`;
        const user = await db.user.create({
          data: { email, name: `Load Gate ${role}`, emailVerified: true },
        });
        await db.account.create({
          data: {
            userId: user.id,
            providerId: "credential",
            accountId: user.id,
            password: await hashPassword(password),
          },
        });
        await db.workspaceMember.create({
          data: {
            workspaceId: ws.id,
            userId: user.id,
            role,
            status: "ACTIVE",
          },
        });
        fixture.userIds.push(user.id);
        return { email, password, userId: user.id };
      };

      const coachAccounts = [];
      for (let i = 0; i < coaches; i++)
        coachAccounts.push(
          await makeUser(`${tag}-coach-${i}@${FIXTURE_DOMAIN}`, "COACH"),
        );
      const coachMemberIds = await db.workspaceMember.findMany({
        where: { workspaceId: ws.id, role: "COACH" },
        select: { id: true },
      });

      for (let i = 0; i < clients; i++) {
        const account = await makeUser(
          `${tag}-client-${i}@${FIXTURE_DOMAIN}`,
          "CLIENT",
        );
        const profile = await db.clientProfile.create({
          data: {
            workspaceId: ws.id,
            userId: account.userId,
            name: `${CLIENT_PROFILE_NAME_PREFIX} ${i}`,
          },
        });
        fixture.clientProfileIds.push(profile.id);
        // Distribute clients round-robin across fixture coaches.
        await db.clientAssignment.create({
          data: {
            workspaceId: ws.id,
            clientProfileId: profile.id,
            coachMemberId: coachMemberIds[i % coachMemberIds.length].id,
            role: "PRIMARY",
          },
        });
        fixture.clients.push(account);
      }
      fixture.coaches = coachAccounts;

      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(fixture, null, 2));
      console.log(
        `provisioned workspace ${ws.id} (${tag}): ${coaches} coaches, ${clients} clients -> ${out}`,
      );
    } else if (cmd === "cleanup") {
      const file = arg("file");
      if (!file) throw new Error("--file <fixtures.json> is required");
      const f = JSON.parse(fs.readFileSync(file, "utf8")) as FixtureFile;
      // Exact-id deletes in FK order — nothing outside the recorded set.
      await db.clientAssignment.deleteMany({
        where: { clientProfileId: { in: f.clientProfileIds } },
      });
      await db.clientProfile.deleteMany({
        where: { id: { in: f.clientProfileIds } },
      });
      await db.workspaceMember.deleteMany({
        where: { userId: { in: f.userIds }, workspaceId: f.workspaceId },
      });
      await db.session.deleteMany({ where: { userId: { in: f.userIds } } });
      await db.account.deleteMany({ where: { userId: { in: f.userIds } } });
      await db.user.deleteMany({ where: { id: { in: f.userIds } } });
      await db.workspace.delete({ where: { id: f.workspaceId } });
      fs.rmSync(file, { force: true });
      console.log(
        `cleanup removed workspace ${f.workspaceId} + ${f.userIds.length} users`,
      );
    } else {
      console.error(
        "usage: provision.ts create --clients N --coaches N --out file.json | cleanup --file file.json",
      );
      process.exit(2);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
