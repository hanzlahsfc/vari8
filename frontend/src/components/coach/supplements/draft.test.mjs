import assert from "node:assert/strict";
import test from "node:test";
import { blankDraft, draftOf, rowErrors, savedItem } from "./draft.ts";
import { declaredTotal, isSupplementPlan } from "./model.ts";

const savedSnapshot = (overrides = {}) => ({
  id: "p1",
  brand: "ESN",
  name: "Magnesium Complex",
  referenceQuantity: 3,
  quantityUnit: null,
  declaredAmount: 300,
  declaredUnit: "mg",
  url: "https://saved.example/old-magnesium-page",
  ...overrides,
});

const item = (overrides = {}) => ({
  id: "i1",
  product: savedSnapshot(),
  quantity: 6,
  doseUnit: "capsules",
  timing: "with breakfast",
  status: "must-have",
  notes: "",
  ...overrides,
});

test("draftOf keeps the saved product snapshot and savedItem writes it back unchanged", () => {
  const original = item();
  const draft = draftOf(original);
  assert.deepEqual(draft.product, original.product);
  assert.notEqual(draft.product, original.product); // cloned, not aliased

  // Only timing changes: the snapshot must survive verbatim.
  const edited = { ...draft, timing: "after dinner" };
  const saved = savedItem(edited);
  assert.equal(saved.product.declaredAmount, 300);
  assert.equal(saved.product.referenceQuantity, 3);
  assert.equal(saved.product.url, "https://saved.example/old-magnesium-page");
  // 6 units at 300mg per 3 -> 600mg from the snapshot, not live catalogue data.
  assert.deepEqual(declaredTotal(saved.product, saved.quantity), {
    amount: 600,
    unit: "mg",
  });
});

test("savedItem rejects a snapshot whose id or brand disagrees with the selection", () => {
  const draft = draftOf(item());
  assert.equal(savedItem({ ...draft, productId: "other" }), null);
  assert.equal(
    savedItem({ ...draft, product: { ...draft.product, brand: "HPN" } }),
    null,
  );
  assert.equal(savedItem({ ...draft, product: null }), null);
});

test("blankDraft and rowErrors cover missing product and quantity only", () => {
  const blank = blankDraft("s1");
  assert.deepEqual(rowErrors(blank), {
    product: "Choose a product.",
    quantity: "Enter the prescribed quantity.",
  });
  // An unknown catalogue unit is never a manual requirement: the item saves
  // with generic product-unit metadata instead of blocking the form.
  const unknownUnit = { ...draftOf(item()), doseUnit: "" };
  assert.equal(rowErrors(unknownUnit).doseUnit, undefined);
  const saved = savedItem(unknownUnit);
  assert.equal(saved.doseUnit, "reference units");
  const knownUnit = draftOf(
    item({
      product: savedSnapshot({ quantityUnit: "capsules" }),
      doseUnit: "",
    }),
  );
  assert.equal(savedItem(knownUnit).doseUnit, "capsules");
});

test("plan guard rejects unsafe product URLs in saved snapshots", () => {
  const plan = {
    id: "plan-1",
    clientId: "client-001",
    name: "Supplement plan",
    items: [item({ product: savedSnapshot({ url: "javascript:alert(1)" }) })],
    savedAt: "2026-10-21T10:00:00.000Z",
  };
  assert.equal(isSupplementPlan(plan), false);
  plan.items[0].product.url = "data:text/html,<b>x</b>";
  assert.equal(isSupplementPlan(plan), false);
  plan.items[0].product.url = "https://saved.example/old-magnesium-page";
  assert.equal(isSupplementPlan(plan), true);
});
