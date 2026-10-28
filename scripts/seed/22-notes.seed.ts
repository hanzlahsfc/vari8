import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { SeedContext } from "./index";

/**
 * PR-M3 (D23, D26, O13) — canvas demo notes and coach to-dos.
 *
 * Seeds the CoachNote and CoachTask rows the canvas shows so the wiring
 * PR's parity run compares like with like. Values are copied verbatim
 * from the canvas demo state (`frontend/src/components/ethereal/clients/
 * model.ts`, the `details` record; mirrored in
 * `frontend/src/data/mock-data.json` clientProfile for the default
 * client): every demo client carries one private coach note and one
 * general coaching note except Ethan Cole, who carries two private
 * notes; eight clients carry one open coach to-do each.
 *
 * TrackerComment has NO canvas demo data (the canvas comments map starts
 * empty — `client-preview.tsx` `useState({})`), so none are seeded.
 *
 * Rows are authored by the workspace's coach member (Sofia Miller from
 * 00-workspace.seed.ts; falls back to the owner member). Every write is
 * an idempotent existence check so `npm run seed:dev` is safe to re-run.
 */

type DemoClient = {
  privateNotes: string[];
  generalNotes: string[];
  coachTasks: string[];
};

/** Verbatim canvas demo values, keyed by the canvas client id. */
const DEMO: Record<string, DemoClient> = {
  "client-001": {
    privateNotes: ["Review split-squat setup before increasing load."],
    generalNotes: ["Prefers morning training."],
    coachTasks: ["Prepare feedback video"],
  },
  "client-002": {
    privateNotes: ["Check whether late shifts are affecting meal timing."],
    generalNotes: [
      "Competition date is November 14; prefers concise check-in feedback.",
    ],
    coachTasks: ["Review missed check-in and adjust prep plan"],
  },
  "client-003": {
    privateNotes: ["Maintenance phase is going smoothly; keep changes small."],
    generalNotes: ["Enjoys trying new vegetarian lunches."],
    coachTasks: [],
  },
  "client-004": {
    privateNotes: ["Right shoulder elevation appears when fatigue sets in."],
    generalNotes: ["Prefers barbell work; usually trains after work."],
    coachTasks: ["Check deadlift setup video"],
  },
  "client-005": {
    privateNotes: [
      "Upcoming work trip; focus on flexible choices over exact tracking.",
    ],
    generalNotes: [
      "Checks in on Mondays; has access to a hotel gym next week.",
    ],
    coachTasks: ["Send travel meal framework"],
  },
  "client-006": {
    privateNotes: [
      "Three unread messages likely relate to show-week schedule; check before routine review.",
    ],
    generalNotes: ["Preparing for a local physique show; Saturday check-in."],
    coachTasks: [],
  },
  "client-007": {
    privateNotes: [
      "Build lower body strength with a gradual return to heavier hinges.",
    ],
    generalNotes: ["Enjoys weekend hikes and strength sessions."],
    coachTasks: [],
  },
  "client-008": {
    privateNotes: [
      "Check-in is awaiting coach response; compare photos under similar lighting.",
    ],
    generalNotes: ["Sunday check-in; currently in prep week 5."],
    coachTasks: ["Review check-in photos"],
  },
  "client-009": {
    privateNotes: [
      "Weight is stable; client is ready to practice flexible portions when eating out.",
    ],
    generalNotes: ["Likes going out for dinner with friends on Fridays."],
    coachTasks: [],
  },
  "client-010": {
    privateNotes: [
      "Has not checked in since September 21; lead with a low-pressure message and ask about schedule.",
      "Avoid increasing training volume until routine is re-established.",
    ],
    generalNotes: [
      "Starting a new role; weekday mornings are currently unpredictable.",
    ],
    coachTasks: ["Offer a shorter check-in format"],
  },
  "client-011": {
    privateNotes: [
      "Prep is steady; small scale fluctuation likely reflects travel and sodium.",
    ],
    generalNotes: [
      "Likes to review weekly averages rather than single weigh-ins.",
    ],
    coachTasks: [],
  },
  "client-012": {
    privateNotes: ["Strength block is progressing without missed sessions."],
    generalNotes: ["Prefers Sunday check-ins and short actionable cues."],
    coachTasks: [],
  },
  "client-013": {
    privateNotes: [
      "Check-in mentions stiffness after longer walks; clarify whether it persists during training.",
    ],
    generalNotes: ["Monday check-in; enjoys walking as primary cardio."],
    coachTasks: ["Reply to check-in and review knee note"],
  },
  "client-014": {
    privateNotes: [
      "New client; check that the first two weeks feel manageable before adding targets.",
    ],
    generalNotes: [
      "Recently started coaching; Sunday was the original check-in day.",
    ],
    coachTasks: ["Reach out about onboarding support"],
  },
  "client-015": {
    privateNotes: [
      "Maintenance is stable; review how breakfast change affects afternoon hunger.",
    ],
    generalNotes: [
      "Thursday check-in; prefers German-language resources when available.",
    ],
    coachTasks: [],
  },
};

function canvasClientNames(): Map<string, string> {
  const dataPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../frontend/src/data/mock-data.json",
  );
  const data = JSON.parse(readFileSync(dataPath, "utf8")) as {
    clients?: { id: string; name: string }[];
  };
  const names = new Map(
    (data.clients ?? []).map((client) => [client.id, client.name]),
  );
  if (names.size === 0)
    throw new Error(`no canvas client ids found in ${dataPath}`);
  return names;
}

export default async function seed(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;
  const names = canvasClientNames();

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { slug: "canvas-demo" },
  });
  const author =
    (await prisma.workspaceMember.findFirst({
      where: { workspaceId: workspace.id, role: "COACH", status: "ACTIVE" },
    })) ??
    (await prisma.workspaceMember.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      },
    }));

  let notes = 0;
  let tasks = 0;
  for (const [canvasId, demo] of Object.entries(DEMO)) {
    const name = names.get(canvasId);
    if (!name) throw new Error(`canvas client ${canvasId} has no demo name`);
    const client = await prisma.clientProfile.findFirst({
      where: { workspaceId: workspace.id, name },
      select: { id: true },
    });
    if (!client) continue; // 00-workspace.seed.ts owns profile creation

    for (const [visibility, texts] of [
      ["PRIVATE", demo.privateNotes],
      ["GENERAL", demo.generalNotes],
    ] as const) {
      for (const body of texts) {
        const existing = await prisma.coachNote.findFirst({
          where: {
            workspaceId: workspace.id,
            clientProfileId: client.id,
            visibility,
            body,
          },
          select: { id: true },
        });
        if (existing) continue;
        await prisma.coachNote.create({
          data: {
            workspaceId: workspace.id,
            clientProfileId: client.id,
            visibility,
            body,
            authorMemberId: author.id,
          },
        });
        notes += 1;
      }
    }

    for (const title of demo.coachTasks) {
      const existing = await prisma.coachTask.findFirst({
        where: {
          workspaceId: workspace.id,
          clientProfileId: client.id,
          title,
        },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.coachTask.create({
        data: {
          workspaceId: workspace.id,
          clientProfileId: client.id,
          title,
          createdByMemberId: author.id,
        },
      });
      tasks += 1;
    }
  }
  console.log(
    `[seed] notes+coach tasks: ${notes} note(s), ${tasks} to-do(s) created`,
  );
}
