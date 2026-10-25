// Issue #162 slice (Stage 1 card 02): the supplements data provider maps
// between the merged backend's wire views (lib/supplements/service.ts) and
// the canvas supplement model, and the data seam lists supplements once as
// a remote domain with no localStorage slice.

import { describe, expect, it } from "vitest";

import { dataDomains } from "@/components/canvas/data";
import {
  planFromView,
  toWireItems,
  type SupplementPlanViewWire,
} from "@/components/canvas/data/supplements";
import type { SupplementItem } from "@/components/canvas/coach/supplements/model";

const view: SupplementPlanViewWire = {
  id: "plan-1",
  name: "Morning stack",
  revision: 3,
  savedAt: "2026-10-25T10:00:00.000Z",
  items: [
    {
      id: "row-1",
      itemRefId: "supp-a",
      position: 0,
      product: {
        refId: "creapure-5g",
        brand: "Creapure",
        name: "Creatine Monohydrate",
        referenceQuantity: 5,
        quantityUnit: "g",
        declaredAmount: 5,
        declaredUnit: "g",
        url: "https://example.com/creatine",
      },
      quantity: 5,
      doseUnit: "g",
      timing: "with breakfast",
      status: "must-have",
      notes: "daily",
    },
    {
      id: "row-2",
      itemRefId: null,
      position: 1,
      product: {
        refId: "d3-2000",
        brand: "Generic",
        name: "Vitamin D3",
        referenceQuantity: null,
        quantityUnit: null,
        declaredAmount: null,
        declaredUnit: null,
        url: null,
      },
      quantity: 1,
      doseUnit: "capsule",
      timing: "",
      status: "optional",
      notes: "",
    },
  ],
};

describe("supplements data provider", () => {
  it("registers supplements once in the data seam with no local slice", () => {
    const domains = dataDomains.filter((d) => d.domain === "supplements");
    expect(domains).toHaveLength(1);
    expect(domains[0]?.slice).toBeNull();
    expect(domains[0]?.keys).toEqual([]);
  });

  it("maps a staff plan view to the canvas plan, preserving row order", () => {
    const plan = planFromView(view, "client-001");
    expect(plan.id).toBe("plan-1");
    expect(plan.clientId).toBe("client-001");
    expect(plan.name).toBe("Morning stack");
    expect(plan.savedAt).toBe("2026-10-25T10:00:00.000Z");
    expect(plan.items.map((item) => item.product.name)).toEqual([
      "Creatine Monohydrate",
      "Vitamin D3",
    ]);
    // The canvas item id comes from itemRefId, falling back to the row id.
    expect(plan.items[0]?.id).toBe("supp-a");
    expect(plan.items[1]?.id).toBe("row-2");
    // product.refId becomes the canvas product id.
    expect(plan.items[0]?.product.id).toBe("creapure-5g");
    expect(plan.items[0]?.status).toBe("must-have");
    expect(plan.items[1]?.status).toBe("optional");
  });

  it("maps canvas items to the write payload with the snapshot under product.id", () => {
    const items: SupplementItem[] = planFromView(view, "client-001").items;
    const wire = toWireItems(items);
    expect(wire).toHaveLength(2);
    expect(wire[0]?.id).toBe("supp-a");
    expect(wire[0]?.product.id).toBe("creapure-5g");
    expect(wire[0]?.product.brand).toBe("Creapure");
    expect(wire[0]?.product.referenceQuantity).toBe(5);
    expect(wire[0]?.product.url).toBe("https://example.com/creatine");
    expect(wire[0]?.quantity).toBe(5);
    expect(wire[0]?.doseUnit).toBe("g");
    expect(wire[0]?.status).toBe("must-have");
    expect(wire[1]?.product.id).toBe("d3-2000");
    expect(wire[1]?.product.url).toBeNull();
  });
});
