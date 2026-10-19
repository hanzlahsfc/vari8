// @vitest-environment jsdom
// PR-03b fix pass 2 mount-timing probe (builder-authored, NOT part of the PR):
// with a stored marker, the "Checking…" note and the disabled composer are
// committed in the mount flush itself — the DOM-visible moment base 55a0f08
// produced via the passive-effect setState. The resolve mock never resolves,
// so any shape that defers the note into the resolve callback fails.
// Copied temporarily into tests/unit/, run, then removed.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

vi.mock(
  "@/app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/actions",
  () => ({
    sendCheckInFeedbackAction: vi.fn(),
    resolveCheckInFeedbackSendAction: vi.fn(() => new Promise(() => {})),
    listStaffCheckInFeedbackAction: vi.fn(async () => ({
      status: "ok",
      items: [],
      nextCursor: null,
    })),
  }),
);

import { CheckInFeedbackThread } from "@/components/checkin/feedback-thread";
import * as checkinActions from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/actions";

const props = {
  workspaceId: "w1",
  clientProfileId: "c1",
  submissionId: "s1",
  userId: "u-fix2",
  canSend: true,
  initialItems: [] as never,
  initialNextCursor: null,
};
const key = "checkinFeedbackDraft:u-fix2:w1:s1";

describe("feedback-thread mount timing (base parity)", () => {
  it("MOUNT TIMING: 'Checking…' and the disabled composer are in the mount flush — synchronous assertions, no findBy/waitFor", () => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ nonce: "n-prev", attempted: true }),
    );
    render(<CheckInFeedbackThread {...props} />);
    // Synchronous reads of the committed DOM right after mount: the note is
    // already there and the composer is already disabled, exactly as on base.
    expect(screen.getByTestId("checkin-feedback-checking")).toBeTruthy();
    expect(
      (screen.getByTestId("checkin-feedback-input") as HTMLTextAreaElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("checkin-feedback-send") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    // The resolve call was fired (with the stored nonce) but never resolves —
    // the note cannot have come from its callback.
    expect(
      vi.mocked(checkinActions.resolveCheckInFeedbackSendAction),
    ).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(checkinActions.resolveCheckInFeedbackSendAction).mock
        .calls[0][0],
    ).toMatchObject({ clientRequestId: "n-prev" });
  });

  it("MOUNT TIMING: no marker → no 'Checking…' note, composer usable from the mount flush", () => {
    window.sessionStorage.clear();
    render(<CheckInFeedbackThread {...props} />);
    expect(screen.queryByTestId("checkin-feedback-checking")).toBeNull();
    expect(
      (screen.getByTestId("checkin-feedback-input") as HTMLTextAreaElement)
        .disabled,
    ).toBe(false);
    expect(
      vi.mocked(checkinActions.resolveCheckInFeedbackSendAction),
    ).not.toHaveBeenCalled();
  });
});
