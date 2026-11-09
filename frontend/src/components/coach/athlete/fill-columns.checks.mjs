import assert from "node:assert/strict";
import { test } from "node:test";
import { fillColumns } from "./fill-columns.ts";

const sum = (values) => values.reduce((total, value) => total + value, 0);

test("a narrower natural table fills the frame and gives every column its minimum", () => {
  const natural = [120, 80, 200];
  const filled = fillColumns(natural, 900);
  assert.equal(sum(filled), 900);
  for (let index = 0; index < natural.length; index += 1)
    assert.ok(filled[index] >= natural[index]);
});

test("a wider natural table stays exactly as measured", () => {
  const natural = [400, 300, 200];
  assert.deepEqual(fillColumns(natural, 700), natural);
});

test("an equal table stays exactly as measured", () => {
  const natural = [200, 300, 100];
  assert.deepEqual(fillColumns(natural, 600), natural);
});

test("an empty table stays empty", () => {
  assert.deepEqual(fillColumns([], 1000), []);
});

test("an unmeasured frame keeps the natural widths", () => {
  const natural = [100, 50];
  assert.deepEqual(fillColumns(natural, 0), natural);
  assert.deepEqual(fillColumns(natural, -1), natural);
});

test("fractional naturals still fill the frame without shrinking", () => {
  const natural = [100.5, 60.25, 39.25];
  const filled = fillColumns(natural, 400);
  assert.equal(sum(filled), 400);
  for (let index = 0; index < natural.length; index += 1)
    assert.ok(filled[index] >= natural[index]);
});

test("the rounding remainder is handed out largest column first", () => {
  const filled = fillColumns([101, 50, 49], 210);
  assert.deepEqual(filled, [107, 52, 51]);
  assert.equal(sum(filled), 210);
});

test("one spare pixel goes to the largest single column", () => {
  assert.deepEqual(fillColumns([50, 10], 61), [51, 10]);
});
