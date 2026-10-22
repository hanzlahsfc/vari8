import assert from "node:assert/strict";
import test from "node:test";
import {
  declaredTotal,
  dosageForQuantity,
  isSupplementPlan,
  safeProductUrl,
} from "./model.ts";

const product = (overrides = {}) => ({
  id: "p1",
  brand: "ESN",
  name: "Magnesium Complex",
  referenceQuantity: 3,
  quantityUnit: null,
  declaredAmount: 323,
  declaredUnit: "mg",
  url: "https://www.esn.com/products/magnesium-complex",
  ...overrides,
});

const item = (overrides = {}) => ({
  id: "i1",
  product: product(),
  quantity: 3,
  doseUnit: "capsules",
  timing: "with breakfast",
  status: "must-have",
  notes: "",
  ...overrides,
});

const plan = (overrides = {}) => ({
  id: "plan-1",
  clientId: "client-001",
  name: "Supplement plan",
  items: [item()],
  savedAt: "2026-10-21T10:00:00.000Z",
  ...overrides,
});

test("declared total uses original reference ratio, not rounded per-unit values", () => {
  // reference 3 portions declare 323mg -> 3 chosen = 323mg, 6 chosen = 646mg
  assert.deepEqual(declaredTotal(product(), 3), { amount: 323, unit: "mg" });
  assert.deepEqual(declaredTotal(product(), 6), { amount: 646, unit: "mg" });
});

test("fractional reference portion scales declared amount correctly", () => {
  const half = product({ referenceQuantity: 0.5, declaredAmount: 25 });
  assert.deepEqual(declaredTotal(half, 1), { amount: 50, unit: "mg" });
  assert.deepEqual(declaredTotal(half, 2), { amount: 100, unit: "mg" });
});

test("missing composition, missing/invalid reference or invalid quantity return null", () => {
  assert.equal(declaredTotal(product({ declaredAmount: null }), 3), null);
  assert.equal(declaredTotal(product({ declaredUnit: null }), 3), null);
  assert.equal(declaredTotal(product({ referenceQuantity: null }), 3), null);
  assert.equal(declaredTotal(product({ referenceQuantity: 0 }), 3), null);
  assert.equal(declaredTotal(product(), 0), null);
  assert.equal(declaredTotal(product(), -2), null);
  assert.equal(declaredTotal(product(), Number.NaN), null);
  // a known zero declaration is real data, not missing
  assert.deepEqual(declaredTotal(product({ declaredAmount: 0 }), 2), {
    amount: 0,
    unit: "mg",
  });
});

test("dosage falls back to product units only when no declared basis exists", () => {
  // declared composition wins: 323mg per 3 -> Q3 = 323, Q6 = 646
  assert.deepEqual(dosageForQuantity(product(), 3), {
    amount: 323,
    unit: "mg",
  });
  assert.deepEqual(dosageForQuantity(product(), 6), {
    amount: 646,
    unit: "mg",
  });
  // a known zero declaration is real data, not a fallback trigger
  assert.deepEqual(dosageForQuantity(product({ declaredAmount: 0 }), 2), {
    amount: 0,
    unit: "mg",
  });
  // no composition but a known product unit -> the quantity itself is the dose
  assert.deepEqual(
    dosageForQuantity(
      product({
        declaredAmount: null,
        declaredUnit: null,
        quantityUnit: "capsules",
      }),
      7,
    ),
    { amount: 7, unit: "capsules" },
  );
  // neither composition nor product unit -> nothing is invented
  assert.equal(
    dosageForQuantity(
      product({ declaredAmount: null, declaredUnit: null, quantityUnit: null }),
      3,
    ),
    null,
  );
  assert.equal(
    dosageForQuantity(
      product({
        declaredAmount: null,
        declaredUnit: null,
        quantityUnit: "capsules",
      }),
      0,
    ),
    null,
  );
});

test("supplement plan guard accepts a valid saved plan including empty items", () => {
  assert.equal(isSupplementPlan(plan()), true);
  assert.equal(isSupplementPlan(plan({ items: [] })), true);
  const round = JSON.parse(JSON.stringify(plan()));
  assert.equal(isSupplementPlan(round), true);
});

test("supplement plan guard rejects malformed rows and snapshots", () => {
  const bad = [
    null,
    undefined,
    {},
    plan({ id: "" }),
    plan({ clientId: 12 }),
    plan({ savedAt: "" }),
    plan({ items: {} }),
    plan({ items: [{ ...item(), quantity: 0 }] }),
    plan({ items: [{ ...item(), quantity: "3" }] }),
    plan({ items: [{ ...item(), doseUnit: "" }] }),
    plan({ items: [{ ...item(), status: "taken" }] }),
    plan({ items: [{ ...item(), timing: null }] }),
    plan({ items: [{ ...item(), notes: 4 }] }),
    plan({ items: [{ ...item(), product: { ...product(), id: 3 } }] }),
    plan({
      items: [{ ...item(), product: { ...product(), referenceQuantity: -1 } }],
    }),
    plan({
      items: [{ ...item(), product: { ...product(), declaredAmount: "323" } }],
    }),
    // known catalogue unit must match the saved dose unit exactly
    plan({
      items: [
        {
          ...item(),
          product: product({ quantityUnit: "capsules" }),
          doseUnit: "sprays",
        },
      ],
    }),
    plan({ items: [{ ...item(), id: "" }] }),
  ];
  for (const value of bad)
    assert.equal(
      isSupplementPlan(value),
      false,
      String(JSON.stringify(value)).slice(0, 140),
    );
});

test("safe product url accepts http(s) hosts and rejects unsafe forms", () => {
  assert.equal(
    safeProductUrl("https://www.esn.com/products/x?variant=1"),
    "https://www.esn.com/products/x?variant=1",
  );
  assert.equal(
    safeProductUrl("http://shop.example/p"),
    "http://shop.example/p",
  );
  for (const bad of [
    null,
    "",
    "javascript:alert(1)",
    "data:text/html;base64,PGI+",
    "/products/magnesium",
    "products/magnesium",
    "https://user:pass@www.esn.com/x",
    "ftp://example.com/x",
    "https://",
  ]) {
    assert.equal(safeProductUrl(bad), undefined, String(bad));
  }
});
