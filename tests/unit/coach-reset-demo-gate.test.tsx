// @vitest-environment jsdom
// Reset must re-seed with the workspace demo flag. Without it a real
// workspace re-injects fixture check-in submissions, extras and schedules.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { CoachApp } from "../../components/canvas/coach/coach-app";
import { eventsBetween, seedState } from "../../components/canvas/coach/model";
import { readCoachState, writeCoachState } from "../../components/canvas/data";

describe("coach reset in a non-demo workspace", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("produces a state with no check-in fixture rows", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
    writeCoachState(seedState({ demo: true }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <CoachApp
        viewer={{
          name: "Coach",
          initials: "C",
          role: "Coach",
          workspaceName: "Workspace",
        }}
      />,
    );
    fireEvent.click(
      await screen.findByLabelText("Workspace preferences for Coach"),
    );
    fireEvent.click(screen.getByText("Reset coach workspace"));
    const state = readCoachState() as ReturnType<typeof seedState>;
    expect(state.submissions).toEqual([]);
    expect(state.extras).toEqual([]);
    expect(state.clients.every((c) => c.schedules.length === 0)).toBe(true);
    expect(eventsBetween(state, "2026-10-01", "2026-12-31")).toEqual([]);
  });
});
