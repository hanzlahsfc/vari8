import assert from "node:assert/strict";
import { mealWindowStart } from "./meal-window.ts";

// The stored start is clamped to the current option/column count.
assert.equal(mealWindowStart(0, 5, 2), 0);
assert.equal(mealWindowStart(9, 5, 2), 3);
assert.equal(mealWindowStart(-4, 5, 2), 0);
assert.equal(mealWindowStart(2, 3, 2), 1, "delete clamps the window");
assert.equal(mealWindowStart(2, 5, 3), 2);
assert.equal(mealWindowStart(2, 5, 4), 1, "growing columns clamps the window");
assert.equal(mealWindowStart(0, 0, 2), 0);
assert.equal(
  mealWindowStart(1, 5, 0),
  1,
  "a zero column request behaves as one",
);

// Appending an option makes it the last visible column: 1-2 → 2-3 → 3-4.
assert.equal(mealWindowStart(0, 3, 2, 2), 1);
assert.equal(mealWindowStart(1, 4, 2, 3), 2);
assert.equal(mealWindowStart(0, 5, 3, 4), 2);

// Selecting a hidden option shifts the window only as far as needed.
assert.equal(mealWindowStart(2, 6, 2, 0), 0, "left hidden index");
assert.equal(mealWindowStart(0, 6, 2, 4), 3, "right hidden index");
assert.equal(mealWindowStart(2, 6, 2, 3), 2, "focus already visible");
assert.equal(
  mealWindowStart(2, 6, 2, 2),
  2,
  "focus at the left edge stays put",
);
assert.equal(
  mealWindowStart(2, 6, 2, 3),
  2,
  "focus at the right edge stays put",
);
assert.equal(mealWindowStart(0, 6, 3, 3), 1);
assert.equal(mealWindowStart(1, 6, 3, 5), 3);
assert.equal(mealWindowStart(3, 6, 2, 5), 4, "focus at the end");
assert.equal(mealWindowStart(0, 2, 2, 1), 0);
assert.equal(mealWindowStart(0, 1, 2, 0), 0);

// A duplicate is appended, then made active; the same minimum shift applies.
assert.equal(mealWindowStart(1, 6, 2, 5), 4);
