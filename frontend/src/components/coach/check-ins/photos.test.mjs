import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clientPoses,
  comparisonPoses,
  DEFAULT_POSES,
  photosForPose,
  questionPoses,
  withPhotoQuestion,
} from "./photos.ts";

test("questionPoses parses comma-separated options", () => {
  const poses = questionPoses({
    options: "Front relaxed, Side relaxed,Back relaxed",
  });
  assert.deepEqual(poses, ["Front relaxed", "Side relaxed", "Back relaxed"]);
});

test("an empty client pose list stays empty instead of inventing presets", () => {
  assert.deepEqual(questionPoses({ options: "" }), []);
  assert.deepEqual(questionPoses({ options: "   " }), []);
  assert.ok(DEFAULT_POSES.includes("Front double biceps"));
});

test("clientPoses reads the client snapshot's photo questions in order", () => {
  const client = {
    assignment: {
      variantId: "meal-plan",
      snapshot: {
        variants: [
          {
            id: "meal-plan",
            questions: [
              { id: "q1", type: "Visual upload", options: "Front, Side" },
              { id: "q2", type: "Long text", options: "" },
              { id: "q3", type: "Visual upload", options: "Side, Back" },
            ],
          },
        ],
      },
    },
  };
  assert.deepEqual(clientPoses(client), ["Front", "Side", "Back"]);
});

test("comparisonPoses keeps client order and adds Other for removed poses", () => {
  const client = {
    assignment: {
      variantId: "meal-plan",
      snapshot: {
        variants: [
          {
            id: "meal-plan",
            questions: [
              { id: "q1", type: "Visual upload", options: "Front, Side" },
            ],
          },
        ],
      },
    },
  };
  const submissions = [
    {
      photos: [
        { pose: "Side", src: "b" },
        { pose: "Front", src: "a" },
        { pose: "Old pose", src: "c" },
      ],
    },
  ];
  assert.deepEqual(comparisonPoses(client, submissions), {
    poses: ["Front", "Side", "Other"],
    other: true,
  });
  assert.deepEqual(
    comparisonPoses(client, [{ photos: [{ pose: "Front", src: "a" }] }]),
    { poses: ["Front", "Side"], other: false },
  );
  assert.deepEqual(photosForPose(submissions[0], "Side"), [
    { pose: "Side", src: "b" },
  ]);
});

test("legacy clients without configured poses keep their shot list, without Other", () => {
  const client = { assignment: undefined };
  assert.deepEqual(
    comparisonPoses(client, [
      { photos: [{ pose: "Front", src: "a" }] },
      { photos: [{ pose: "Side", src: "b" }] },
    ]),
    { poses: ["Front", "Side"], other: false },
  );
});

test("legacy photos without a question id migrate without losing poses", () => {
  const photos = [{ pose: "Front", src: "a" }];
  assert.deepEqual(withPhotoQuestion(photos, "q1"), [
    { pose: "Front", src: "a", question: "q1" },
  ]);
  assert.deepEqual(withPhotoQuestion(photos, undefined), photos);
});
