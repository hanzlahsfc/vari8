import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { SeedContext } from "./index";

/**
 * PR-M1 (D1, D27) — canvas demo client profile fields.
 *
 * `00-workspace.seed.ts` creates the fifteen `ClientProfile` rows by name;
 * this module copies the profile fields the canvas demo state carries for
 * this domain onto those rows so the wiring PR's parity run compares like
 * with like:
 *
 * - `label`, `coachingSince`, `heightCm` from
 *   `frontend/src/data/mock-data.json` (`clients[*]`).
 * - `priorityMessagesAllowed` from the canvas seed rule in
 *   `frontend/src/components/coach/model.ts` (`seedState`: index 0 and 4 get
 *   `priorityMessages: true` — Emma Anders and Maya Patel).
 * - `archivedAt`/`archiveReason` stay unset: every canvas demo client is
 *   `archived: false` (`frontend/src/components/ethereal/clients/model.ts`).
 *
 * Idempotent: re-running writes the same values. Rows are matched by
 * (workspace slug `canvas-demo`, name); a missing profile is created with the
 * canvas values so the seed composes in either order.
 */

const WORKSPACE_SLUG = "canvas-demo";

type CanvasClient = {
  id: string;
  name: string;
  label?: string;
  coachingSince?: string;
  heightCm?: number;
};

function canvasClients(): CanvasClient[] {
  const dataPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../frontend/src/data/mock-data.json",
  );
  const data = JSON.parse(readFileSync(dataPath, "utf8")) as {
    clients?: CanvasClient[];
  };
  const clients = data.clients ?? [];
  if (clients.length === 0)
    throw new Error(`no canvas clients found in ${dataPath}`);
  return clients;
}

export default async function seed(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;
  const workspace = await prisma.workspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true },
  });
  if (!workspace)
    throw new Error(
      `workspace ${WORKSPACE_SLUG} missing; run 00-workspace.seed.ts first`,
    );
  const coachMembers = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id, role: "COACH", status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const coachMember = coachMembers[0];
  // W2-FE2: any further seeded coaches are assigned at COACH scope so the
  // assigned-scope matrix has more than one authorized staff member.
  const extraCoachMembers = coachMembers.slice(1);

  let written = 0;
  const clients = canvasClients();
  for (const [index, client] of clients.entries()) {
    const data = {
      label: client.label ?? null,
      coachingSince: client.coachingSince
        ? new Date(client.coachingSince)
        : null,
      heightCm: client.heightCm ?? null,
      // Canvas rule, model.ts seedState: priorityMessages: i === 0 || i === 4.
      priorityMessagesAllowed: index === 0 || index === 4,
    };
    const existing = await prisma.clientProfile.findFirst({
      where: { workspaceId: workspace.id, name: client.name },
      select: { id: true },
    });
    const profile = existing
      ? await prisma.clientProfile.update({
          where: { id: existing.id },
          data,
          select: { id: true },
        })
      : await prisma.clientProfile.create({
          data: { workspaceId: workspace.id, name: client.name, ...data },
          select: { id: true },
        });
    // CHECKIN-ENABLE — the canvas demo is a single-coach workspace: staff
    // check-in scheduling/review reads require a coherent ACTIVE
    // client_assignment, so every canvas client is linked to the seeded
    // COACH member as PRIMARY. Idempotent on the (profile, member) key.
    if (coachMember)
      await prisma.clientAssignment.upsert({
        where: {
          clientProfileId_coachMemberId: {
            clientProfileId: profile.id,
            coachMemberId: coachMember.id,
          },
        },
        update: { status: "ACTIVE" },
        create: {
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          coachMemberId: coachMember.id,
          role: "PRIMARY",
          status: "ACTIVE",
        },
      });
    for (const extraCoach of extraCoachMembers)
      await prisma.clientAssignment.upsert({
        where: {
          clientProfileId_coachMemberId: {
            clientProfileId: profile.id,
            coachMemberId: extraCoach.id,
          },
        },
        update: { status: "ACTIVE" },
        create: {
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          coachMemberId: extraCoach.id,
          role: "COACH",
          status: "ACTIVE",
        },
      });
    written += 1;
  }
  console.log(
    `[seed] clients: ${written} profile(s) synced with canvas demo fields`,
  );
}
