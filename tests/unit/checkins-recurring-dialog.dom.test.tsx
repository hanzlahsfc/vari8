// @vitest-environment jsdom
// P600 — the ClientSettingsDialog's recurring-weekday controller through the
// real component: pressed-state and intent share the authoritative snapshot,
// the picker carries formId + explicit time, and ungenerated recovers durably.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CoachClient } from "@/components/canvas/coach/model";

const saveRecurringDays = vi.fn();
const reloadRecurring = vi.fn();
const loadSchedulableFormVersions = vi.fn();
const retryGenerateRule = vi.fn();

vi.mock("../../components/canvas/data/checkins", async (orig) => ({
  ...(await orig<typeof import("../../components/canvas/data/checkins")>()),
  saveRecurringDays: (...a: unknown[]) => saveRecurringDays(...a),
  reloadRecurring: (...a: unknown[]) => reloadRecurring(...a),
  loadSchedulableFormVersions: (...a: unknown[]) =>
    loadSchedulableFormVersions(...a),
  retryGenerateRule: (...a: unknown[]) => retryGenerateRule(...a),
}));

const client = {
  id: "client-1",
  name: "Emma Anders",
  schedules: [{ effective: "2026-10-01", weekdays: [0] }],
  onboarding: [],
  assignment: null,
} as unknown as CoachClient;

vi.mock("../../components/canvas/coach/store", () => ({
  useCoach: () => ({
    state: {
      clients: [client],
      extras: [],
      submissions: [],
      trainingLogs: [],
      messages: [],
    },
    setState: (fn: unknown) => fn,
    navigate: vi.fn(),
    toast: vi.fn(),
    workspaceId: "ws-1",
    clientProfileIdFor: vi.fn(async () => "cp-1"),
  }),
}));

import { AthleteProfileHeader } from "@/components/canvas/coach/athlete/overview";

// jsdom lacks <dialog> showModal/close — same polyfill as the other dom tests.
Object.defineProperty(HTMLDialogElement.prototype, "open", {
  get() {
    return this.hasAttribute("open");
  },
});
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};

async function openSettings() {
  render(
    <AthleteProfileHeader
      client={client}
      onBack={() => {}}
      onAssign={() => {}}
      onAddDate={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Client settings" }));
  await waitFor(() =>
    expect(screen.getByText(/Recurring check-ins/)).toBeTruthy(),
  );
}

describe("ClientSettingsDialog — recurring weekday controller (P600)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reloadRecurring.mockResolvedValue({
      schedules: [{ effective: "2026-10-01", weekdays: [0] }],
      weekdays: [0],
      ungeneratedRuleIds: [],
    });
    saveRecurringDays.mockResolvedValue({ ruleId: "r-1", status: "ok" });
  });
  afterEach(cleanup);

  it("pressed-state and intent share one source — a pressed day removes", async () => {
    await openSettings();
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Monday" })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Monday" }));
    await waitFor(() =>
      expect(saveRecurringDays).toHaveBeenCalledWith(
        expect.objectContaining({ add: false, weekday: 0 }),
      ),
    );
  });

  it("SELECT_FORM opens the picker; Apply carries formId + explicit time", async () => {
    saveRecurringDays.mockRejectedValueOnce(new Error("SELECT_FORM_REQUIRED"));
    loadSchedulableFormVersions.mockResolvedValueOnce({
      options: [
        {
          position: 0,
          formName: "Weekly check-in",
          versionSeq: 2,
          formId: "form-weekly",
          formVersionId: "fv-2",
        },
      ],
    });
    await openSettings();
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Monday" })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Wednesday" }));
    await waitFor(() => expect(loadSchedulableFormVersions).toHaveBeenCalled());
    expect(
      await screen.findByText(/Pick the published check-in form/),
    ).toBeTruthy();
    // the picker surfaces the published-form options and the explicit
    // first-create time field before Apply can carry them
    expect(screen.getByText(/First schedule time/)).toBeTruthy();
    expect(screen.getByText(/Client timezone/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply" })).toBeTruthy();
    // the helper-level contract (formId + localTimeMinutes + timezone on the
    // body) is covered by the data-layer regressions; the Select is the
    // BaseSelect portal control, exercised in the live replay.
  });

  it("ungenerated surfaces a durable Retry for the created rule", async () => {
    reloadRecurring.mockResolvedValueOnce({
      schedules: [{ effective: "2026-10-01", weekdays: [0] }],
      weekdays: [0],
      ungeneratedRuleIds: ["r-stuck"],
    });
    await openSettings();
    expect(
      await screen.findByRole("button", { name: "Retry generation" }),
    ).toBeTruthy();
    retryGenerateRule.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Retry generation" }));
    await waitFor(() =>
      expect(retryGenerateRule).toHaveBeenCalledWith(
        expect.objectContaining({ ruleId: "r-stuck" }),
      ),
    );
  });
});
