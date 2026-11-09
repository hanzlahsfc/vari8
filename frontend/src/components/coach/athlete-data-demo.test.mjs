import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nutritionDayTargets,
  weekNutritionBreakdown,
} from "./athlete/nutrition-week.ts";
import {
  ATHLETE_DATA_DEMO_REVISION,
  adoptAthleteDataDemo,
  demoMacroTotals,
} from "./athlete-data-demo.ts";
import { isCoachState, seedState } from "./model.ts";
import { addLocalDays } from "./targets/model.ts";
import {
  dayTypeNutrients,
  dayTypeOptions,
  loggedDayType,
  prescribedDayType,
} from "./tracking/nutrition-day.ts";

const TODAY = "2026-11-02";
const PREV_MONDAY = "2026-10-26";
const CURRENT_MONDAY = "2026-11-02";
const CLIENT_ID = "client-007";

const clientOf = (state) =>
  state.clients.find((client) => client.id === CLIENT_ID);

/** Planned totals for the day type the client logged (falls back to plan). */
const loggedMacroTotals = (client, date) => {
  const nutrients = dayTypeNutrients(client, date, loggedDayType(client, date));
  return nutrients
    ? {
        calories: nutrients.kcal,
        protein: nutrients.protein,
        carbs: nutrients.carbs,
        fat: nutrients.fat,
      }
    : demoMacroTotals(client, date);
};

const weekOf = (monday) => ({
  monday,
  sunday: addLocalDays(monday, 6),
  days: Array.from({ length: 7 }, (_, i) => addLocalDays(monday, i)),
});

const weekdayOf = (date) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Seed state with the data-demo artifacts stripped so adoption recreates
 * them (the demo flag is reset, and the demo refeed event is restored as a
 * plain tag so the conversion path is exercised).
 */
function baseWithoutDataDemo() {
  const seeded = seedState(TODAY);
  const clients = seeded.clients.map((client) => {
    if (client.id !== CLIENT_ID) return client;
    const plans = client.plans
      ? {
          ...client.plans,
          nutrition: {
            ...client.plans.nutrition,
            temporary: (client.plans.nutrition.temporary ?? []).filter(
              (t) => t.id !== "demo-temp-refeed",
            ),
          },
          training: client.plans.training.active
            ? {
                ...client.plans.training,
                active: {
                  ...client.plans.training.active,
                  content: {
                    ...client.plans.training.active.content,
                    focus: undefined,
                  },
                },
              }
            : client.plans.training,
        }
      : client.plans;
    return {
      ...client,
      plans,
      tracking: undefined,
      weekNotes: undefined,
      coachTasks: client.coachTasks.filter(
        (task) => task.id !== "demo-task-review-checkin",
      ),
      internalNotes: client.internalNotes.filter((note) => !note.pinned),
      timelineEvents: [
        ...(client.timelineEvents ?? []),
        {
          id: "demo-refeed-upcoming",
          kind: "refeed",
          startDate: addLocalDays(TODAY, 9),
          endDate: addLocalDays(TODAY, 9),
          note: "Keep sodium consistent.",
        },
      ],
    };
  });
  const submissions = seeded.submissions
    .filter(
      (s) => s.id !== "demo-submission-first" && s.id !== "demo-submission-mid",
    )
    .map((s) =>
      s.id === "demo-submission-week" || s.id === "demo-submission-latest"
        ? { ...s, photos: undefined, response: undefined }
        : s,
    );
  return {
    ...seeded,
    demoSeeds: { ...seeded.demoSeeds, athleteDataDemo: undefined },
    clients,
    submissions,
  };
}

test("adoptAthleteDataDemo seeds a complete previous week and only Monday this week", () => {
  const state = adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY);
  assert.equal(state.demoSeeds?.athleteDataDemo, ATHLETE_DATA_DEMO_REVISION);
  const amara = clientOf(state);

  // Persisted tracking: ~10 weeks of history plus today.
  assert.ok(amara.tracking);
  const entries = amara.tracking.entries;
  assert.ok(entries.length >= 60 && entries.length <= 71);
  assert.equal(entries.at(-1).date, TODAY);

  // Previous week: all seven days, with the full prep-week fields.
  const previousWeek = weekOf(PREV_MONDAY);
  for (const date of previousWeek.days) {
    const entry = entries.find((candidate) => candidate.date === date);
    assert.ok(entry, `${date} is tracked`);
    for (const key of [
      "weight",
      "calories",
      "protein",
      "carbs",
      "fat",
      "steps",
      "sleep",
      "water",
      "hunger",
      "stress",
    ])
      assert.notEqual(entry.values[key], null, `${date} ${key}`);
    assert.ok(
      amara.tracking.text[`${date}:daily-note`]?.trim(),
      `${date} has a daily note`,
    );
    const cardioDay = [0, 2, 5].includes(weekdayOf(date)); // Mon/Wed/Sat
    assert.equal(
      entry.values["cardio-duration"] != null,
      cardioDay,
      `${date} cardio ${cardioDay ? "present" : "absent"}`,
    );
  }
  // The previous week has no missing days inside it.
  const previousGaps = previousWeek.days.filter(
    (date) => !entries.some((entry) => entry.date === date),
  );
  assert.deepEqual(previousGaps, []);
  // Realistic misses exist without breaking adherence.
  const ratios = previousWeek.days.flatMap((date) => {
    const entry = entries.find((candidate) => candidate.date === date);
    const totals = loggedMacroTotals(amara, date);
    return ["calories", "protein", "carbs", "fat"]
      .filter((macro) => entry?.values[macro] != null && totals?.[macro])
      .map((macro) => entry.values[macro] / totals[macro]);
  });
  assert.ok(
    ratios.some((ratio) => ratio >= 0.85 && ratio <= 0.95),
    "a real under-target day",
  );
  assert.ok(
    ratios.some((ratio) => ratio >= 1.05 && ratio <= 1.12),
    "a real over-target day",
  );
  assert.ok(ratios.every((ratio) => ratio >= 0.85 && ratio <= 1.12));

  // Current week: Monday only. Tue–Sun are future and never invented.
  const currentWeek = weekOf(CURRENT_MONDAY);
  const currentEntries = entries.filter((entry) =>
    currentWeek.days.includes(entry.date),
  );
  assert.deepEqual(
    currentEntries.map((entry) => entry.date),
    [TODAY],
  );
  const todayEntry = currentEntries[0];
  for (const key of ["weight", "calories", "protein", "carbs", "fat", "steps"])
    assert.notEqual(todayEntry.values[key], null, `today ${key}`);
  assert.ok(amara.tracking.text[`${TODAY}:daily-note`]);
  assert.ok(amara.tracking.text[`${TODAY}:coach-note`]);

  // Both weeks keep the High/Medium/Low 2/2/3 cycle, so the weighted average
  // differs from a simple mean of the three variants.
  for (const monday of [PREV_MONDAY, CURRENT_MONDAY]) {
    const week = weekOf(monday);
    const breakdown = weekNutritionBreakdown(amara, week);
    assert.equal(breakdown.plannedDays, 7, `${monday} has 7 planned days`);
    const counts = Object.fromEntries(
      breakdown.variants.map((variant) => [variant.label, variant.days]),
    );
    assert.deepEqual(counts, { High: 2, Medium: 2, Low: 3 });
    assert.deepEqual(
      nutritionDayTargets(amara, week).map((day) => day.label),
      ["High", "Medium", "Low", "High", "Low", "Medium", "Low"],
    );
    const simpleMean =
      breakdown.variants.reduce(
        (sum, variant) => sum + variant.nutrients.calories,
        0,
      ) / breakdown.variants.length;
    assert.ok(
      Math.abs(breakdown.average.calories - simpleMean) > 1,
      `${monday} weighted average differs from the simple mean`,
    );
  }

  // The editor opens the draft. The demo-owned starter draft must carry the
  // same High/Medium/Low options as the active plan, not a stale one-variant
  // "TD" starter.
  const mealLifecycle = amara.plans.nutrition.mealPlan;
  assert.ok(mealLifecycle.draft);
  assert.deepEqual(
    mealLifecycle.draft.variants.map((v) => v.label),
    ["High", "Medium", "Low"],
  );
  assert.deepEqual(
    mealLifecycle.draft.variants.map((v) => v.id),
    mealLifecycle.active.content.variants.map((v) => v.id),
  );

  // The temporary refeed sits outside both demo weeks.
  const temp = (amara.plans.nutrition.temporary ?? []).find(
    (t) => t.id === "demo-temp-refeed",
  );
  assert.ok(temp);
  assert.equal(temp.kind, "refeed");
  assert.ok(temp.startDate > currentWeek.sunday);
  assert.ok(
    !(amara.timelineEvents ?? []).some((e) => e.id === "demo-refeed-upcoming"),
  );
  const kinds = (amara.timelineEvents ?? []).map((e) => e.kind);
  assert.ok(kinds.includes("deload"));
  assert.ok(kinds.includes("diet-break"));

  // Pinned notes, training focus and the current-week coach note/task.
  assert.ok(amara.internalNotes.some((n) => n.pinned && /quad/i.test(n.text)));
  assert.ok(amara.internalNotes.filter((n) => n.pinned).length >= 2);
  assert.equal(
    amara.plans.training.active?.content.focus,
    "Hypertrophy · lower-body priority",
  );
  assert.match(amara.weekNotes[CURRENT_MONDAY], /Monday session/i);
  const task = amara.coachTasks.find(
    (candidate) => candidate.id === "demo-task-review-checkin",
  );
  assert.ok(task);
  assert.ok(task.deadline >= TODAY);
  assert.equal(task.complete, false);

  // Check-ins: the previous week is submitted on its scheduled Sunday and
  // reviewed with photos; the current week is only a scheduled due date.
  const previousCheckIn = state.submissions.find(
    (s) => s.clientId === CLIENT_ID && s.date === addLocalDays(TODAY, -1),
  );
  assert.ok(previousCheckIn);
  assert.equal(previousCheckIn.id, "demo-submission-week");
  assert.equal(previousCheckIn.photos.length, 4);
  assert.ok(previousCheckIn.response);
  const upcoming = state.submissions.filter(
    (s) => s.clientId === CLIENT_ID && s.date > TODAY,
  );
  assert.deepEqual(upcoming, []);
  const previousPending = state.submissions.filter(
    (s) =>
      s.clientId === CLIENT_ID &&
      s.date >= PREV_MONDAY &&
      s.date <= currentWeek.sunday &&
      !s.response,
  );
  assert.deepEqual(previousPending, []);

  // Four photo check-ins remain for the physique comparison.
  const photoSubs = state.submissions.filter(
    (s) => s.clientId === CLIENT_ID && s.photos?.length === 4,
  );
  assert.equal(photoSubs.length, 4);
  assert.ok(
    photoSubs.every((s) =>
      s.photos.every((p) => p.src.startsWith("/demo/physique/")),
    ),
  );

  // The photo question carries the pose options.
  const variant = amara.assignment.snapshot.variants.find(
    (v) => v.id === amara.assignment.variantId,
  );
  const photoQ = variant.questions.find(
    (q) => q.type === "Visual upload" && /photo/i.test(q.label),
  );
  assert.match(photoQ.options, /Front relaxed/);

  assert.ok(isCoachState(state));
});

test("training logs cover the previous week and today, and no later session", () => {
  const state = adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY);
  const amara = clientOf(state);
  const logs = (state.trainingLogs ?? []).filter(
    (log) => log.clientId === CLIENT_ID,
  );
  const byDate = Object.fromEntries(
    logs.map((log) => [log.scheduledDate, log]),
  );
  for (const date of ["2026-10-26", "2026-10-27", "2026-10-29", "2026-10-31"])
    assert.equal(byDate[date]?.status, "finished", `${date} is logged`);
  assert.equal(byDate[TODAY]?.status, "finished", "today is logged");
  assert.ok(byDate[TODAY]?.finishedAt);
  for (const date of [
    "2026-11-03",
    "2026-11-04",
    "2026-11-05",
    "2026-11-06",
    "2026-11-07",
    "2026-11-08",
  ])
    assert.equal(byDate[date], undefined, `${date} stays unlogged`);
  const todayLog = byDate[TODAY];
  assert.equal(todayLog.sessionId, "amara-lower-a");
  assert.ok(
    todayLog.exercises.every((exercise) =>
      exercise.sets.every((set) => set.done),
    ),
    "today's lower session is fully logged",
  );
  assert.ok(
    todayLog.exercises.every((exercise) =>
      exercise.sets.every((set) => set.rir != null),
    ),
    "RIR is recorded on every set",
  );
  assert.ok(amara.plans.training.active);
});

test("adopted tracking is deterministic and tracks the planned macros", () => {
  const first = clientOf(adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY));
  const second = clientOf(adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY));
  assert.deepEqual(first.tracking, second.tracking);

  const entries = first.tracking.entries;
  let valued = 0;
  let within = 0;
  for (const entry of entries) {
    const totals = loggedMacroTotals(first, entry.date);
    if (!totals) continue;
    for (const macro of ["calories", "protein", "carbs", "fat"]) {
      const value = entry.values[macro];
      const target = totals[macro];
      if (value == null || !target) continue;
      valued += 1;
      const ratio = (value / target) * 100;
      if (ratio >= 85 && ratio <= 110) within += 1;
    }
  }
  assert.ok(valued > 100);
  assert.ok(
    within / valued >= 0.9,
    `adherence inside 85–110 % on ${within}/${valued}`,
  );
});

const overrideEntriesOf = (client) =>
  Object.entries(client.tracking.text).filter(([key, value]) => {
    if (!key.endsWith(":day-type") || !value) return false;
    const date = key.slice(0, -":day-type".length);
    return value !== prescribedDayType(client, date);
  });

test("the demo logs exactly three day-type overrides with coherent macros", () => {
  const state = adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY);
  const amara = clientOf(state);
  const overrides = overrideEntriesOf(amara);
  assert.equal(overrides.length, 3);
  const temp = (amara.plans.nutrition.temporary ?? []).find(
    (t) => t.id === "demo-temp-refeed",
  );
  for (const [key, label] of overrides) {
    const date = key.slice(0, -":day-type".length);
    assert.notEqual(label, prescribedDayType(amara, date));
    assert.ok(
      amara.tracking.entries.some((entry) => entry.date === date),
      `${date} has a logged entry`,
    );
    assert.ok(
      !(temp && date >= temp.startDate && date <= temp.endDate),
      `${date} is not a refeed day`,
    );
    const logged = dayTypeNutrients(amara, date, label);
    assert.ok(logged, `${date} resolves the logged variant`);
    const entry = amara.tracking.entries.find(
      (candidate) => candidate.date === date,
    );
    for (const macro of ["protein", "carbs", "fat"]) {
      const ratio = entry.values[macro] / logged[macro];
      assert.ok(
        ratio >= 0.85 && ratio <= 1.12,
        `${date} ${macro} follows the logged variant (${ratio.toFixed(2)})`,
      );
    }
    const prescribed = demoMacroTotals(amara, date);
    const carbsRatio = entry.values.carbs / prescribed.carbs;
    assert.ok(
      carbsRatio < 0.85 || carbsRatio > 1.12,
      `${date} carbs do not follow the prescribed variant`,
    );
  }
});

test("a coach-saved day-type value survives the revision bump and re-seed", () => {
  const once = adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY);
  const [key, demoLabel] = overrideEntriesOf(clientOf(once))[0];
  const date = key.slice(0, -":day-type".length);
  const coachLabel = dayTypeOptions(clientOf(once), date)
    .map((option) => option.label)
    .find(
      (label) =>
        label !== demoLabel &&
        label !== prescribedDayType(clientOf(once), date),
    );
  assert.ok(coachLabel);

  const old = structuredClone(once);
  old.demoSeeds = { ...old.demoSeeds, athleteDataDemo: 22 };
  clientOf(old).tracking.text[key] = coachLabel;

  const bumped = adoptAthleteDataDemo(old, TODAY);
  const kept = clientOf(bumped);
  assert.equal(kept.tracking.text[key], coachLabel);
  assert.equal(overrideEntriesOf(kept).length, 3);
  // Re-seeding is a no-op, so the override set stays stable.
  assert.deepEqual(adoptAthleteDataDemo(bumped, TODAY), bumped);
});

test("second adoption is a no-op and a revision bump keeps coach-made data", () => {
  const once = adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY);
  const twice = adoptAthleteDataDemo(once, TODAY);
  assert.deepEqual(twice, once);

  // Simulate a browser saved with the previous demo revision and a coach row
  // on a date the demo does not own.
  const old = structuredClone(once);
  old.demoSeeds = { ...old.demoSeeds, athleteDataDemo: 20 };
  const amara = clientOf(old);
  amara.tracking.entries = [
    { date: "2026-06-01", values: { weight: 99 } },
    ...amara.tracking.entries,
  ];
  amara.tracking.text["2026-06-01:daily-note"] = "Coach wrote this.";
  const existingTemp = amara.plans.nutrition.temporary.find(
    (t) => t.id === "demo-temp-refeed",
  );
  existingTemp.startDate = addLocalDays(TODAY, 2);
  existingTemp.endDate = addLocalDays(TODAY, 3);

  const bumped = adoptAthleteDataDemo(old, TODAY);
  const kept = clientOf(bumped);
  assert.equal(bumped.demoSeeds?.athleteDataDemo, ATHLETE_DATA_DEMO_REVISION);
  const coachRow = kept.tracking.entries.find(
    (entry) => entry.date === "2026-06-01",
  );
  assert.equal(coachRow.values.weight, 99);
  assert.equal(
    kept.tracking.text["2026-06-01:daily-note"],
    "Coach wrote this.",
  );
  // Demo-owned days are re-derived, so the previous week is complete again.
  for (const date of weekOf(PREV_MONDAY).days)
    assert.ok(kept.tracking.entries.some((entry) => entry.date === date));
  assert.ok(
    kept.plans.nutrition.temporary.find((t) => t.id === "demo-temp-refeed")
      .startDate > weekOf(CURRENT_MONDAY).sunday,
  );
  // Re-running the new revision is still a no-op.
  assert.deepEqual(adoptAthleteDataDemo(bumped, TODAY), bumped);
});

test("revision bump repairs the legacy demo TD draft, not a coach draft", () => {
  const state = adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY);
  const activePlan = clientOf(state).plans.nutrition.mealPlan.active.content;

  const withStaleDraft = structuredClone(state);
  withStaleDraft.demoSeeds = {
    ...withStaleDraft.demoSeeds,
    athleteDataDemo: 21,
  };
  const staleLife = clientOf(withStaleDraft).plans.nutrition.mealPlan;
  staleLife.draft = {
    ...structuredClone(activePlan),
    name: "Amara · prep nutrition",
    variants: [{ id: "legacy-td", label: "TD", meals: [] }],
    activeVariantId: "legacy-td",
  };
  const repaired = clientOf(adoptAthleteDataDemo(withStaleDraft, TODAY));
  assert.deepEqual(
    repaired.plans.nutrition.mealPlan.draft.variants.map(
      (variant) => variant.label,
    ),
    ["High", "Medium", "Low"],
  );

  const withCoachDraft = structuredClone(state);
  withCoachDraft.demoSeeds = {
    ...withCoachDraft.demoSeeds,
    athleteDataDemo: 21,
  };
  const coachLife = clientOf(withCoachDraft).plans.nutrition.mealPlan;
  coachLife.draft = {
    ...structuredClone(activePlan),
    name: "Coach's own draft",
  };
  const kept = clientOf(adoptAthleteDataDemo(withCoachDraft, TODAY));
  assert.equal(kept.plans.nutrition.mealPlan.draft.name, "Coach's own draft");
});

test("other clients are untouched", () => {
  const base = baseWithoutDataDemo();
  const state = adoptAthleteDataDemo(base, TODAY);
  for (const client of state.clients)
    if (client.id !== CLIENT_ID)
      assert.deepEqual(
        client,
        base.clients.find((c) => c.id === client.id),
      );
});
