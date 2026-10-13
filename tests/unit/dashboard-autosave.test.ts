import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  abandonDashboardSlot,
  acquireDashboardSlot,
  anyPendingSlot,
  clearAllDashboardSlots,
  commitDashboardConfig,
  reloadDashboardSlot,
  slotPending,
  subscribeDashboardSlot,
  travelDashboardConfig,
} from "@/lib/dashboard/autosave-coordinator";
import type { DashboardConfig } from "@/lib/dashboard/config-schema";

const cfg = (name: string): DashboardConfig => ({
  version: 1,
  name,
  widgets: [],
  layouts: { desktop: {} },
  widths: { desktop: 1040 },
});

const acquire = (
  over: Partial<Parameters<typeof acquireDashboardSlot>[0]> = {},
) =>
  acquireDashboardSlot({
    userId: "u1",
    workspaceId: "ws1",
    clientProfileId: "cp1",
    initialConfig: cfg("base"),
    initialRevision: 1,
    canEdit: true,
    actions: {
      save: vi.fn(async (input) => ({
        ok: true as const,
        value: { revision: input.expectedRevision + 1, config: input.config },
      })),
      reload: vi.fn(async () => ({
        ok: true as const,
        value: { layout: { revision: 1, config: cfg("base") } },
      })),
    },
    ...over,
  });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  clearAllDashboardSlots();
});

describe("autosave coordinator (I1-R5)", () => {
  it("commits debounce and persist via the injected action", async () => {
    const slot = acquire();
    commitDashboardConfig(slot, cfg("draft"));
    expect(slotPending(slot)).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    expect(slot.actions.save).toHaveBeenCalledWith(
      expect.objectContaining({ config: cfg("draft"), expectedRevision: 1 }),
    );
    expect(slot.dirty).toBe(false);
    expect(slot.saveState).toBe("saved");
    expect(slot.confirmedRevision).toBe(2);
  });

  it("newer queued edits are not replaced by an older in-flight response", async () => {
    let resolveFirst: ((v: unknown) => void) | undefined;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveFirst = r;
          }),
      )
      .mockImplementation(async (input) => ({
        ok: true as const,
        value: { revision: input.expectedRevision + 1, config: input.config },
      }));
    const slot = acquire({ actions: { save, reload: vi.fn() } });
    commitDashboardConfig(slot, cfg("first"));
    await vi.advanceTimersByTimeAsync(600); // first save in-flight
    commitDashboardConfig(slot, cfg("second")); // queues
    await vi.advanceTimersByTimeAsync(600); // debounce fires → queued
    expect(slot.inFlight).toBe(true);
    expect(slot.queued).toBe(true);
    resolveFirst!({
      ok: true,
      value: { revision: 2, config: cfg("first") },
    });
    await vi.runAllTimersAsync();
    // the second save carries "second" — the older response must not
    // overwrite the newer draft
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ config: cfg("second") }),
    );
    expect(slot.latestConfig.name).toBe("second");
    expect(slot.saveState).toBe("saved");
  });

  it("pending work survives detach — observers unsubscribe without cancelling", async () => {
    const slot = acquire();
    const seen: number[] = [];
    const unsub = subscribeDashboardSlot(slot, () => seen.push(1));
    commitDashboardConfig(slot, cfg("away"));
    unsub(); // observer gone — the save still runs
    await vi.advanceTimersByTimeAsync(600);
    expect(slot.actions.save).toHaveBeenCalled();
    expect(slot.saveState).toBe("saved");
  });

  it("anyPendingSlot reports pending work after the editor 'unmounts'", async () => {
    const slot = acquire();
    commitDashboardConfig(slot, cfg("back"));
    expect(anyPendingSlot()).toBe(slot);
    // simulate unmount: detach all listeners — work continues
    slot.listeners.clear();
    expect(anyPendingSlot()).toBe(slot);
    await vi.advanceTimersByTimeAsync(600);
    expect(anyPendingSlot()).toBeNull();
  });

  it("terminal failure keeps the draft and an honest failed state", async () => {
    const save = vi.fn(async () => ({
      ok: false as const,
      code: "not_available" as const,
      message: "down",
    }));
    const slot = acquire({ actions: { save, reload: vi.fn() } });
    commitDashboardConfig(slot, cfg("kept"));
    await vi.runAllTimersAsync(); // exhaust retries
    expect(slot.saveState).toBe("failed");
    expect(slot.dirty).toBe(true);
    expect(slot.latestConfig.name).toBe("kept");
    // returning to the editor reuses the slot — draft + revision intact
    const again = acquire();
    expect(again).toBe(slot);
    expect(again.latestConfig.name).toBe("kept");
    expect(again.dirty).toBe(true);
  });

  it("a clean slot re-bases onto fresh server state on re-acquire", () => {
    const slot = acquire();
    expect(slot.latestConfig.name).toBe("base");
    const again = acquire({
      initialConfig: cfg("server-newer"),
      initialRevision: 7,
    });
    expect(again).toBe(slot);
    expect(again.latestConfig.name).toBe("server-newer");
    expect(again.confirmedRevision).toBe(7);
  });

  it("a different userId can never reuse retained slots", () => {
    const slot = acquire();
    commitDashboardConfig(slot, cfg("user1-draft"));
    const other = acquire({ userId: "u2" });
    expect(other).not.toBe(slot);
    expect(other.latestConfig.name).toBe("base");
    expect(anyPendingSlot()?.userId ?? null).toBeNull();
  });

  it("clearAll drops retained drafts and timers", () => {
    const slot = acquire();
    commitDashboardConfig(slot, cfg("logout-draft"));
    clearAllDashboardSlots();
    expect(anyPendingSlot()).toBeNull();
    const fresh = acquire();
    expect(fresh.latestConfig.name).toBe("base");
  });

  it("abandon cancels debounce + queue but leaves the dispatched save honest", async () => {
    const slot = acquire();
    commitDashboardConfig(slot, cfg("abandoned"));
    abandonDashboardSlot(slot);
    expect(slotPending(slot)).toBe(false);
    await vi.runAllTimersAsync();
    expect(slot.actions.save).not.toHaveBeenCalled();
    expect(slot.saveState).toBe("idle");
  });

  it("undo/redo restore drafts through the slot", () => {
    const slot = acquire();
    commitDashboardConfig(slot, cfg("a"));
    commitDashboardConfig(slot, cfg("b"));
    travelDashboardConfig(slot, "undo");
    expect(slot.latestConfig.name).toBe("a");
    travelDashboardConfig(slot, "redo");
    expect(slot.latestConfig.name).toBe("b");
  });

  it("conflict with a converged server state resolves to saved", async () => {
    const save = vi.fn(async () => ({
      ok: false as const,
      code: "conflict" as const,
      message: "revision",
    }));
    const reload = vi.fn(async () => ({
      ok: true as const,
      // server already holds the same canonical content — converge
      value: { layout: { revision: 5, config: cfg("same") } },
    }));
    const slot = acquire({
      actions: { save, reload },
    });
    commitDashboardConfig(slot, cfg("same"));
    await vi.runAllTimersAsync();
    expect(slot.saveState).toBe("saved");
    expect(slot.confirmedRevision).toBe(5);
  });

  it("conflict with divergent server state keeps the draft as conflict", async () => {
    const save = vi.fn(async () => ({
      ok: false as const,
      code: "conflict" as const,
      message: "revision",
    }));
    const reload = vi.fn(async () => ({
      ok: true as const,
      value: { layout: { revision: 5, config: cfg("theirs") } },
    }));
    const slot = acquire({ actions: { save, reload } });
    commitDashboardConfig(slot, cfg("mine"));
    await vi.runAllTimersAsync();
    expect(slot.saveState).toBe("conflict");
    expect(slot.latestConfig.name).toBe("mine");
    expect(slot.dirty).toBe(true);
  });

  it("explicit reload adopts the server layout", async () => {
    const reload = vi.fn(async () => ({
      ok: true as const,
      value: { layout: { revision: 9, config: cfg("server") } },
    }));
    const slot = acquire({ actions: { save: vi.fn(), reload } });
    await reloadDashboardSlot(slot);
    expect(slot.latestConfig.name).toBe("server");
    expect(slot.confirmedRevision).toBe(9);
    expect(slot.dirty).toBe(false);
  });
});
