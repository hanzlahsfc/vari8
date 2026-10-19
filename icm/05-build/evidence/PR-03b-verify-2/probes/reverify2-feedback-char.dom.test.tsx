// @vitest-environment jsdom
import { appendFileSync } from "node:fs";
// PR-03b verify-2 probe: hunk 3 (feedback-thread) — CHARACTERISATION, not a pass/fail gate.
// Verifier-authored, NOT part of the PR. Records, per tree, whether the success consequences
// and the mount reconciliation's synchronous setState run from inside a passive-effect flush
// (React stack frames), plus what the DOM shows at the first commit that shows "Response sent.".
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

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

const EFFECT_FRAME = /flushPassiveEffects|commitHookEffectList|commitPassiveMount/;
const props = {
  workspaceId: "w1",
  clientProfileId: "c1",
  submissionId: "s1",
  userId: "u3",
  canSend: true,
  initialItems: [] as never,
  initialNextCursor: null,
};
const key = "checkinFeedbackDraft:u3:w1:s1";

describe("hunk 3 characterisation", () => {
  it("SUCCESS: where do the consequences run, and what does the first 'Response sent.' commit show?", async () => {
    window.sessionStorage.clear();
    const removeStacks: string[] = [];
    const realRemove = Storage.prototype.removeItem;
    const spy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, k: string) {
      if (k === key) removeStacks.push(new Error().stack ?? "");
      return realRemove.call(this, k);
    });
    vi.mocked(checkinActions.sendCheckInFeedbackAction).mockImplementation(
      (async (_p: unknown, fd: FormData) => ({
        status: "ok",
        feedbackId: "fb-2",
        sentAt: "2026-10-19T10:00:00.000Z",
        byName: "Coach",
        body: String(fd.get("body")),
      })) as never,
    );
    const { container } = render(<CheckInFeedbackThread {...props} />);
    const textarea = screen.getByTestId("checkin-feedback-input") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hello" } });
    // snapshot at the first commit showing the confirm line
    let atConfirm: { items: number; body: string } | null = null;
    const mo = new MutationObserver(() => {
      if (atConfirm !== null) return;
      if (container.querySelector('[data-testid="checkin-feedback-confirm"]')) {
        atConfirm = {
          items: container.querySelectorAll('[data-testid="checkin-feedback-item"]').length,
          body: textarea.value,
        };
      }
    });
    mo.observe(container, { subtree: true, childList: true, characterData: true });
    fireEvent.click(screen.getByTestId("checkin-feedback-send"));
    await waitFor(() => expect(window.sessionStorage.getItem(key)).toBeNull());
    await waitFor(() => expect(container.querySelectorAll('[data-testid="checkin-feedback-item"]').length).toBe(1));
    mo.disconnect();
    spy.mockRestore();
    const successInEffect = removeStacks.some((s) => EFFECT_FRAME.test(s));
    appendFileSync("/home/nexuslink/.hermes/cache/scratch/reverify2/probe3-out.txt", process.cwd().split("/").pop() + " success " + JSON.stringify({ clearMarkerCalls: removeStacks.length, clearMarkerFromPassiveEffect: successInEffect, atFirstConfirmCommit: atConfirm }) + "\n");
    expect(removeStacks.length).toBeGreaterThan(0);
  });

  it("MOUNT: is the synchronous setState path entered from a passive-effect flush?", async () => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem(key, JSON.stringify({ nonce: "n-prev", attempted: true }));
    const resolveStacks: string[] = [];
    vi.mocked(checkinActions.resolveCheckInFeedbackSendAction).mockImplementationOnce((() => {
      resolveStacks.push(new Error().stack ?? "");
      return new Promise(() => {});
    }) as never);
    render(<CheckInFeedbackThread {...props} />);
    await waitFor(() => expect(resolveStacks.length).toBe(1));
    const fromEffect = EFFECT_FRAME.test(resolveStacks[0]);
    appendFileSync("/home/nexuslink/.hermes/cache/scratch/reverify2/probe3-out.txt", process.cwd().split("/").pop() + " mount " + JSON.stringify({ resolveCalledFromPassiveEffect: fromEffect }) + "\n");
    expect(resolveStacks.length).toBe(1);
  });
});
