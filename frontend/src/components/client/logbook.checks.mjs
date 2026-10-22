import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { finishSession, resumeIndex, startSession } from "./logbook-model.ts";

const prescription = {
  version: 1,
  session: {
    id: "sess",
    name: "Session A",
    exercises: [
      {
        id: "ex-1",
        name: "Back squat",
        instructions: "",
        progression: "",
        sets: [
          {
            id: "s1",
            reps: 5,
            tempo: "3010",
            type: "Work",
            rest: "3:00",
            instructions: "",
          },
          {
            id: "s2",
            reps: 5,
            tempo: "3010",
            type: "Work",
            rest: "3:00",
            instructions: "",
          },
          {
            id: "s3",
            reps: 8,
            tempo: "2010",
            type: "Work",
            rest: "2:00",
            instructions: "",
          },
        ],
      },
    ],
  },
};

describe("logbook model", () => {
  it("startSession creates an in-progress log with null set values", () => {
    const state = startSession({ sessions: [] }, "plan-1", prescription);
    assert.equal(state.sessions.length, 1);
    const session = state.sessions[0];
    assert.equal(session.status, "in-progress");
    assert.equal(session.version, 1);
    assert.equal(session.sessionId, "sess");
    assert.deepEqual(session.setIds, ["s1", "s2", "s3"]);
    assert.deepEqual(session.sets.s1, { reps: null, load: null, rpe: null });
  });

  it("resumeIndex finds the first unlogged set", () => {
    const session = startSession({ sessions: [] }, "plan-1", prescription)
      .sessions[0];
    assert.equal(resumeIndex(session), 0);
    session.sets.s1 = { reps: 5, load: 100, rpe: 8 };
    assert.equal(resumeIndex(session), 1);
    session.sets.s2 = { reps: 5, load: 100, rpe: 8 };
    session.sets.s3 = { reps: 8, load: 80, rpe: 9 };
    assert.equal(resumeIndex(session), -1);
  });

  it("resumeIndex stays on a set with only some fields logged", () => {
    const session = startSession({ sessions: [] }, "plan-1", prescription)
      .sessions[0];
    session.sets.s1 = { reps: 5, load: null, rpe: null };
    assert.equal(resumeIndex(session), 0);
  });

  it("finishSession marks complete, partial, and skipped correctly", () => {
    const session = startSession({ sessions: [] }, "plan-1", prescription)
      .sessions[0];
    const partial = finishSession(session, { skipped: false });
    assert.equal(partial.status, "done");
    assert.equal(partial.result, "partial");

    for (const id of session.setIds)
      session.sets[id] = { reps: 5, load: 100, rpe: 8 };
    const complete = finishSession(session, { skipped: false });
    assert.equal(complete.result, "complete");

    const skipped = finishSession(session, { skipped: true });
    assert.equal(skipped.status, "skipped");
    assert.equal(skipped.result, "skipped");
  });

  it("never fills unlogged sets with zero", () => {
    const session = startSession({ sessions: [] }, "plan-1", prescription)
      .sessions[0];
    const finished = finishSession(session, { skipped: false });
    assert.equal(finished.sets.s2.reps, null);
    assert.equal(finished.sets.s2.load, null);
    assert.equal(finished.sets.s2.rpe, null);
  });
});
