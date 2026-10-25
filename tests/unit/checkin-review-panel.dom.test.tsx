// FULL-PACKAGE SLICE of #171
// @vitest-environment jsdom

/**
 * Card 06 / R2-N2 — the review panel's three distinct states and its
 * change summary, rendered from the one-call review read. Open, draft
 * and answered are asserted as the chips the coach reads, not as
 * implementation flags.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckInReviewPanel } from "@/components/canvas/coach/check-in-review-panel";
import type { CheckInReviewPanelWire } from "@/components/canvas/data/checkins";
import type { CoachClient, Submission } from "@/components/canvas/coach/model";

afterEach(cleanup);

const client = {
  name: "Emma Anders",
  initials: "EA",
} as unknown as CoachClient;

const submission = {
  id: "sub-1",
  clientId: "client-1",
  date: "2026-10-19",
  eventId: "evt-1",
  type: "Full",
  answers: [{ question: "Fallback", answer: "from store" }],
  metrics: [],
  visuals: [],
  note: "",
  flags: [],
} satisfies Submission;

function panel(over: Partial<CheckInReviewPanelWire> = {}): CheckInReviewPanelWire {
  return {
    submissionId: "sub-1",
    instanceId: "inst-1",
    formName: "Weekly check-in",
    versionSeq: 1,
    dueAt: "2026-10-19T07:00:00.000Z",
    submittedAt: "2026-10-19T17:00:00.000Z",
    late: true,
    reviewed: null,
    canMark: true,
    canSend: false,
    feedback: [],
    feedbackNextCursor: null,
    fields: [
      {
        fieldId: "q-energy",
        label: "How did you feel this week?",
        kind: "longText",
        required: true,
        display: "A stronger week than the last.",
        mediaIds: [],
      },
      {
        fieldId: "q-training",
        label: "How was your training?",
        kind: "rating",
        required: true,
        display: "9 / 10",
        mediaIds: [],
      },
      {
        fieldId: "q-visuals",
        label: "Progress visuals",
        kind: "visual",
        required: false,
        display: "2 visuals",
        mediaIds: ["media-1", "media-2"],
      },
    ],
    reviewState: "open",
    changeSummary: {
      previousSubmissionId: "sub-prev",
      previousSubmittedAt: "2026-10-12T17:00:00.000Z",
      previousFormName: "Weekly check-in",
      added: [],
      removed: [
        {
          fieldId: "q-note",
          label: "Anything you would like me to know?",
          kind: "longText",
          previous: "Knee felt unsettled.",
          current: null,
        },
      ],
      changed: [
        {
          fieldId: "q-training",
          label: "How was your training?",
          kind: "rating",
          previous: "8 / 10",
          current: "9 / 10",
        },
      ],
      unchanged: 1,
    },
    flaggedTrainingNotes: [],
    ...over,
  };
}

describe("CheckInReviewPanel states (card 06)", () => {
  it("renders the open review with answers, media and change rows", () => {
    render(
      <CheckInReviewPanel
        panel={panel()}
        submission={submission}
        client={client}
        draftActive={false}
        onOpenVisual={vi.fn()}
      />,
    );
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByText("A stronger week than the last.")).toBeTruthy();
    expect(screen.getByText("media-1")).toBeTruthy();
    // The change rows carry status, label and both values.
    expect(screen.getByText("Changed")).toBeTruthy();
    expect(screen.getByText(/8 \/ 10/)).toBeTruthy();
    expect(screen.getByText("Removed")).toBeTruthy();
    expect(screen.getByText(/Knee felt unsettled\./)).toBeTruthy();
    // No feedback yet — the empty state, not a missing block.
    expect(screen.getByText("No feedback sent yet.")).toBeTruthy();
  });

  it("shows Draft while unsent feedback sits in the autosave", () => {
    render(
      <CheckInReviewPanel
        panel={panel()}
        submission={submission}
        client={client}
        draftActive
        onOpenVisual={vi.fn()}
      />,
    );
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getByText("Unsent feedback draft")).toBeTruthy();
    expect(screen.queryByText("Open")).toBeNull();
  });

  it("shows Answered with reviewer provenance and the sent thread", () => {
    render(
      <CheckInReviewPanel
        panel={panel({
          reviewState: "answered",
          reviewed: { byName: "Riley Coach", at: "2026-10-20T08:00:00.000Z" },
          feedback: [
            {
              id: "fb-1",
              sentAt: "2026-10-20T08:00:00.000Z",
              byName: "Riley Coach",
              body: "Great progress this week.",
            },
          ],
        })}
        submission={submission}
        client={client}
        draftActive
        onOpenVisual={vi.fn()}
      />,
    );
    expect(screen.getByText("Answered")).toBeTruthy();
    expect(screen.getByText(/Reviewed by Riley Coach/)).toBeTruthy();
    expect(screen.getByText("Great progress this week.")).toBeTruthy();
    expect(screen.queryByText("Draft")).toBeNull();
  });

  it("marks the first submission as having nothing to compare", () => {
    render(
      <CheckInReviewPanel
        panel={panel({ changeSummary: null })}
        submission={submission}
        client={client}
        draftActive={false}
        onOpenVisual={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/First submission of this form/),
    ).toBeTruthy();
  });

  it("treats a withheld thread as unavailable, not empty", () => {
    render(
      <CheckInReviewPanel
        panel={panel({ feedback: null })}
        submission={submission}
        client={client}
        draftActive={false}
        onOpenVisual={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/not available for your role/),
    ).toBeTruthy();
  });

  it("falls back to the stored submission while the read is out", () => {
    render(
      <CheckInReviewPanel
        panel={null}
        submission={submission}
        client={client}
        draftActive={false}
        onOpenVisual={vi.fn()}
      />,
    );
    expect(screen.getByText("from store")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
  });
});
