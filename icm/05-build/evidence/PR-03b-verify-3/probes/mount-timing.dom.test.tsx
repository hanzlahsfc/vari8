// @vitest-environment jsdom
// PR-03b verify-3 probe (verifier-authored, NOT part of the PR).
// "Checking..." mount timing. Copied temporarily into tests/unit/, then removed.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useLayoutEffect } from "react";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock(
  "@/app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/actions",
  () => ({
    sendCheckInFeedbackAction: vi.fn(),
    // never settles: the checking note must stay up for the whole probe
    resolveCheckInFeedbackSendAction: vi.fn(() => new Promise(() => {})),
    listStaffCheckInFeedbackAction: vi.fn(async () => ({
      status: "ok",
      items: [],
      nextCursor: null,
    })),
  }),
);

import { CheckInFeedbackThread } from "@/components/checkin/feedback-thread";

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

// Runs in the same commit as the thread's first DOM mutations, before any
// passive effect runs. Records whether the note is already in the DOM.
let firstCommitChecking: boolean | null = null;
function FirstCommitProbe() {
  useLayoutEffect(() => {
    if (firstCommitChecking === null) {
      firstCommitChecking =
        document.querySelector('[data-testid="checkin-feedback-checking"]') !==
        null;
    }
  }, []);
  return null;
}

describe("feedback-thread mount timing: Checking... note", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ nonce: "n-prev", attempted: true }),
    );
    firstCommitChecking = null;
  });
  afterEach(() => cleanup());

  it("T1 note + disabled composer visible synchronously after mount (no await)", () => {
    render(
      <>
        <CheckInFeedbackThread {...props} />
        <FirstCommitProbe />
      </>,
    );
    // Synchronous: no findBy/waitFor. A note deferred by a tick fails here.
    const note = screen.getByTestId("checkin-feedback-checking");
    expect(note).toBeTruthy();
    const textarea = screen.getByTestId(
      "checkin-feedback-input",
    ) as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    const send = screen.getByTestId(
      "checkin-feedback-send",
    ) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it("T2 first-commit snapshot (diagnostic, logged)", () => {
    render(
      <>
        <CheckInFeedbackThread {...props} />
        <FirstCommitProbe />
      </>,
    );
    console.log(`T2_FIRST_COMMIT_CHECKING=${firstCommitChecking}`);
    // The note must be present once mount settles, whichever commit shows it.
    expect(screen.getByTestId("checkin-feedback-checking")).toBeTruthy();
  });
});
