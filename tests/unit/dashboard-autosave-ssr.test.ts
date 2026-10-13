import { describe, expect, it, vi } from "vitest";

// This file runs in the vitest node environment — `window` is absent,
// which is exactly the SSR/server-rendering condition the R6 review
// flagged: acquireDashboardSlot must never mutate shared module state
// when there is no browser realm.
import {
  acquireDashboardSlot,
  anyPendingSlot,
  commitDashboardConfig,
} from "@/lib/dashboard/autosave-coordinator";
import type { DashboardConfig } from "@/lib/dashboard/config-schema";

const cfg = (name: string): DashboardConfig => ({
  version: 1,
  name,
  widgets: [],
  layouts: { desktop: {} },
  widths: { desktop: 1040 },
});

const input = (userId = "u1") => ({
  userId,
  workspaceId: "ws1",
  clientProfileId: "cp1",
  initialConfig: cfg("base"),
  initialRevision: 1,
  canEdit: true,
  actions: { save: vi.fn(), reload: vi.fn() },
});

describe("SSR isolation (I1-R6)", () => {
  it("this test file runs without a window — the SSR condition", () => {
    expect(typeof window).toBe("undefined");
  });

  it("server-side acquire never mutates the shared slot map", () => {
    const slot = acquireDashboardSlot(input());
    commitDashboardConfig(slot, cfg("server-side-draft"));
    // nothing pending globally — the ephemeral slot was never registered
    expect(anyPendingSlot()).toBeNull();
  });

  it("two server-side acquires cannot share a draft", () => {
    const a = acquireDashboardSlot(input("u1"));
    commitDashboardConfig(a, cfg("user-one-secret"));
    // a different user's server render gets a clean view — never the
    // retained draft of another request
    const b = acquireDashboardSlot(input("u2"));
    expect(b.latestConfig.name).toBe("base");
    // even the same user re-acquiring on the server gets only the props
    // snapshot — server renders are deterministic and stateless
    const a2 = acquireDashboardSlot(input("u1"));
    expect(a2.latestConfig.name).toBe("base");
  });
});
