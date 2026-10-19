// @vitest-environment jsdom
// PR-03b re-verification probe (verifier-authored, NOT part of the PR).
// Copied temporarily into each worktree's tests/unit/, run, then removed.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
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

vi.mock(
  "@/app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/actions",
  () => ({
    sendCheckInFeedbackAction: vi.fn(),
    resolveCheckInFeedbackSendAction: vi.fn(async () => ({
      status: "unavailable",
    })),
    listStaffCheckInFeedbackAction: vi.fn(async () => ({
      status: "ok",
      items: [],
      nextCursor: null,
    })),
  }),
);

import {
  acquireDashboardSlot,
  reloadDashboardSlot,
} from "@/lib/dashboard/autosave-coordinator";
import { DashboardEditor } from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/dashboard/dashboard-editor";
import { CheckInCalendar } from "@/components/checkin/checkin-calendar";
import { CheckInFeedbackThread } from "@/components/checkin/feedback-thread";
import * as checkinActions from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/actions";

const actions = {
  save: vi.fn(async () => ({ ok: false as const })),
  reload: vi.fn(async () => ({ ok: false as const })),
} as never;

let uid = 0;
const freshUser = () => `probe-user-${++uid}`;

describe("hunk 1 dashboard-editor: edit commits on the live slot config", () => {
  const baseConfig = () =>
    ({
      version: 1 as const,
      name: "Alpha",
      widgets: [],
      layouts: {},
      widths: {},
    }) as never;

  it("PARITY: edit after a rendered reload keeps the reloaded name and adds the widget", async () => {
    const userId = freshUser();
    const reloadActions = {
      save: vi.fn(async () => ({ ok: false as const })),
      reload: vi.fn(async () => ({
        ok: true as const,
        value: {
          layout: {
            revision: 2,
            config: {
              version: 1,
              name: "RELOADED",
              widgets: [],
              layouts: {},
              widths: {},
            },
          },
        },
      })),
    } as never;
    const slot = acquireDashboardSlot({
      userId,
      workspaceId: "w1",
      clientProfileId: "c1",
      initialConfig: baseConfig(),
      initialRevision: 1,
      canEdit: true,
      actions: reloadActions,
    });
    render(
      <DashboardEditor
        userId={userId}
        workspaceId="w1"
        clientProfileId="c1"
        initialConfig={baseConfig()}
        initialRevision={1}
        canEdit
        habitChoices={Promise.resolve({ choices: [], hasMore: false })}
      />,
    );
    // the real reload path: slot write + emit, flushed by act (component re-renders)
    await act(async () => {
      await reloadDashboardSlot(slot);
    });
    expect(
      (screen.getByTestId("dashboard-name") as HTMLInputElement).value,
    ).toBe("RELOADED");
    fireEvent.change(screen.getByTestId("add-widget"), {
      target: { value: "BN01" },
    });
    expect(slot.latestConfig.name).toBe("RELOADED");
    expect(slot.latestConfig.widgets.length).toBe(1);
    fireEvent.change(screen.getByTestId("add-widget"), {
      target: { value: "BN08" },
    });
    expect(slot.latestConfig.widgets.length).toBe(2);
    expect(slot.latestConfig.name).toBe("RELOADED");
  });

  it("GAP: a slot write NOT yet re-rendered is the base of the next commit (reload not reverted)", () => {
    const userId = freshUser();
    const slot = acquireDashboardSlot({
      userId,
      workspaceId: "w1",
      clientProfileId: "c1",
      initialConfig: baseConfig(),
      initialRevision: 1,
      canEdit: true,
      actions,
    });
    render(
      <DashboardEditor
        userId={userId}
        workspaceId="w1"
        clientProfileId="c1"
        initialConfig={baseConfig()}
        initialRevision={1}
        canEdit
        habitChoices={Promise.resolve({ choices: [], hasMore: false })}
      />,
    );
    // slot write with no emit and no re-render (what reloadDashboardSlot does
    // between its await and the bump); the next event fires before React re-renders.
    slot.latestConfig = { ...slot.latestConfig, name: "RELOADED" } as never;
    fireEvent.change(screen.getByTestId("add-widget"), {
      target: { value: "BN01" },
    });
    expect(slot.latestConfig.name).toBe("RELOADED");
  });
});

describe("hunk 2 checkin-calendar: fresh load identity resets to loading", () => {
  const item = (formName: string) => ({
    instanceId: `i-${formName}`,
    formName,
    versionSeq: 1,
    dueAt: new Date().toISOString(),
    state: "SCHEDULED" as const,
    late: false,
    submittedAt: null,
  });

  it("PARITY: range (month) navigation shows Loading while the new range loads", async () => {
    const load = vi.fn(async () => ({
      status: "ok" as const,
      items: [item("Alpha")],
      truncated: false,
    }));
    render(<CheckInCalendar load={load} detailHrefBase="/d" />);
    await screen.findAllByText("Alpha");
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryAllByText("Alpha").length).toBe(0);
  });

  it("LOAD-REBIND: a fresh load identity on the same range shows Loading, not the stale result", async () => {
    const loadA = vi.fn(async () => ({
      status: "ok" as const,
      items: [item("Alpha")],
      truncated: false,
    }));
    const { rerender } = render(
      <CheckInCalendar load={loadA} detailHrefBase="/d" />,
    );
    await screen.findAllByText("Alpha");
    let resolveB: (v: unknown) => void = () => {};
    const loadB = vi.fn(
      () =>
        new Promise((res) => {
          resolveB = res;
        }),
    );
    rerender(<CheckInCalendar load={loadB as never} detailHrefBase="/d" />);
    expect(loadB).toHaveBeenCalled();
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryAllByText("Alpha").length).toBe(0);
    await act(async () => {
      resolveB({ status: "ok", items: [item("Beta")], truncated: false });
    });
    await screen.findAllByText("Beta");
  });
});

describe("hunk 3 feedback-thread: success consequences (behaviour parity)", () => {
  const props = {
    workspaceId: "w1",
    clientProfileId: "c1",
    submissionId: "s1",
    userId: "u1",
    canSend: true,
    initialItems: [] as never,
    initialNextCursor: null,
  };
  const key = "checkinFeedbackDraft:u1:w1:s1";
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("PARITY: ok send appends the row, clears the composer, rotates the nonce, clears the marker", async () => {
    vi.mocked(checkinActions.sendCheckInFeedbackAction).mockImplementation(
      (async (_prev: unknown, fd: FormData) => ({
        status: "ok",
        feedbackId: "fb-2",
        sentAt: "2026-10-19T10:00:00.000Z",
        byName: "Coach",
        body: String(fd.get("body")),
      })) as never,
    );
    const { container } = render(<CheckInFeedbackThread {...props} />);
    const textarea = screen.getByTestId(
      "checkin-feedback-input",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hello" } });
    const nonceBefore = (
      container.querySelector(
        'input[name="clientRequestId"]',
      ) as HTMLInputElement
    ).value;
    fireEvent.click(screen.getByTestId("checkin-feedback-send"));
    await waitFor(() =>
      expect(screen.getByTestId("checkin-feedback-confirm")).toBeTruthy(),
    );
    // eventual-state assertions (waitFor), not a snapshot at the first confirm
    await waitFor(() =>
      expect(screen.getAllByTestId("checkin-feedback-item").length).toBe(1),
    );
    expect(screen.getByText("Hello")).toBeTruthy();
    await waitFor(() => expect(textarea.value).toBe(""));
    await waitFor(() => {
      const nonceAfter = (
        container.querySelector(
          'input[name="clientRequestId"]',
        ) as HTMLInputElement
      ).value;
      expect(nonceAfter).not.toBe(nonceBefore);
    });
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it("PARITY: error send keeps body, appends nothing, keeps the marker", async () => {
    vi.mocked(checkinActions.sendCheckInFeedbackAction).mockImplementation(
      (async () => ({ status: "error", message: "Nope." })) as never,
    );
    render(<CheckInFeedbackThread {...props} />);
    const textarea = screen.getByTestId(
      "checkin-feedback-input",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Keep me" } });
    fireEvent.click(screen.getByTestId("checkin-feedback-send"));
    await waitFor(() =>
      expect(screen.getByTestId("checkin-feedback-error").textContent).toBe(
        "Nope.",
      ),
    );
    expect(screen.queryAllByTestId("checkin-feedback-item").length).toBe(0);
    expect(textarea.value).toBe("Keep me");
    expect(window.sessionStorage.getItem(key)).not.toBeNull();
  });
});
