// @vitest-environment jsdom
// PR-03b re-verification probe #2 (verifier-authored, NOT part of the PR):
// feedback-thread MOUNT reconciliation parity (the code that still runs inside
// an async IIFE in the effect). Copied temporarily into tests/unit/, then removed.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

vi.mock(
  "@/app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/actions",
  () => ({
    sendCheckInFeedbackAction: vi.fn(),
    resolveCheckInFeedbackSendAction: vi.fn(async () => ({ status: "unavailable" })),
    listStaffCheckInFeedbackAction: vi.fn(async () => ({ status: "ok", items: [], nextCursor: null })),
  }),
);

import { CheckInFeedbackThread } from "@/components/checkin/feedback-thread";
import * as checkinActions from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/actions";

const props = {
  workspaceId: "w1",
  clientProfileId: "c1",
  submissionId: "s1",
  userId: "u2",
  canSend: true,
  initialItems: [] as never,
  initialNextCursor: null,
};
const key = "checkinFeedbackDraft:u2:w1:s1";

describe("feedback-thread mount reconciliation (parity)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem(key, JSON.stringify({ nonce: "n-prev", attempted: true }));
  });

  it("MOUNT checking: note shown while the resolve call is pending", async () => {
    vi.mocked(checkinActions.resolveCheckInFeedbackSendAction).mockImplementationOnce(
      (() => new Promise(() => {})) as never,
    );
    render(<CheckInFeedbackThread {...props} />);
    expect(await screen.findByTestId("checkin-feedback-checking")).toBeTruthy();
  });

  it("MOUNT sent: stored marker reconciles to the persisted row and clears the marker", async () => {
    vi.mocked(checkinActions.resolveCheckInFeedbackSendAction).mockResolvedValueOnce({
      status: "sent",
      feedbackId: "fb-9",
      sentAt: "2026-10-19T09:00:00.000Z",
      byName: "Coach",
      body: "Recovered body",
    } as never);
    render(<CheckInFeedbackThread {...props} />);
    await waitFor(() => expect(screen.getAllByTestId("checkin-feedback-item").length).toBe(1));
    expect(screen.getByText("Recovered body")).toBeTruthy();
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it("MOUNT not_sent: marker kept, recovered note shown", async () => {
    vi.mocked(checkinActions.resolveCheckInFeedbackSendAction).mockResolvedValueOnce({ status: "not_sent" } as never);
    render(<CheckInFeedbackThread {...props} />);
    await waitFor(() => expect(screen.getByTestId("checkin-feedback-recovered")).toBeTruthy());
    expect(window.sessionStorage.getItem(key)).not.toBeNull();
  });
});
