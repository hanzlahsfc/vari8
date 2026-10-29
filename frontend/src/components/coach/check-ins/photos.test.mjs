import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_POSES, questionPoses } from "./photos.ts";

test("questionPoses parses comma-separated options", () => {
  const poses = questionPoses({
    options: "Front relaxed, Side relaxed,Back relaxed",
  });
  assert.deepEqual(poses, ["Front relaxed", "Side relaxed", "Back relaxed"]);
});

test("questionPoses falls back to the default set when options are empty", () => {
  assert.deepEqual(questionPoses({ options: "" }), DEFAULT_POSES);
  assert.deepEqual(questionPoses({ options: "   " }), DEFAULT_POSES);
});

test("DEFAULT_POSES covers the five standard physique shots", () => {
  assert.equal(DEFAULT_POSES.length, 5);
  assert.ok(DEFAULT_POSES.includes("Front double biceps"));
});
