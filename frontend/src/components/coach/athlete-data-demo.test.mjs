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
  const state = adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY, {
    seedSamples: true,
  });
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
  const once = adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY, {
    seedSamples: true,
  });
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

test("fresh demo builds still seed the sample notes and tasks", () => {
  const fresh = adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY, {
    seedSamples: true,
  });
  const amara = clientOf(fresh);
  for (const id of [
    "demo-task-review-checkin",
    "demo-task-refeed",
    "demo-task-macros",
  ])
    assert.ok(
      amara.coachTasks.some((t) => t.id === id),
      id,
    );
  for (const id of [
    "demo-task-posing",
    "demo-task-bloodwork",
    "demo-task-triage",
    "demo-task-hotel",
    "demo-task-roundup",
  ])
    assert.ok(
      fresh.coachTodos.some((t) => t.id === id),
      id,
    );
  assert.ok(amara.internalNotes.some((n) => n.id === "demo-pinned-note-1"));
  assert.ok(fresh.coachNotes.some((n) => n.id === "demo-coach-note-peak-week"));
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
  const fresh = adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY, {
    seedSamples: true,
  });
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

test("revision adoption preserves edited, moved and deleted demo tasks verbatim", () => {
  // A workspace genuinely seeded by a fresh build…
  const fresh = adoptAthleteDataDemo(baseWithoutDataDemo(), TODAY, {
    seedSamples: true,
  });
  // …used by the coach — demo tasks edited, completed, deleted and
  // reordered, a coach-written task added — while still on revision 12.
  const amaraTasks = [
    // Edited demo task: new title, completed, deadline moved.
    {
      id: "demo-task-review-checkin",
      title: "Renamed by coach",
      complete: true,
      completedAt: "2026-10-20T09:00:00",
      deadline: "2026-11-01",
      priority: "low",
      repeat: { unit: "week", interval: 2, weekdays: [0] },
      reminderAt: "2026-10-31T08:00:00",
      createdAt: "2026-10-18T09:00:00",
    },
    // Coach-written task.
    { id: "coach-task-1", title: "Coach task", complete: false },
    // demo-task-refeed deleted, demo-task-macros deleted — they must
    // not return.
  ];
  const todos = [
    { id: "coach-todo-1", title: "Coach todo", complete: false },
    // Edited demo todo: moved deadline, completed, reminder kept.
    {
      id: "demo-task-posing",
      title: "Posing video — edited",
      complete: true,
      completedAt: "2026-10-21T12:00:00",
      deadline: "2026-10-30",
      clientId: "client-014",
      reminderAt: "2026-10-29T08:00:00",
      createdAt: "2026-10-20T09:00:00",
    },
    // demo-task-bloodwork/-triage/-hotel/-roundup deleted.
  ];
  const used = {
    ...fresh,
    demoSeeds: { ...fresh.demoSeeds, athleteDataDemo: 12 },
    coachTodos: todos,
    clients: fresh.clients.map((c) =>
      c.id === "client-007" ? { ...c, coachTasks: amaraTasks } : c,
    ),
  };
  const adopted = adoptAthleteDataDemo(used, TODAY);
  assert.deepEqual(
    clientOf(adopted).coachTasks,
    amaraTasks,
    "athlete task collection stored verbatim — edits, moves and deletions kept",
  );
  assert.deepEqual(
    adopted.coachTodos,
    todos,
    "workspace task collection stored verbatim",
  );
  assert.equal(
    clientOf(adopted).coachTasks.some((t) => t.id === "demo-task-refeed"),
    false,
    "a deleted demo task is not resurrected",
  );
  // A second load is a no-op — nothing is reintroduced.
  const again = adoptAthleteDataDemo(adopted, TODAY);
  assert.equal(again, adopted, "repeated reloads do not touch tasks");
});

test("an unmarked saved workspace is not treated as a fresh demo", () => {
  // Saved before the revision marker existed: athleteDataDemo is
  // undefined but the workspace is used, so load-time adoption must not
  // inject sample notes or tasks.
  const unmarked = {
    ...baseWithoutDataDemo(),
    coachTodos: [{ id: "coach-todo-1", title: "Mine", complete: false }],
    coachNotes: [{ id: "coach-own-1", text: "My note" }],
    clients: baseWithoutDataDemo().clients.map((c) =>
      c.id === "client-007"
        ? {
            ...c,
            internalNotes: [{ id: "amara-note-1", text: "Coach note" }],
            coachTasks: [
              { id: "coach-task-1", title: "Mine", complete: false },
            ],
          }
        : c,
    ),
  };
  const adopted = adoptAthleteDataDemo(unmarked, TODAY);
  const amara = clientOf(adopted);
  assert.deepEqual(
    amara.internalNotes,
    unmarked.clients.find((c) => c.id === "client-007").internalNotes,
  );
  assert.deepEqual(amara.coachTasks, [
    { id: "coach-task-1", title: "Mine", complete: false },
  ]);
  assert.deepEqual(adopted.coachTodos, unmarked.coachTodos);
  assert.deepEqual(adopted.coachNotes, unmarked.coachNotes);
  assert.equal(
    adopted.coachTodos.some((t) => t.id.startsWith("demo-task-")),
    false,
    "no sample tasks injected on load",
  );
  assert.equal(
    amara.internalNotes.some((n) => n.id.startsWith("demo-pinned-note")),
    false,
    "no sample notes injected on load",
  );
});
