// PR-W0 data seam: the per-domain providers must round-trip the coach state
// without loss, adopt the legacy envelope, and fail closed on unreadable or
// incomplete data — the same contract the single envelope had.

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  readCoachState,
  writeCoachState,
  dataDomains,
} from "@/components/canvas/data";
import { ApiClientError, apiFetch } from "@/components/canvas/data/http";
import {
  isCoachState,
  type CoachState,
  seedState,
  STORAGE_KEY as LEGACY_KEY,
} from "@/components/canvas/coach/model";
import { migrateCoachState } from "@/components/canvas/coach/plans/domain";
import { emptyClientPlans } from "@/components/canvas/coach/plans/types";
import { normalizeTemplateSetups } from "@/components/canvas/coach/template-setup";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  get size() {
    return this.map.size;
  }
}

const domainKeys = dataDomains.flatMap(({ slice }) =>
  slice ? [slice.key] : [],
);

function storedSeed(): CoachState {
  // What the store holds after hydration: seed -> migrate -> normalize.
  return normalizeTemplateSetups(migrateCoachState(seedState()) as CoachState);
}

beforeEach(() => {
  const storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
});

describe("coach data seam", () => {
  it("returns undefined when nothing is stored", () => {
    expect(readCoachState()).toBeUndefined();
  });

  it("writes one key per domain and round-trips a full state", () => {
    const state = storedSeed();
    writeCoachState(state);
    for (const key of domainKeys)
      expect(localStorage.getItem(key), key).not.toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();

    const read = migrateCoachState(readCoachState());
    expect(isCoachState(read)).toBe(true);
    expect(read).toEqual(state);
  });

  it("round-trips domain slices that live off the client core", () => {
    const state = storedSeed();
    const client = state.clients[0];
    client.assignment = {
      templateId: state.templates[0].id,
      variantId: state.templates[0].defaultVariant,
      snapshot: state.templates[0],
    };
    client.schedules = [{ effective: "2026-10-01", weekdays: [1, 3, 5] }];
    client.habits = [
      {
        id: "h1",
        name: "Walk",
        frequency: "Daily",
        goal: "20 min",
        reason: "test",
        completed: 3,
      },
    ];
    client.retiredHabits = [
      {
        id: "h0",
        name: "Old",
        frequency: "Weekly",
        goal: "1x",
        reason: "test",
        completed: 9,
      },
    ];
    client.entries = [
      { date: "2026-10-12", weight: 64, sleep: 7, steps: 9000, calories: 2100 },
    ];
    state.coachNotes = [{ id: "n1", text: "note" }];
    state.coachTodos = [{ id: "t1", title: "todo", complete: false }];
    // The new domains the port added: a target version, a supplement plan and
    // the one shot demo seed. Empty values would pass this test while the seam
    // still dropped them, so each one carries data.
    client.plans ??= emptyClientPlans();
    client.plans.activityTargets = [
      {
        id: "at1",
        effectiveFrom: "2026-10-01",
        metric: "steps",
        target: { kind: "minimum", value: 8500 },
      },
    ];
    client.plans.supplements = {
      id: "sp1",
      clientId: client.id,
      name: "Supplement plan",
      savedAt: "2026-10-01T09:00:00.000Z",
      items: [
        {
          id: "si1",
          product: {
            id: "supplement-010",
            brand: "ESN",
            name: "Vitamin D3+K2",
            referenceQuantity: 1,
            quantityUnit: null,
            declaredAmount: 5600,
            declaredUnit: "i. E",
            url: null,
          },
          quantity: 1,
          doseUnit: "reference unit",
          timing: "morning",
          status: "must-have",
          notes: "",
        },
      ],
    };
    state.demoSeeds = { amaraTraining: 1 };
    writeCoachState(state);

    const read = migrateCoachState(readCoachState());
    expect(isCoachState(read)).toBe(true);
    expect(read).toEqual(state);
    const roundTripped = read as CoachState;
    expect(roundTripped.clients[0].plans?.activityTargets).toHaveLength(1);
    expect(roundTripped.clients[0].plans?.supplements?.items[0].product.name).toBe(
      "Vitamin D3+K2",
    );
    expect(roundTripped.demoSeeds).toEqual({ amaraTraining: 1 });
  });

  it("adopts the legacy envelope once, then serves the slices", () => {
    const state = storedSeed();
    localStorage.setItem(LEGACY_KEY, JSON.stringify(state));

    const first = migrateCoachState(readCoachState());
    expect(isCoachState(first)).toBe(true);
    expect(first).toEqual(state);
    // The legacy key survives the read so a crash before the first save
    // cannot lose the last complete copy.
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();

    writeCoachState(first as CoachState);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    const second = migrateCoachState(readCoachState());
    expect(second).toEqual(state);
  });

  it("rejects an incomplete set of domain keys", () => {
    const state = storedSeed();
    writeCoachState(state);
    localStorage.removeItem(domainKeys[domainKeys.length - 1]);
    expect(() => readCoachState()).toThrow(/incomplete/);
  });

  it("rejects corrupt slice JSON", () => {
    const state = storedSeed();
    writeCoachState(state);
    localStorage.setItem(domainKeys[0], "{not json");
    expect(() => readCoachState()).toThrow();
  });

  it("rejects a slice that drops a required per-client field", () => {
    const state = storedSeed();
    writeCoachState(state);
    // Dropping one client's schedules entry leaves the assembled client
    // without the required `schedules` array, like the monolith did.
    const checkinsKey = dataDomains.find(({ domain }) => domain === "checkins")
      ?.slice?.key as string;
    const raw = JSON.parse(localStorage.getItem(checkinsKey) as string);
    delete raw.data.schedules[state.clients[0].id];
    localStorage.setItem(checkinsKey, JSON.stringify(raw));
    const assembled = migrateCoachState(readCoachState());
    expect(isCoachState(assembled)).toBe(false);
  });
});

describe("shared /api/v1 fetch client (O1)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  it("maps server error payloads to ApiClientError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { code: "forbidden" } }, { status: 403 }),
      ),
    );
    const failure = await apiFetch("/x").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiClientError);
    expect((failure as ApiClientError).status).toBe(403);
    expect((failure as ApiClientError).code).toBe("forbidden");
  });

  it("maps network failure to status 0 code network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const failure = await apiFetch("/x").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiClientError);
    expect((failure as ApiClientError).status).toBe(0);
    expect((failure as ApiClientError).code).toBe("network");
  });

  it("resolves the parsed body on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true }, { status: 200 })),
    );
    await expect(apiFetch<{ ok: boolean }>("/x")).resolves.toEqual({
      ok: true,
    });
  });
});
