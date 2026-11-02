import type { SeedContext } from "./index";
import { serverTodayUtc, shiftDateUtc } from "../../lib/habits/date";
import { DAILY_WEEKDAY_MASK } from "../../lib/habits/frequency";

/**
 * PR-M7 — canvas demo habits seed (HABITS-I1 domain).
 *
 * Mirrors the canvas demo state (`frontend/src/components/coach/model.ts`):
 * every canvas client carries exactly one habit card —
 *   name      "Evening walk"
 *   frequency "Daily"      -> HabitSchedule.weekdays = 127 (all days)
 *   goal      "20 minutes" -> Habit.target
 *   reason    "Create a calm transition into the evening." -> Habit.reason
 *   completed 5            -> five DONE HabitLog rows on the last five days
 *                             before today (today's card stays unchecked,
 *                             like the canvas demo toggle state).
 *
 * The schedule boundary is effective-dated 30 days before the run date so
 * the whole recent window resolves as scheduled. Every write is an
 * idempotent upsert keyed by (habit, date) so `npm run seed:dev` is safe
 * to re-run. Runs after `00-workspace.seed.ts`, which creates the
 * canvas-demo workspace and client profiles.
 */

const WORKSPACE_SLUG = "canvas-demo";
const HABIT_NAME = "Evening walk";
const HABIT_TARGET = "20 minutes";
const HABIT_REASON = "Create a calm transition into the evening.";
const SCHEDULE_OFFSET_DAYS = -30;
const COMPLETION_DAYS = 5;

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export default async function seed(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;

  const workspace = await prisma.workspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true },
  });
  if (!workspace) {
    console.log(`[seed] 32-habits: workspace ${WORKSPACE_SLUG} missing, skip`);
    return;
  }
  const clients = await prisma.clientProfile.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (clients.length === 0) {
    console.log("[seed] 32-habits: no client profiles, skip");
    return;
  }

  const today = serverTodayUtc();
  const effectiveFrom = utcDate(shiftDateUtc(today, SCHEDULE_OFFSET_DAYS));
  const logDates = Array.from({ length: COMPLETION_DAYS }, (_, i) =>
    utcDate(shiftDateUtc(today, -(COMPLETION_DAYS - i))),
  );

  let habitsCreated = 0;
  let logsWritten = 0;
  for (const client of clients) {
    const existing = await prisma.habit.findFirst({
      where: {
        workspaceId: workspace.id,
        clientProfileId: client.id,
        name: HABIT_NAME,
      },
      select: { id: true },
    });
    const habit = existing
      ? await prisma.habit.update({
          where: { id: existing.id },
          data: { target: HABIT_TARGET, reason: HABIT_REASON },
          select: { id: true },
        })
      : await prisma.habit.create({
          data: {
            workspaceId: workspace.id,
            clientProfileId: client.id,
            name: HABIT_NAME,
            target: HABIT_TARGET,
            reason: HABIT_REASON,
          },
          select: { id: true },
        });
    if (!existing) habitsCreated += 1;

    const schedule = await prisma.habitSchedule.findFirst({
      where: { habitId: habit.id },
      select: { id: true },
    });
    if (!schedule)
      await prisma.habitSchedule.create({
        data: {
          habitId: habit.id,
          effectiveFrom,
          weekdays: DAILY_WEEKDAY_MASK,
        },
      });

    for (const date of logDates) {
      const written = await prisma.habitLog.upsert({
        where: { habitId_date: { habitId: habit.id, date } },
        update: { status: "DONE" },
        create: { habitId: habit.id, date, status: "DONE" },
        select: { id: true },
      });
      if (written) logsWritten += 1;
    }
  }

  console.log(
    `[seed] 32-habits: ${clients.length} client(s), ` +
      `${habitsCreated} habit(s) created, ${logsWritten} log row(s) upserted`,
  );
}
