// @vitest-environment jsdom
// PR-03b verify-2 probe: hunk 1 (dashboard-editor) — discriminating WINDOW probe.
// Verifier-authored, NOT part of the PR. Copied temporarily into tests/unit/, then removed.
//
// Window: an async reload commits (React render + DOM mutations), the commit's passive
// effects have NOT flushed yet, and a pointerup gesture commit runs in the gap
// (MutationObserver microtask, which runs after the commit task and before the scheduler's
// passive-effect task). Base reads the ref written during render (fresh); 26b8690 reads a ref
// written in a passive effect (stale); HEAD reads slot.latestConfig (fresh).
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";

afterEach(() => cleanup());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  }),
}));
vi.mock(
  "@/app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/actions",
  () => ({
    saveClientDashboardLayout: vi.fn(async () => ({ ok: false })),
    reloadClientDashboardLayout: vi.fn(async () => ({ ok: false })),
  }),
);

import {
  acquireDashboardSlot,
  reloadDashboardSlot,
} from "@/lib/dashboard/autosave-coordinator";
import { DashboardEditor } from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/dashboard-editor";

const habitChoices = () => Promise.resolve({ choices: [], hasMore: false });
const emptyConfig = () =>
  ({
    version: 1,
    name: "Alpha",
    widgets: [],
    layouts: {},
    widths: {},
  }) as never;

function setup(userId: string, reloaded: () => unknown) {
  const actions = {
    save: vi.fn(async () => ({ ok: false as const })),
    reload: vi.fn(async () => ({
      ok: true as const,
      value: { layout: { revision: 2, config: reloaded() } },
    })),
  } as never;
  const slot = acquireDashboardSlot({
    userId,
    workspaceId: "w1",
    clientProfileId: "c1",
    initialConfig: emptyConfig(),
    initialRevision: 1,
    canEdit: true,
    actions,
  });
  const utils = render(
    <DashboardEditor
      userId={userId}
      workspaceId="w1"
      clientProfileId="c1"
      initialConfig={emptyConfig()}
      initialRevision={1}
      canEdit
      habitChoices={habitChoices() as never}
    />,
  );
  return { slot, ...utils };
}

describe("hunk 1 WINDOW: reloaded config survives a pointer commit that lands before passive effects", () => {
  it("CONTROL (fully flushed reload, then drag-commit): reloaded name survives on every tree", async () => {
    let reloaded: any = null;
    const { slot, container } = setup("win-control", () => reloaded);
    fireEvent.change(screen.getByTestId("add-widget"), {
      target: { value: "BN01" },
    });
    const w = slot.latestConfig.widgets[0];
    const rect = slot.latestConfig.layouts.desktop![w.id]!;
    reloaded = {
      version: 1,
      name: "RELOADED",
      widgets: [w],
      layouts: { desktop: { [w.id]: rect } },
      widths: {},
    };
    await act(async () => {
      await reloadDashboardSlot(slot);
    });
    const el = container.querySelector(
      `[data-widget-id="${w.id}"]`,
    ) as HTMLElement;
    expect(el).toBeTruthy();
    await act(async () => {
      fireEvent.pointerDown(el.querySelector("header") as HTMLElement, {
        clientX: 0,
        clientY: 0,
      });
      window.dispatchEvent(
        new MouseEvent("pointerup", { clientX: 40, clientY: 0, bubbles: true }),
      );
    });
    expect(
      slot.latestConfig.layouts.desktop?.[w.id]?.x,
      "control: drag commit must run",
    ).toBe(8);
    expect(slot.latestConfig.name).toBe("RELOADED");
  });

  it("WINDOW: reload commit -> pointerup in the commit-to-passive-effect gap; reloaded name must survive", async () => {
    let reloaded: any = null;
    const { slot, container } = setup("win-window", () => reloaded);
    fireEvent.change(screen.getByTestId("add-widget"), {
      target: { value: "BN01" },
    });
    const w = slot.latestConfig.widgets[0];
    const rect = slot.latestConfig.layouts.desktop![w.id]!;
    reloaded = {
      version: 1,
      name: "RELOADED",
      widgets: [w],
      layouts: { desktop: { [w.id]: { ...rect, x: rect.x + 3 } } },
      widths: {},
    };
    const el = container.querySelector(
      `[data-widget-id="${w.id}"]`,
    ) as HTMLElement;
    expect(el).toBeTruthy();
    fireEvent.pointerDown(el.querySelector("header") as HTMLElement, {
      clientX: 0,
      clientY: 0,
    }); // arm the gesture (listeners on window)
    const input = screen.getByTestId("dashboard-name") as HTMLInputElement;
    const section = screen.getByTestId("dashboard-editor");
    let fired = false;
    const mo = new MutationObserver(() => {
      // first DOM mutation that carries the reloaded config = the reload commit
      if (fired || input.value !== "RELOADED") return;
      fired = true;
      window.dispatchEvent(
        new MouseEvent("pointerup", { clientX: 40, clientY: 0, bubbles: true }),
      );
    });
    mo.observe(section, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    // NOT wrapped in act: act would flush passive effects and close the window.
    void reloadDashboardSlot(slot);
    const t0 = Date.now();
    while (!fired && Date.now() - t0 < 3000)
      await new Promise((r) => setTimeout(r, 10));
    mo.disconnect();
    expect(
      fired,
      "probe invalid: the reload commit never produced a DOM mutation",
    ).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    // The name is ALSO written by the reload itself, so it proves nothing unless the
    // pointerup commit ran. x=8 is the drag commit (origin x 0, clamped to columns-w=12-4).
    const committed = slot.latestConfig.layouts.desktop?.[w.id]?.x;
    console.log(
      "PROBE2 " +
        JSON.stringify({
          dragCommitX: committed,
          name: slot.latestConfig.name,
        }),
    );
    expect(committed, "probe invalid: pointerup did not commit a drag").toBe(8);
    expect(slot.latestConfig.name).toBe("RELOADED");
  });
});
