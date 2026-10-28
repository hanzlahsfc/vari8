import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's TypeScript runner imports the source module directly.
import { reconcileLayout } from "../../ethereal/builder/grid.ts";
import {
  defaultSettings,
  safeResourceUrl,
} from "../../ethereal/builder/model.ts";
import { emptyDashboardDraft, isValidDashboardDraft } from "./schema.ts";

function draftWith(kind, content) {
  const draft = emptyDashboardDraft();
  draft.widgets.push({
    id: `test-${kind}`,
    kind,
    settings: { ...defaultSettings(kind), content },
  });
  return draft;
}

test("coach content widgets survive saved JSON validation", () => {
  for (const kind of ["CU17", "CU18"]) {
    const draft = draftWith(kind, defaultSettings(kind).content);
    assert.equal(
      isValidDashboardDraft(JSON.parse(JSON.stringify(draft))),
      true,
    );
  }
  const linked = draftWith("CU18", {
    body: "Review this month’s guide.",
    tone: "accent",
    actionLabel: "Open the guide",
    actionUrl: "https://example.com/guide",
  });
  assert.equal(isValidDashboardDraft(JSON.parse(JSON.stringify(linked))), true);
});

test("resource links accept only absolute http and https URLs", () => {
  assert.equal(
    safeResourceUrl("https://example.com/guide"),
    "https://example.com/guide",
  );
  assert.equal(
    safeResourceUrl("http://example.com/resource"),
    "http://example.com/resource",
  );
  for (const value of [
    "javascript:alert(1)",
    "//example.com",
    "data:text/html,x",
    "https://user:pass@example.com",
  ]) {
    assert.equal(safeResourceUrl(value), null, value);
  }
});

test("invalid resource links and incomplete link pairs fail draft validation", () => {
  const unsafe = draftWith("CU18", {
    body: "Read this guide.",
    tone: "accent",
    actionLabel: "Open guide",
    actionUrl: "javascript:alert(1)",
  });
  assert.equal(isValidDashboardDraft(unsafe), false);

  const incomplete = draftWith("CU18", {
    body: "Read this guide.",
    tone: "accent",
    actionLabel: "Open guide",
    actionUrl: "",
  });
  assert.equal(isValidDashboardDraft(incomplete), false);
});

test("one-row section headings survive saved validation and layout reconciliation", () => {
  const draft = draftWith("CU17", defaultSettings("CU17").content);
  const position = { x: 0, y: 2, w: 12, h: 1, size: "Compact" };
  draft.layouts.desktop = { "test-CU17": position };

  const restored = JSON.parse(JSON.stringify(draft));
  assert.equal(isValidDashboardDraft(restored), true);
  assert.deepEqual(
    reconcileLayout(
      restored.layouts.desktop,
      restored.widgets,
      "desktop",
      1040,
    )["test-CU17"],
    position,
  );

  const regularWidget = draftWith("CU18", defaultSettings("CU18").content);
  regularWidget.layouts.desktop = {
    "test-CU18": { ...position, w: 6 },
  };
  assert.equal(isValidDashboardDraft(regularWidget), false);
});
