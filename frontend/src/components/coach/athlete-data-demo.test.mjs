import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ATHLETE_DATA_DEMO_REVISION,
  adoptAthleteDataDemo,
  demoMacroTotals,
} from "./athlete-data-demo.ts";
import { isCoachState, seedState } from "./model.ts";
import { addLocalDays } from "./targets/model.ts";

const TODAY = "2026-10-24";

const clientOf = (state) =>
  state.clients.find((client) => client.id === "client-007");

/**
 * Seed state with the data-demo artifacts stripped so adoption recreates
 * them (the demo flag is reset, and the demo refeed event is restored as a
 * plain tag so the conversion path is exercised).
 */
function baseWithoutDataDemo() {
  const seeded = seedState();
  const clients = seeded.clients.map((client) => {
    if (client.id !== "client-007") return client;
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
      internalNotes: client.internalNotes.filter((note) => !note.pinned),
      timelineEvents: [
        ...(client.timelineEvents ?? []),
        {
          id: "demo-refeed-upcoming",
          kind: "refeed",
          startDate: addLocalDays(TODAY, 2),
          endDate: addLocalDays(TODAY, 2),
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
        ? { ...s, photos: undefined }
        : s,
    );
  return {
    ...seeded,
    demoSeeds: { ...seeded.demoSeeds, athleteDataDemo: undefined },
    clients,
    submissions,
  };
}

test("adoptAthleteDataDemo seeds tracking, temp plan, notes, focus, photos and sets the flag", () => {
  const state = adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY);
  assert.equal(state.demoSeeds?.athleteDataDemo, ATHLETE_DATA_DEMO_REVISION);
  const amara = clientOf(state);

  // Persisted tracking: ~10 weeks ending yesterday.
  assert.ok(amara.tracking);
  const entries = amara.tracking.entries;
  assert.ok(entries.length >= 60 && entries.length <= 70);
  assert.equal(entries.at(-1).date, addLocalDays(TODAY, -1));
  const dates = new Set(entries.map((e) => e.date));
  assert.ok(dates.size >= 60);
  // Roughly five missing days inside the window.
  assert.ok(70 - dates.size >= 3 && 70 - dates.size <= 8);
  // One day is missing a macro (fat).
  const fatDays = entries.filter((e) => e.values.fat == null).length;
  assert.equal(fatDays, 1);

  // Temporary refeed replaces the demo refeed event for the next two days.
  const temp = (amara.plans.nutrition.temporary ?? []).find(
    (t) => t.id === "demo-temp-refeed",
  );
  assert.ok(temp);
  assert.equal(temp.kind, "refeed");
  assert.equal(temp.label, "Refeed");
  assert.equal(temp.startDate, addLocalDays(TODAY, 2));
  assert.equal(temp.endDate, addLocalDays(TODAY, 3));
  assert.ok(
    !(amara.timelineEvents ?? []).some((e) => e.id === "demo-refeed-upcoming"),
  );
  // Deload / diet-break stay as plain tags.
  const kinds = (amara.timelineEvents ?? []).map((e) => e.kind);
  assert.ok(kinds.includes("deload"));
  assert.ok(kinds.includes("diet-break"));

  // Pinned notes + training focus.
  assert.ok(amara.internalNotes.some((n) => n.pinned && /quad/i.test(n.text)));
  assert.ok(amara.internalNotes.filter((n) => n.pinned).length >= 2);
  assert.equal(
    amara.plans.training.active?.content.focus,
    "Hypertrophy · lower-body priority",
  );

  // Four photo check-ins; the latest stays awaiting feedback.
  const photoSubs = state.submissions.filter(
    (s) => s.clientId === amara.id && s.photos?.length === 4,
  );
  assert.ok(photoSubs.length >= 4);
  const latest = state.submissions.find(
    (s) => s.id === "demo-submission-latest",
  );
  assert.equal(latest.response, undefined);
  assert.ok(latest.photos.length === 4);
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

test("adopted tracking is deterministic and tracks the planned macros", () => {
  const first = clientOf(adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY));
  const second = clientOf(adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY));
  assert.deepEqual(first.tracking, second.tracking);

  const entries = first.tracking.entries;
  let valued = 0;
  let within = 0;
  for (const entry of entries) {
    const totals = demoMacroTotals(first, entry.date);
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

test("second adoption is a no-op and coach-made data survives", () => {
  const once = adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY);
  const twice = adoptAthleteDataDemo(once, TODAY);
  assert.deepEqual(twice, once);

  const coachTracked = {
    ...baseWithoutDataDemo(),
    clients: baseWithoutDataDemo().clients.map((c) =>
      c.id === "client-007"
        ? {
            ...c,
            tracking: {
              // A coach-logged entry on a non-demo date must never be touched.
              entries: [{ date: "2026-06-01", values: { weight: 99 } }],
              text: {},
            },
          }
        : c,
    ),
  };
  const kept = clientOf(adoptAthleteDataDemo(coachTracked, TODAY));
  assert.equal(kept.tracking.entries.length, 1);
  assert.equal(kept.tracking.entries[0].values.weight, 99);
});

test("other clients are untouched", () => {
  const base = baseWithoutDataDemo();
  const state = adoptAthleteDataDemo(base, TODAY);
  for (const client of state.clients)
    if (client.id !== "client-007")
      assert.deepEqual(
        client,
        base.clients.find((c) => c.id === client.id),
      );
});

test("revision adoption on a used workspace leaves note collections untouched", () => {
  // First adoption seeds the sample notes…
  const fresh = adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY);
  const seeded = clientOf(fresh);
  assert.ok(seeded.internalNotes.some((n) => n.id === "demo-pinned-note-1"));
  assert.ok(fresh.coachNotes.some((n) => n.id === "demo-coach-note-peak-week"));

  // …then the coach edits, deletes, moves and pins on that workspace,
  // which is still sitting on an earlier revision.
  const used = {
    ...fresh,
    demoSeeds: { ...fresh.demoSeeds, athleteDataDemo: 12 },
    coachNotes: [
      // The coach deleted the seeded general note and wrote their own.
      { id: "coach-own-1", text: "Coach-written general note" },
    ],
    clients: fresh.clients.map((c) =>
      c.id === "client-007"
        ? {
            ...c,
            internalNotes: [
              // Edited demo-owned text, unpinned by the coach.
              { id: "demo-pinned-note-1", text: "Edited by coach" },
              { id: "amara-note-1", text: "Coach note", pinned: true },
              // demo-pinned-note-2 was deleted — it must not return.
            ],
          }
        : c,
    ),
  };
  const adopted = adoptAthleteDataDemo(used, TODAY);
  const adoptedAmara = clientOf(adopted);
  assert.deepEqual(
    adoptedAmara.internalNotes,
    used.clients.find((c) => c.id === "client-007").internalNotes,
    "athlete notes are stored verbatim — no re-seed, no text dedup",
  );
  assert.deepEqual(
    adopted.coachNotes,
    used.coachNotes,
    "general notes are stored verbatim",
  );
  assert.equal(
    adoptedAmara.internalNotes.some((n) => n.id === "demo-pinned-note-2"),
    false,
    "a deleted demo note is not resurrected",
  );
  // Coach tasks survive revision adoption verbatim too.
  const withTask = {
    ...used,
    clients: used.clients.map((c) =>
      c.id === "client-007"
        ? {
            ...c,
            coachTasks: [
              { id: "coach-task-1", title: "Coach task", complete: false },
            ],
          }
        : c,
    ),
  };
  const adopted2 = clientOf(adoptAthleteDataDemo(withTask, TODAY));
  assert.ok(
    adopted2.coachTasks.some((t) => t.id === "coach-task-1"),
    "coach-written tasks survive adoption",
  );

  // Repeated adoption is a no-op once the revision flag is set.
  const again = adoptAthleteDataDemo(adopted, TODAY);
  assert.equal(again, adopted, "repeated reloads do not touch data");
});
