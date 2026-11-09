import assert from "node:assert/strict";
import { previousTrainingPlans } from "./domain.ts";

const plan = (id, name, startDate) => ({
  id,
  clientId: "c",
  name,
  startDate,
  program: "Week-based",
  weeks: 8,
  overrides: {},
});
const ver = (id, content, activatedAt, archivedOn) => ({
  id,
  content,
  activatedAt,
  ...(archivedOn ? { archivedOn } : {}),
});
const sessions = (n) => ({
  exercises: [],
  name: `s${n}`,
});

// empty history -> []
assert.deepEqual(previousTrainingPlans({ history: [] }), []);

// only revisions of the active plan -> [] (revisions are not previous plans)
{
  const p1 = plan("p1", "Block 1", "2026-09-01");
  const life = {
    active: ver("v3", { ...p1, focus: "rev2" }, "2026-10-20"),
    history: [
      ver("v1", p1, "2026-09-01"),
      ver("v2", { ...p1, focus: "rev1" }, "2026-10-01"),
    ],
  };
  assert.deepEqual(previousTrainingPlans(life), []);
}

// two previous plans, one with 2 revisions + active plan with its own revision
{
  const p1 = plan("p1", "Foundation", "2026-06-01");
  const p2 = plan("p2", "Build", "2026-08-01");
  const p3 = plan("p3", "Peak", "2026-10-01");
  const p2r2 = { ...p2, focus: "v2" };
  const life = {
    active: ver("a2", { ...p3, focus: "rev" }, "2026-10-20"),
    history: [
      ver("a1", p3, "2026-10-10"), // revision of active plan — excluded
      ver("h1", p1, "2026-06-01"),
      ver("h2", p2, "2026-08-01"),
      ver("h3", p2r2, "2026-09-01", "2026-10-09"),
      ver("h0", plan("p0", "Old", "2026-01-01"), "2026-01-01"),
    ],
  };
  const rows = previousTrainingPlans(life);
  assert.equal(rows.length, 3, "three previous plan groups");
  assert.equal(rows[0].plan.focus, "v2", "latest revision is the plan shown");
  assert.equal(rows[0].versions, 2, "Build group has 2 revisions");
  assert.equal(rows[0].startedOn, "2026-08-01");
  assert.equal(
    rows[0].endedOn,
    "2026-10-09",
    "archivedOn wins over replacement date",
  );
  assert.equal(rows[1].plan.id, "p1");
  assert.equal(rows[1].versions, 1);
  assert.equal(
    rows[1].endedOn,
    "2026-08-01",
    "endedOn falls back to the next-newer plan's activation date",
  );
  assert.equal(rows[2].plan.id, "p0");
  assert.equal(rows[2].endedOn, "2026-06-01");
}

// no active plan -> every history group listed
{
  const p1 = plan("p1", "A", "2026-03-01");
  const life = {
    history: [
      ver("h1", p1, "2026-03-01"),
      ver("h2", plan("p2", "B", "2026-05-01"), "2026-05-01"),
    ],
  };
  const rows = previousTrainingPlans(life);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].plan.id, "p2");
  assert.equal(rows[0].endedOn, undefined, "latest group has no replacement");
  assert.equal(rows[1].endedOn, "2026-05-01");
}

// endedOn uses the ACTIVE plan's activation when it replaced the group
{
  const p1 = plan("p1", "Old block", "2026-02-01");
  const life = {
    active: ver("a1", plan("p2", "New", "2026-04-15"), "2026-04-15T09:30:00Z"),
    history: [ver("h1", p1, "2026-02-01")],
  };
  const rows = previousTrainingPlans(life);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endedOn, "2026-04-15");
}

void sessions;
console.log("previousTrainingPlans checks passed");
