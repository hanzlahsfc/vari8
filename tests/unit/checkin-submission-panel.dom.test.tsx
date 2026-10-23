// @vitest-environment jsdom

// CHECKIN-ENABLE — the seeded "Weekly check-in" form carries a REQUIRED
// `rating` field ("How was your training?", SCALE_1_10). The fill panel
// must render a control for it; without one the required-field guard holds
// Submit disabled forever and the trial loop cannot be exercised. Word
// labels and 1–5 schemes map to their own option sets; optional `visual`
// fields stay unrendered (media answers are out of scope).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { submitCheckInInstanceAction } from "@/app/(tracker)/workspace/[workspaceId]/check-ins/actions";
import { CheckInSubmissionPanel } from "@/app/(tracker)/workspace/[workspaceId]/check-ins/checkin-submission-panel";
import type { OwnCheckInInstanceDetail } from "@/lib/checkin/instances";

vi.mock("@/app/(tracker)/workspace/[workspaceId]/check-ins/actions", () => ({
  submitCheckInInstanceAction: vi.fn(),
  listOwnCheckInFeedbackAction: vi.fn(),
  readOwnCheckInCalendarAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

function detail(fields: OwnCheckInInstanceDetail["definition"]["fields"]) {
  return {
    instanceId: "inst-1",
    formName: "Weekly check-in",
    versionSeq: 1,
    dueAt: "2026-10-19T07:00:00.000Z",
    state: "SCHEDULED",
    late: true,
    submittedAt: null,
    definition: { title: "Weekly check-in", fields },
    submittedAnswers: null,
    feedback: null,
    feedbackNextCursor: null,
  } satisfies OwnCheckInInstanceDetail;
}

const FIELDS = [
  {
    fieldId: "q-energy",
    kind: "longText",
    label: "How did you feel this week?",
    required: true,
    order: 0,
  },
  {
    fieldId: "q-training",
    kind: "rating",
    label: "How was your training?",
    required: true,
    order: 1,
    ratingScheme: "SCALE_1_10",
  },
  {
    fieldId: "q-visuals",
    kind: "visual",
    label: "Progress visuals",
    required: false,
    order: 2,
  },
] as OwnCheckInInstanceDetail["definition"]["fields"];

function submitButton() {
  return screen.getByTestId("checkin-submit") as HTMLButtonElement;
}

describe("CHECKIN-ENABLE: rating fields render an answerable control", () => {
  afterEach(() => cleanup());

  it("a required SCALE_1_10 rating renders a 1–10 select and unblocks submit", () => {
    render(<CheckInSubmissionPanel workspaceId="ws" detail={detail(FIELDS)} />);

    // The required rating keeps submit disabled until answered.
    expect(submitButton().disabled).toBe(true);

    const control = document.getElementById(
      "ci-f-q-training",
    ) as HTMLSelectElement | null;
    expect(control).not.toBeNull();
    expect(control?.tagName).toBe("SELECT");
    const labels = [...(control?.options ?? [])].map((o) => o.label);
    expect(labels).toEqual([
      "—",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);

    // Fill the required text + rating — submit must become reachable.
    fireEvent.change(document.getElementById("ci-f-q-energy")!, {
      target: { value: "Felt good this week." },
    });
    expect(submitButton().disabled).toBe(true);
    fireEvent.change(control!, { target: { value: "7" } });
    expect(submitButton().disabled).toBe(false);

    // The wire payload carries the selected rating as its stored integer.
    const wire = JSON.parse(
      (document.querySelector('input[name="answersJson"]') as HTMLInputElement)
        .value,
    ) as Array<{ fieldId: string; value: unknown }>;
    expect(wire).toContainEqual({ fieldId: "q-training", value: "7" });
  });

  it("an optional rating can be left absent — submit unblocks and the wire carries no value for it", () => {
    const fields = [
      {
        fieldId: "q-energy",
        kind: "longText",
        label: "How did you feel this week?",
        required: true,
        order: 0,
      },
      {
        fieldId: "q-training",
        kind: "rating",
        label: "How was your training?",
        required: false,
        order: 1,
        ratingScheme: "SCALE_1_10",
      },
    ] as OwnCheckInInstanceDetail["definition"]["fields"];
    render(<CheckInSubmissionPanel workspaceId="ws" detail={detail(fields)} />);

    expect(submitButton().disabled).toBe(true);
    fireEvent.change(document.getElementById("ci-f-q-energy")!, {
      target: { value: "Felt good this week." },
    });
    // The optional rating was never touched — submit unblocks anyway.
    expect(submitButton().disabled).toBe(false);

    const wire = JSON.parse(
      (document.querySelector('input[name="answersJson"]') as HTMLInputElement)
        .value,
    ) as Array<{ fieldId: string; value: unknown }>;
    // Absent — no answer row at all for the optional rating, so the
    // server never sees a value it must interpret (never 0 or "").
    expect(wire.some((a) => a.fieldId === "q-training")).toBe(false);
  });

  it("SCALE_1_5 renders five options; WORD_LABELS renders the canvas labels", () => {
    const fields = [
      {
        fieldId: "q-small",
        kind: "rating",
        label: "Small scale",
        required: true,
        order: 0,
        ratingScheme: "SCALE_1_5",
      },
      {
        fieldId: "q-words",
        kind: "rating",
        label: "Word scale",
        required: true,
        order: 1,
        ratingScheme: "WORD_LABELS",
      },
    ] as OwnCheckInInstanceDetail["definition"]["fields"];
    render(<CheckInSubmissionPanel workspaceId="ws" detail={detail(fields)} />);

    const small = document.getElementById("ci-f-q-small") as HTMLSelectElement;
    expect([...small.options].map((o) => o.label)).toEqual([
      "—",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect([...small.options].map((o) => o.value)).toEqual([
      "",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);

    const words = document.getElementById("ci-f-q-words") as HTMLSelectElement;
    // Stored value is the 1-based label position, per CHECKIN_RATING_WORD_LABELS.
    expect([...words.options].map((o) => o.label)).toEqual([
      "—",
      "Low",
      "Okay",
      "Good",
      "Excellent",
    ]);
    expect([...words.options].map((o) => o.value)).toEqual([
      "",
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("an optional visual field stays unrendered (media answers out of scope)", () => {
    render(<CheckInSubmissionPanel workspaceId="ws" detail={detail(FIELDS)} />);
    expect(document.getElementById("ci-f-q-visuals")).toBeNull();
    expect(screen.queryByText("Progress visuals")).toBeNull();
  });

  it("the submitted view renders rating and visual answers, not '—'", () => {
    const submitted = {
      ...detail(FIELDS),
      state: "SUBMITTED",
      submittedAt: "2026-10-22T17:04:39.000Z",
      submittedAnswers: [
        {
          fieldId: "q-energy",
          kind: "LONG_TEXT",
          valueText: "Steady week.",
          valueNumeric: null,
          valueDate: null,
          valueOptionIds: null,
          valueRating: null,
          mediaIds: [],
        },
        {
          fieldId: "q-training",
          kind: "RATING",
          valueText: null,
          valueNumeric: null,
          valueDate: null,
          valueOptionIds: null,
          valueRating: 8,
          mediaIds: [],
        },
        {
          fieldId: "q-visuals",
          kind: "VISUAL",
          valueText: null,
          valueNumeric: null,
          valueDate: null,
          valueOptionIds: null,
          valueRating: null,
          mediaIds: ["m1", "m2"],
        },
      ],
      feedback: null,
    } satisfies OwnCheckInInstanceDetail;
    render(<CheckInSubmissionPanel workspaceId="ws" detail={submitted} />);
    const rows = screen
      .getByTestId("checkin-submitted-answers")
      .querySelectorAll("li");
    const text = [...rows].map((r) => r.textContent);
    expect(text).toEqual([
      "How did you feel this week?Steady week.",
      "How was your training?8 / 10",
      "Progress visuals2 visuals",
    ]);
  });
});

// Keep the action mock referenced so an accidental import-shape drift fails.
void submitCheckInInstanceAction;
