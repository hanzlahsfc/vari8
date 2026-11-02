// Supplement-plan domain provider - issue #162 slice wiring (Stage 1
// card 02). Unlike the localStorage-backed providers in this directory this
// one is remote: reads and writes go through the shared /api/v1 client
// (http.ts) to the thin route over Hanzlah's merged supplement backend
// (lib/supplements/*). Temporary slice wiring - the owning follow-up on
// #162 replaces it; do not extend it here.

import type {
  SupplementItem,
  SupplementPlan,
  SupplementStatus,
} from "../coach/supplements/model";
import { apiFetch } from "./http";

// Wire shapes mirror lib/supplements/service.ts; duplicated here so the
// canvas never imports server modules. Reads return `product.refId` and
// `itemRefId`; writes take the snapshot under `product.id` and the canvas
// item id under the item's `id`.
export type SupplementProductWire = {
  refId: string;
  brand: string;
  name: string;
  referenceQuantity: number | null;
  quantityUnit: string | null;
  declaredAmount: number | null;
  declaredUnit: string | null;
  url: string | null;
};

export type SupplementItemViewWire = {
  id: string;
  itemRefId: string | null;
  position: number;
  product: SupplementProductWire;
  quantity: number;
  doseUnit: string;
  timing: string;
  status: SupplementStatus;
  notes: string;
};

export type SupplementPlanViewWire = {
  id: string;
  name: string;
  revision: number;
  savedAt: string | null;
  items: SupplementItemViewWire[];
};

export type StaffSupplementPlanResponse = {
  plan: SupplementPlanViewWire | null;
  writeCapable: boolean;
};

type SupplementItemInput = {
  id: string;
  product: Omit<SupplementProductWire, "refId"> & { id: string };
  quantity: number;
  doseUnit: string;
  timing: string;
  status: SupplementStatus;
  notes: string;
};

const planPath = (workspaceId: string, clientProfileId: string) =>
  `/workspaces/${workspaceId}/clients/${clientProfileId}/supplement-plan`;

export function fetchSupplementPlan(
  workspaceId: string,
  clientProfileId: string,
): Promise<StaffSupplementPlanResponse> {
  return apiFetch<StaffSupplementPlanResponse>(
    planPath(workspaceId, clientProfileId),
  );
}

export function saveSupplementPlanRemote(
  workspaceId: string,
  clientProfileId: string,
  input: { expectedRevision: number; name: string; items: SupplementItem[] },
): Promise<{ planId: string; revision: number }> {
  return apiFetch<{ planId: string; revision: number }>(
    planPath(workspaceId, clientProfileId),
    {
      method: "PUT",
      body: {
        expectedRevision: input.expectedRevision,
        name: input.name,
        items: toWireItems(input.items),
      },
    },
  );
}

// Server view -> canvas plan. Item order is the stored position order;
// the canvas item id is itemRefId, falling back to the item row id.
export function planFromView(
  view: SupplementPlanViewWire,
  clientId: string,
): SupplementPlan {
  return {
    id: view.id,
    clientId,
    name: view.name,
    savedAt: view.savedAt ?? "",
    items: view.items.map((item) => ({
      id: item.itemRefId ?? item.id,
      product: {
        id: item.product.refId,
        brand: item.product.brand,
        name: item.product.name,
        referenceQuantity: item.product.referenceQuantity,
        quantityUnit: item.product.quantityUnit,
        declaredAmount: item.product.declaredAmount,
        declaredUnit: item.product.declaredUnit,
        url: item.product.url,
      },
      quantity: item.quantity,
      doseUnit: item.doseUnit,
      timing: item.timing,
      status: item.status,
      notes: item.notes,
    })),
  };
}

// Canvas items -> write payload: the canvas item id travels as the item's
// `id` (the backend stores it as itemRefId) and the product snapshot goes
// under `product.id` (stored as productRefId).
export function toWireItems(items: SupplementItem[]): SupplementItemInput[] {
  return items.map((item) => ({
    id: item.id,
    product: {
      id: item.product.id,
      brand: item.product.brand,
      name: item.product.name,
      referenceQuantity: item.product.referenceQuantity,
      quantityUnit: item.product.quantityUnit,
      declaredAmount: item.product.declaredAmount,
      declaredUnit: item.product.declaredUnit,
      url: item.product.url,
    },
    quantity: item.quantity,
    doseUnit: item.doseUnit,
    timing: item.timing,
    status: item.status,
    notes: item.notes,
  }));
}
