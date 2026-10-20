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
    writeCoachState(state);

    const read = migrateCoachState(readCoachState());
    expect(isCoachState(read)).toBe(true);
    expect(read).toEqual(state);
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
