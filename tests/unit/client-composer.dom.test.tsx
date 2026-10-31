// @vitest-environment jsdom
// The served own-scope coach conversation (RemoteConversation + ChatComposer
// on RemoteDashboardTab) — the components /me actually mounts. Asserts the
// explicit-view read gate, direction-aware unread, the single sync path and
// send/refresh ordering against stale snapshots and account changes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const mocked = vi.hoisted(() => ({
  sendOwn: vi.fn(
    async (_w?: string, _b?: string, _m?: string[], _r?: string) => ({
      message: {
        id: "srv-1",
        senderKind: "CLIENT",
        sentAt: "2026-10-20T10:00:00Z",
        body: "",
        read: false,
        clientRequestId: "",
        attachments: [],
      },
    }),
  ),
  fetchOwn: vi.fn(
    async (_w?: string) =>
      ({ messages: [] }) as { messages: Record<string, unknown>[] },
  ),
  markRead: vi.fn(async (_w?: string) => ({ marked: 0 })),
  upload: vi.fn(
    async (_i?: Record<string, unknown>) =>
      ({
        id: "mo-1",
        name: "plan.pdf",
        type: "application/pdf",
        size: 2048,
        mediaObjectId: "mo-1",
      }) as Record<string, unknown>,
  ),
  fetchTasks: vi.fn(
    async (_w?: string, _o?: string) =>
      ({
        clientProfileId: "cp-1",
        tasks: [],
        hasMore: false,
      }) as { tasks: Record<string, unknown>[] },
  ),
  setTask: vi.fn(
    async (
      _w?: string,
      _c?: string,
      _t?: string,
      _i?: Record<string, unknown>,
    ) =>
      ({ revision: 2, status: "COMPLETED", changed: true }) as Record<
        string,
        unknown
      >,
  ),
  builder: {
    current: null as null | {
      sourceRecords: {
        tasks: { id: string; completed: boolean }[];
        messages: unknown[];
        [key: string]: unknown;
      };
      onRecordsChange: (records: never) => void;
      onMessagesRefresh?: (workspaceId: string) => void;
    },
  },
}));

vi.mock("../../components/canvas/data/messages", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("../../components/canvas/data/messages")
    >();
  return {
    ...mod,
    sendOwnMessage: (w: string, b: string, m?: string[], r?: string) =>
      mocked.sendOwn(w, b, m, r),
    fetchOwnMessages: (w: string) => mocked.fetchOwn(w),
    markOwnThreadRead: (w: string) => mocked.markRead(w),
  };
});
vi.mock("../../components/canvas/data/tasks", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("../../components/canvas/data/tasks")>();
  return {
    ...mod,
    fetchOwnTasks: (w: string, o?: string) => mocked.fetchTasks(w, o),
    setOwnTaskCompletion: (
      w: string,
      c: string,
      t: string,
      i: Record<string, unknown>,
    ) => mocked.setTask(w, c, t, i),
  };
});
vi.mock("../../components/canvas/coach/media-card", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("../../components/canvas/coach/media-card")
    >();
  return {
    ...mod,
    uploadWorkspaceMedia: (i: Record<string, unknown>) => mocked.upload(i),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// The grid itself is out of scope here — the assertions target the served
// tab's record wiring, so a prop-rendering double stands in for the canvas.
vi.mock("../../components/canvas/coach/builder/dashboard-builder", () => ({
  DashboardBuilder: (props: (typeof mocked.builder)["current"]) => {
    mocked.builder.current = props;
    return (
      <div data-testid="fake-builder">
        {props?.sourceRecords.tasks.map((task) => (
          <span key={task.id} data-testid={`task-${task.id}`}>
            {task.completed ? "done" : "open"}
          </span>
        ))}
      </div>
    );
  },
}));

import { RemoteConversation } from "../../components/canvas/coach/builder/widget-content";
import { RemoteDashboardTab } from "../../components/canvas/client-app/remote-views";
import { CoachProvider } from "../../components/canvas/coach/store";
import { writeCoachState } from "../../components/canvas/data";
import { seedState as canvasSeed } from "../../components/canvas/coach/model";
import type { CoachClient, Variant } from "../../components/canvas/coach/model";

function wire(over: Record<string, unknown> = {}) {
  return {
    id: "m-1",
    senderKind: "STAFF",
    sentAt: "2026-10-20T10:00:00Z",
    body: "from coach",
    read: false,
    clientRequestId: "",
    attachments: [],
    ...over,
  };
}

function taskWire(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    title: "Drink water",
    dueDate: "2026-10-20",
    status: "OPEN",
    dueState: "due-today",
    completedAt: null,
    assignedByMemberId: "m1",
    revision: 1,
    ...over,
  };
}

describe("served coach conversation (RemoteConversation)", () => {
  beforeEach(() => {
    cleanup();
    mocked.sendOwn.mockClear();
    mocked.sendOwn.mockResolvedValue({
      message: {
        id: "srv-1",
        senderKind: "CLIENT",
        sentAt: "2026-10-20T10:00:00Z",
        body: "",
        read: false,
        clientRequestId: "",
        attachments: [],
      },
    });
    mocked.fetchOwn.mockReset();
    mocked.fetchOwn.mockResolvedValue({ messages: [] });
    mocked.markRead.mockClear();
    mocked.markRead.mockResolvedValue({ marked: 1 });
    mocked.upload.mockReset();
    mocked.upload.mockResolvedValue({
      id: "mo-1",
      name: "plan.pdf",
      type: "application/pdf",
      size: 2048,
      mediaObjectId: "mo-1",
    } as never);
  });

  it("collapsed mount never marks read; the explicit view marks inbound once", async () => {
    mocked.fetchOwn
      .mockResolvedValueOnce({ messages: [wire()] })
      .mockResolvedValue({ messages: [wire({ read: true })] });
    render(
      <RemoteConversation workspaceId="ws-1" clientName="Amara" collapsible />,
    );
    // The unread hint lands with the loaded thread — mounted and still
    // collapsed, no mark-read may fire.
    await waitFor(() => screen.getByText(/1 unread/));
    expect(mocked.markRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /View conversation/ }));
    await waitFor(() => expect(mocked.markRead).toHaveBeenCalledTimes(1));
    expect(mocked.markRead).toHaveBeenCalledWith("ws-1");
    await new Promise((r) => setTimeout(r, 300));
    await waitFor(() => expect(screen.queryByText(/Unread/)).toBeNull());
    expect(mocked.markRead).toHaveBeenCalledTimes(1);
  });

  it("the client's own unread-to-coach send is never inbound unread", async () => {
    mocked.fetchOwn.mockResolvedValue({
      messages: [
        wire({
          id: "c1",
          senderKind: "CLIENT",
          body: "client says hi",
          read: false,
        }),
        wire({
          id: "s1",
          senderKind: "STAFF",
          body: "coach reply",
          read: true,
        }),
      ],
    });
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    await waitFor(() => screen.getByText("client says hi"));
    expect(mocked.markRead).not.toHaveBeenCalled();
    expect(screen.queryByText(/Unread/)).toBeNull();
  });

  it("an open view with inbound unread marks read once", async () => {
    mocked.fetchOwn
      .mockResolvedValueOnce({ messages: [wire()] })
      .mockResolvedValue({ messages: [wire({ read: true })] });
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    await waitFor(() => expect(mocked.markRead).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(/Unread/)).toBeNull());
    expect(mocked.markRead).toHaveBeenCalledTimes(1);
  });

  it("a failed mark-read keeps the unread badge", async () => {
    mocked.markRead.mockRejectedValueOnce(new Error("offline"));
    mocked.fetchOwn.mockResolvedValue({ messages: [wire()] });
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    await waitFor(() => expect(mocked.markRead).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Unread/)).toBeTruthy();
  });

  it("send posts through sendOwnMessage and the reply renders with one refresh", async () => {
    mocked.fetchOwn
      .mockResolvedValueOnce({ messages: [] })
      .mockResolvedValueOnce({
        messages: [
          wire({ id: "n1", senderKind: "CLIENT", body: "hello coach" }),
        ],
      });
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    await waitFor(() => screen.getByLabelText("Message"));
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "hello coach" },
    });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(mocked.sendOwn).toHaveBeenCalledTimes(1));
    const call = mocked.sendOwn.mock.calls[0] as unknown as [
      string,
      string,
      string[] | undefined,
      string | undefined,
    ];
    expect(call[0]).toBe("ws-1");
    expect(call[1]).toBe("hello coach");
    expect(typeof call[3]).toBe("string");
    await waitFor(() => screen.getByText("hello coach"));
    // Mount read + the composer's post-send snapshot — no second resync
    // trails the composer refresh.
    expect(mocked.fetchOwn).toHaveBeenCalledTimes(2);
  });

  it("a stale earlier fetch cannot overwrite the send snapshot", async () => {
    let resolveMount!: (v: { messages: Record<string, unknown>[] }) => void;
    mocked.fetchOwn
      .mockImplementationOnce(
        () =>
          new Promise<{ messages: Record<string, unknown>[] }>(
            (resolve) => (resolveMount = resolve),
          ),
      )
      .mockResolvedValueOnce({
        messages: [
          wire({ id: "n1", senderKind: "CLIENT", body: "fresh send" }),
        ],
      });
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    const input = await screen.findByLabelText("Message");
    fireEvent.change(input, { target: { value: "fresh send" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => screen.getByText("fresh send"));
    // The mount-time read resolves late without the new message — the
    // already-applied send snapshot must win.
    await act(async () => resolveMount({ messages: [] }));
    expect(screen.getByText("fresh send")).toBeTruthy();
  });

  it("a workspace change drops the previous account's pending read", async () => {
    let resolveOld!: (v: { messages: Record<string, unknown>[] }) => void;
    mocked.fetchOwn
      .mockImplementationOnce(
        () =>
          new Promise<{ messages: Record<string, unknown>[] }>(
            (resolve) => (resolveOld = resolve),
          ),
      )
      .mockResolvedValueOnce({
        messages: [wire({ id: "w2", body: "second account", read: true })],
      });
    const { rerender } = render(
      <RemoteConversation workspaceId="ws-1" clientName="Amara" />,
    );
    rerender(<RemoteConversation workspaceId="ws-2" clientName="Amara" />);
    // The ws-2 session starts collapsed — activate it to see the thread.
    fireEvent.click(
      await screen.findByRole("button", { name: /View conversation/ }),
    );
    await waitFor(() => screen.getByText("second account"));
    await act(async () =>
      resolveOld({ messages: [wire({ id: "w1", body: "first account" })] }),
    );
    expect(screen.queryByText("first account")).toBeNull();
    expect(screen.getByText("second account")).toBeTruthy();
  });

  it("a pending send from an old session never clears the new session's draft (A → B → A)", async () => {
    let resolveSend!: (v: { message: Record<string, unknown> }) => void;
    mocked.sendOwn.mockImplementationOnce(
      () =>
        new Promise<{ message: Record<string, unknown> }>(
          (resolve) => (resolveSend = resolve),
        ) as never,
    );
    mocked.fetchOwn.mockResolvedValue({ messages: [] });
    const { rerender } = render(
      <RemoteConversation
        workspaceId="ws-1"
        clientProfileId="cp-1"
        clientName="Amara"
      />,
    );
    const input = (await screen.findByLabelText("Message")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "old session send" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(mocked.sendOwn).toHaveBeenCalledTimes(1));
    // ws-1 → ws-2 → ws-1: the same identity is a NEW session.
    rerender(
      <RemoteConversation
        workspaceId="ws-2"
        clientProfileId="cp-2"
        clientName="Amara"
      />,
    );
    rerender(
      <RemoteConversation
        workspaceId="ws-1"
        clientProfileId="cp-1"
        clientName="Amara"
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /View conversation/ }),
    );
    const fresh = (await screen.findByLabelText("Message")) as HTMLInputElement;
    fireEvent.change(fresh, { target: { value: "new session draft" } });
    await act(async () =>
      resolveSend({
        message: wire({ id: "n1", senderKind: "CLIENT" }),
      }),
    );
    // The old session's success must not clear the new session's draft.
    expect(fresh.value).toBe("new session draft");
    expect(mocked.sendOwn).toHaveBeenCalledTimes(1);
  });

  it("a pending send failure from an old session never writes the new session's error", async () => {
    let rejectSend!: (e: Error) => void;
    mocked.sendOwn.mockImplementationOnce(
      () =>
        new Promise<{ message: Record<string, unknown> }>(
          (_resolve, reject) => (rejectSend = reject),
        ) as never,
    );
    mocked.fetchOwn.mockResolvedValue({ messages: [] });
    const { rerender } = render(
      <RemoteConversation
        workspaceId="ws-1"
        clientProfileId="cp-1"
        clientName="Amara"
      />,
    );
    const input = (await screen.findByLabelText("Message")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "old session send" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(mocked.sendOwn).toHaveBeenCalledTimes(1));
    rerender(
      <RemoteConversation
        workspaceId="ws-2"
        clientProfileId="cp-2"
        clientName="Amara"
      />,
    );
    rerender(
      <RemoteConversation
        workspaceId="ws-1"
        clientProfileId="cp-1"
        clientName="Amara"
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /View conversation/ }),
    );
    const fresh = (await screen.findByLabelText("Message")) as HTMLInputElement;
    fireEvent.change(fresh, { target: { value: "new session draft" } });
    await act(async () => rejectSend(new Error("boom")));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fresh.value).toBe("new session draft");
  });

  it("an open conversation never transfers to the next account", async () => {
    mocked.fetchOwn
      .mockResolvedValueOnce({ messages: [wire({ read: true })] })
      .mockResolvedValueOnce({ messages: [wire()] })
      .mockResolvedValue({ messages: [wire({ read: true })] });
    const { rerender } = render(
      <RemoteConversation workspaceId="ws-1" clientName="Amara" collapsible />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /View conversation/ }),
    );
    await waitFor(() => screen.getByText("from coach"));
    rerender(
      <RemoteConversation workspaceId="ws-2" clientName="Amara" collapsible />,
    );
    // The new account arrives collapsed — the previous account's open
    // state does not transfer, so ws-2 cannot be marked without a fresh
    // activation.
    await waitFor(() =>
      screen.getByRole("button", { name: /View conversation/ }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mocked.markRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /View conversation/ }));
    await waitFor(() => expect(mocked.markRead).toHaveBeenCalledWith("ws-2"));
    expect(mocked.markRead).toHaveBeenCalledTimes(1);
  });

  it("a pending read on the old account cannot block the new account's read", async () => {
    let resolveMark!: (v: { marked: number }) => void;
    mocked.markRead.mockImplementationOnce(
      () =>
        new Promise<{ marked: number }>(
          (resolve) => (resolveMark = resolve),
        ) as never,
    );
    mocked.fetchOwn
      .mockResolvedValueOnce({ messages: [wire()] })
      .mockResolvedValueOnce({ messages: [wire()] })
      .mockResolvedValue({ messages: [wire({ read: true })] });
    const { rerender } = render(
      <RemoteConversation workspaceId="ws-1" clientName="Amara" />,
    );
    await waitFor(() => expect(mocked.markRead).toHaveBeenCalledWith("ws-1"));
    // ws-1's read POST is still in flight when the identity changes; the
    // new session must perform its own read after its own activation.
    rerender(<RemoteConversation workspaceId="ws-2" clientName="Amara" />);
    fireEvent.click(
      await screen.findByRole("button", { name: /View conversation/ }),
    );
    await waitFor(() => expect(mocked.markRead).toHaveBeenCalledWith("ws-2"));
    expect(mocked.markRead).toHaveBeenCalledTimes(2);
    await act(async () => resolveMark({ marked: 1 }));
  });

  it("a pending send from the old workspace never touches the new account", async () => {
    let resolveSend!: (v: { message: Record<string, unknown> }) => void;
    mocked.sendOwn.mockImplementationOnce(
      () =>
        new Promise<{ message: Record<string, unknown> }>(
          (resolve) => (resolveSend = resolve),
        ) as never,
    );
    mocked.fetchOwn.mockResolvedValueOnce({ messages: [] }).mockResolvedValue({
      messages: [wire({ id: "w2", body: "ws-2 thread", read: true })],
    });
    const { rerender } = render(
      <RemoteConversation workspaceId="ws-1" clientName="Amara" />,
    );
    const input = (await screen.findByLabelText("Message")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "old account send" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(mocked.sendOwn).toHaveBeenCalledTimes(1));
    // The account switches while the old send is in flight.
    rerender(<RemoteConversation workspaceId="ws-2" clientName="Amara" />);
    fireEvent.click(
      await screen.findByRole("button", { name: /View conversation/ }),
    );
    await waitFor(() => screen.getByText("ws-2 thread"));
    // The old send resolves — its snapshot, draft, error and pending flag
    // all belong to the old account and must not land here.
    await act(async () =>
      resolveSend({
        message: {
          id: "n1",
          senderKind: "CLIENT",
          sentAt: "2026-10-21T10:00:00Z",
          body: "old account send",
          read: false,
          clientRequestId: "",
          attachments: [],
        },
      }),
    );
    expect(screen.queryByText("old account send")).toBeNull();
    expect(screen.getByText("ws-2 thread")).toBeTruthy();
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe(
      "",
    );
    // mount ws-1 + mount ws-2 — the discarded account issues no refresh.
    expect(mocked.fetchOwn).toHaveBeenCalledTimes(2);
    expect(
      mocked.fetchOwn.mock.calls.filter((call) => call[0] === "ws-1"),
    ).toHaveLength(1);
  });

  it("a stale post-send snapshot cannot resurrect unread or re-mark", async () => {
    let resolveMark!: (v: { marked: number }) => void;
    mocked.markRead.mockImplementationOnce(
      () => new Promise<{ marked: number }>((r) => (resolveMark = r)),
    );
    const fetches: ((v: { messages: Record<string, unknown>[] }) => void)[] =
      [];
    mocked.fetchOwn.mockImplementation(
      () =>
        new Promise<{ messages: Record<string, unknown>[] }>((r) =>
          fetches.push(r),
        ),
    );
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    await waitFor(() => expect(fetches.length).toBe(1));
    await act(async () => fetches[0]({ messages: [wire()] }));
    await waitFor(() => expect(mocked.markRead).toHaveBeenCalledTimes(1));
    // A send lands while the read POST is in flight — its refresh queues
    // behind the read marker's resync.
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "mid-flight" },
    });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(mocked.sendOwn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetches.length).toBe(2));
    await act(async () => resolveMark({ marked: 1 }));
    await waitFor(() => expect(fetches.length).toBe(3));
    // The earlier refresh lands last carrying the pre-read snapshot —
    // the shared ticket must discard it.
    await act(async () =>
      fetches[1]({
        messages: [
          wire(),
          wire({ id: "n1", senderKind: "CLIENT", body: "mid-flight" }),
        ],
      }),
    );
    await act(async () =>
      fetches[2]({
        messages: [
          wire({ read: true }),
          wire({ id: "n1", senderKind: "CLIENT", body: "mid-flight" }),
        ],
      }),
    );
    expect(screen.getByText("mid-flight")).toBeTruthy();
    expect(screen.queryByText(/Unread/)).toBeNull();
    expect(mocked.markRead).toHaveBeenCalledTimes(1);
  });

  it("a profile switch on an open surface requires fresh activation", async () => {
    mocked.fetchOwn
      .mockResolvedValueOnce({ messages: [wire()] })
      .mockResolvedValueOnce({ messages: [wire({ read: true })] })
      .mockResolvedValueOnce({ messages: [wire()] })
      .mockResolvedValue({ messages: [wire({ read: true })] });
    const { rerender } = render(
      <RemoteConversation
        workspaceId="ws-1"
        clientProfileId="cp-1"
        clientName="Amara"
      />,
    );
    await waitFor(() => expect(mocked.markRead).toHaveBeenCalledTimes(1));
    rerender(
      <RemoteConversation
        workspaceId="ws-1"
        clientProfileId="cp-2"
        clientName="Amara"
      />,
    );
    // Same workspace, new profile = a new session: the open thread renders
    // collapsed until this session activates it — even on the same surface.
    await waitFor(() =>
      screen.getByRole("button", { name: /View conversation/ }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mocked.markRead).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /View conversation/ }));
    await waitFor(() => expect(mocked.markRead).toHaveBeenCalledTimes(2));
  });

  it("home activation never survives A → B → A", async () => {
    mocked.fetchOwn
      .mockResolvedValueOnce({ messages: [wire({ read: true })] })
      .mockResolvedValueOnce({ messages: [] })
      .mockResolvedValueOnce({ messages: [wire()] })
      .mockResolvedValue({ messages: [wire({ read: true })] });
    const { rerender } = render(
      <RemoteConversation workspaceId="ws-1" clientName="Amara" collapsible />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /View conversation/ }),
    );
    await waitFor(() => screen.getByText("from coach"));
    rerender(
      <RemoteConversation workspaceId="ws-2" clientName="Amara" collapsible />,
    );
    await waitFor(() =>
      screen.getByRole("button", { name: /View conversation/ }),
    );
    rerender(
      <RemoteConversation workspaceId="ws-1" clientName="Amara" collapsible />,
    );
    // Back on ws-1 is a NEW session — the earlier activation does not
    // transfer, so ws-1's fresh unread cannot be marked without a fresh
    // activation.
    await waitFor(() =>
      screen.getByRole("button", { name: /View conversation/ }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mocked.markRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /View conversation/ }));
    await waitFor(() => expect(mocked.markRead).toHaveBeenCalledWith("ws-1"));
    expect(mocked.markRead).toHaveBeenCalledTimes(1);
  });

  it("attach uploads, links media_object ids and clears after send", async () => {
    const file = new File(["pdf-bytes"], "plan.pdf", {
      type: "application/pdf",
    });
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    const input = await screen.findByLabelText("Message");
    fireEvent.change(screen.getByLabelText("Attach files"), {
      target: { files: [file] },
    });
    await waitFor(() => screen.getByText("plan.pdf"));
    await waitFor(() => expect(screen.queryByText(/uploading/)).toBeNull());
    expect(mocked.upload).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: "with file" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(mocked.sendOwn).toHaveBeenCalledTimes(1));
    expect(
      (
        mocked.sendOwn.mock.calls[0] as unknown as [
          string,
          string,
          string[] | undefined,
          string | undefined,
        ]
      )[2],
    ).toEqual(["mo-1"]);
    await waitFor(() => expect(screen.queryByText("plan.pdf")).toBeNull());
  });

  it("a failed upload blocks send until removed", async () => {
    mocked.upload.mockRejectedValueOnce(new Error("too large"));
    const file = new File(["x"], "big.zip", { type: "application/zip" });
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "text only" },
    });
    fireEvent.change(screen.getByLabelText("Attach files"), {
      target: { files: [file] },
    });
    await waitFor(() => screen.getByText(/upload failed/));
    fireEvent.click(screen.getByLabelText("Send"));
    await screen.findByRole("alert");
    expect(mocked.sendOwn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Remove big.zip"));
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(mocked.sendOwn).toHaveBeenCalledTimes(1));
    expect(
      (
        mocked.sendOwn.mock.calls[0] as unknown as [
          string,
          string,
          string[] | undefined,
          string | undefined,
        ]
      )[2],
    ).toEqual([]);
  });

  it("an account switch during upload discards the staged media", async () => {
    let resolveUpload!: (v: Record<string, unknown>) => void;
    mocked.upload.mockImplementationOnce(
      () =>
        new Promise<Record<string, unknown>>(
          (resolve) => (resolveUpload = resolve),
        ),
    );
    const file = new File(["x"], "plan.pdf", { type: "application/pdf" });
    const { rerender } = render(
      <RemoteConversation workspaceId="ws-1" clientName="Amara" />,
    );
    fireEvent.change(await screen.findByLabelText("Attach files"), {
      target: { files: [file] },
    });
    await waitFor(() => screen.getByText(/uploading/));
    rerender(<RemoteConversation workspaceId="ws-2" clientName="Amara" />);
    fireEvent.click(
      await screen.findByRole("button", { name: /View conversation/ }),
    );
    await act(async () =>
      resolveUpload({
        id: "mo-1",
        name: "plan.pdf",
        type: "application/pdf",
        size: 4,
        mediaObjectId: "mo-1",
      }),
    );
    // The old session's upload never lands on the new session's composer.
    expect(screen.queryByText("plan.pdf")).toBeNull();
  });

  it("a received attachment renders its authorized download card", async () => {
    mocked.fetchOwn.mockResolvedValueOnce({
      messages: [
        wire({
          read: true,
          attachments: [
            {
              mediaObjectId: "mo-9",
              fileName: "report.pdf",
              contentType: "application/pdf",
              byteSize: 512,
              position: 0,
            },
          ],
        }),
      ],
    });
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    await waitFor(() => expect(screen.getByText("report.pdf")).toBeTruthy());
  });

  it("an unchanged retry reuses the request id; an edited payload mints a new one", async () => {
    mocked.sendOwn.mockRejectedValueOnce(new Error("offline"));
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    const input = (await screen.findByLabelText("Message")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await screen.findByRole("alert");
    const firstKey = (mocked.sendOwn.mock.calls[0] as unknown as string[])[3];
    // Unchanged payload: retry is idempotent on the same key.
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(mocked.sendOwn).toHaveBeenCalledTimes(2));
    expect((mocked.sendOwn.mock.calls[1] as unknown as string[])[3]).toBe(
      firstKey,
    );
    // Edited text is a new logical payload — a response-lost success of
    // the first request can never clear this newer content.
    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(mocked.sendOwn).toHaveBeenCalledTimes(3));
    expect((mocked.sendOwn.mock.calls[2] as unknown as string[])[3]).not.toBe(
      firstKey,
    );
  });

  it("adding an attachment mints a new payload key", async () => {
    const file = new File(["x"], "plan.pdf", { type: "application/pdf" });
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    const input = (await screen.findByLabelText("Message")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "note" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(mocked.sendOwn).toHaveBeenCalledTimes(1));
    const firstKey = (mocked.sendOwn.mock.calls[0] as unknown as string[])[3];
    fireEvent.change(screen.getByLabelText("Attach files"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(screen.queryByText(/uploading/)).toBeNull());
    fireEvent.change(input, { target: { value: "note" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(mocked.sendOwn).toHaveBeenCalledTimes(2));
    expect((mocked.sendOwn.mock.calls[1] as unknown as string[])[3]).not.toBe(
      firstKey,
    );
    expect(
      (
        mocked.sendOwn.mock.calls[1] as unknown as [string, string, string[]]
      )[2],
    ).toEqual(["mo-1"]);
  });

  it("removing a chip during upload cancels it and frees the composer", async () => {
    let resolveUpload!: (v: Record<string, unknown>) => void;
    mocked.upload.mockImplementationOnce(
      () =>
        new Promise<Record<string, unknown>>(
          (resolve) => (resolveUpload = resolve),
        ),
    );
    const file = new File(["x"], "slow.pdf", { type: "application/pdf" });
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    fireEvent.change(await screen.findByLabelText("Attach files"), {
      target: { files: [file] },
    });
    await waitFor(() => screen.getByText(/uploading/));
    // Remove while pending — aborts the fetch and frees the composer.
    fireEvent.click(screen.getByLabelText("Remove slow.pdf"));
    expect(screen.queryByText(/uploading/)).toBeNull();
    const input = (await screen.findByLabelText("Message")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "just text" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(mocked.sendOwn).toHaveBeenCalledTimes(1));
    // A late completion can never restore the chip or link its media.
    await act(async () =>
      resolveUpload({
        id: "mo-x",
        name: "slow.pdf",
        type: "application/pdf",
        size: 4,
        mediaObjectId: "mo-x",
      }),
    );
    expect(screen.queryByText("slow.pdf")).toBeNull();
    expect(
      (
        mocked.sendOwn.mock.calls[0] as unknown as [string, string, string[]]
      )[2],
    ).toEqual([]);
  });

  it("two overlapping 6-file selections never exceed 10 staged", async () => {
    mocked.upload.mockImplementation(
      async (i) =>
        ({
          id: `mo-${(i as { fileName: string }).fileName}`,
          name: (i as { fileName: string }).fileName,
          type: "application/pdf",
          size: 4,
          mediaObjectId: `mo-${(i as { fileName: string }).fileName}`,
        }) as Record<string, unknown>,
    );
    const six = (o: number) =>
      Array.from(
        { length: 6 },
        (_, i) => new File(["x"], `f${o + i}.pdf`, { type: "application/pdf" }),
      );
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    const picker = await screen.findByLabelText("Attach files");
    fireEvent.change(picker, { target: { files: six(0) } });
    fireEvent.change(picker, { target: { files: six(6) } });
    await waitFor(() => screen.getByText(/up to 10 attachments/));
    await waitFor(() => screen.getByText("f9.pdf"));
    expect(mocked.upload).toHaveBeenCalledTimes(10);
    expect(screen.queryByText("f11.pdf")).toBeNull();
  });

  it("the over-limit alert clears once the staged count is back under the cap", async () => {
    mocked.upload.mockImplementation(
      async (i) =>
        ({
          id: `mo-${(i as { fileName: string }).fileName}`,
          name: (i as { fileName: string }).fileName,
          type: "application/pdf",
          size: 4,
          mediaObjectId: `mo-${(i as { fileName: string }).fileName}`,
        }) as Record<string, unknown>,
    );
    const files = Array.from(
      { length: 11 },
      (_, i) => new File(["x"], `g${i}.pdf`, { type: "application/pdf" }),
    );
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    fireEvent.change(await screen.findByLabelText("Attach files"), {
      target: { files },
    });
    await waitFor(() => screen.getByText(/up to 10 attachments/));
    fireEvent.click(await screen.findByLabelText("Remove g0.pdf"));
    expect(screen.queryByText(/up to 10 attachments/)).toBeNull();
  });

  it("Enter sends, Shift+Enter inserts a newline, IME Enter never sends", async () => {
    mocked.sendOwn.mockClear();
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    const input = (await screen.findByLabelText(
      "Message",
    )) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "line1" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(mocked.sendOwn).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(mocked.sendOwn).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(mocked.sendOwn).toHaveBeenCalledTimes(1));
  });

  it("stages at most 10 attachments and explains the limit", async () => {
    mocked.upload.mockImplementation(
      async (i) =>
        ({
          id: "mo-1",
          name: (i as { fileName: string }).fileName,
          type: "application/pdf",
          size: 4,
          mediaObjectId: "mo-1",
        }) as Record<string, unknown>,
    );
    const files = Array.from(
      { length: 12 },
      (_, i) => new File(["x"], `f${i}.pdf`, { type: "application/pdf" }),
    );
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    fireEvent.change(await screen.findByLabelText("Attach files"), {
      target: { files },
    });
    await waitFor(() => screen.getByText(/up to 10 attachments/));
    await waitFor(() => screen.getByText("f9.pdf"));
    expect(screen.queryByText("f10.pdf")).toBeNull();
    expect(mocked.upload).toHaveBeenCalledTimes(10);
  });

  it("rejects an unsupported type before upload", async () => {
    const file = new File(["x"], "app.exe", {
      type: "application/x-msdownload",
    });
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    fireEvent.change(await screen.findByLabelText("Attach files"), {
      target: { files: [file] },
    });
    await waitFor(() => screen.getByText(/upload failed/));
    expect(mocked.upload).not.toHaveBeenCalled();
  });

  it("clearing the last failed chip clears the upload error", async () => {
    mocked.upload.mockRejectedValue(new Error("x"));
    const a = new File(["x"], "a.pdf", { type: "application/pdf" });
    const b = new File(["x"], "b.pdf", { type: "application/pdf" });
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    fireEvent.change(await screen.findByLabelText("Attach files"), {
      target: { files: [a, b] },
    });
    await waitFor(() => screen.getByLabelText("Remove b.pdf"));
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "note" },
    });
    fireEvent.click(screen.getByLabelText("Send"));
    await screen.findByRole("alert");
    // One failed chip removed — the error stays while the other remains.
    fireEvent.click(screen.getByLabelText("Remove a.pdf"));
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Remove b.pdf"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("malformed attachment metadata degrades without crashing the thread", async () => {
    mocked.fetchOwn.mockResolvedValueOnce({
      messages: [
        wire({
          read: true,
          attachments: [
            { fileName: "no-id.pdf" },
            null,
            {
              mediaObjectId: "mo-x",
              fileName: "ok.pdf",
              contentType: 123,
              byteSize: "big",
            },
          ],
        }),
      ],
    });
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    await waitFor(() =>
      expect(screen.getAllByText("An attachment is unavailable.")).toHaveLength(
        2,
      ),
    );
    expect(screen.getByText("from coach")).toBeTruthy();
  });

  it("removing the first of three uploads lets the rest of the batch complete", async () => {
    const resolvers = new Map<string, (v: Record<string, unknown>) => void>();
    mocked.upload.mockImplementation(
      (i) =>
        new Promise<Record<string, unknown>>((resolve) => {
          resolvers.set((i as { fileName: string }).fileName, resolve);
        }),
    );
    const file = (n: string) => new File(["x"], n, { type: "application/pdf" });
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    fireEvent.change(await screen.findByLabelText("Attach files"), {
      target: { files: [file("a.pdf"), file("b.pdf"), file("c.pdf")] },
    });
    await waitFor(() => expect(mocked.upload).toHaveBeenCalledTimes(1));
    // Remove the active upload — its siblings must still proceed.
    fireEvent.click(screen.getByLabelText("Remove a.pdf"));
    await act(async () =>
      resolvers.get("a.pdf")!({
        id: "mo-a",
        name: "a.pdf",
        type: "application/pdf",
        size: 4,
        mediaObjectId: "mo-a",
      }),
    );
    await waitFor(() => expect(mocked.upload).toHaveBeenCalledTimes(2));
    await act(async () =>
      resolvers.get("b.pdf")!({
        id: "mo-b",
        name: "b.pdf",
        type: "application/pdf",
        size: 4,
        mediaObjectId: "mo-b",
      }),
    );
    await waitFor(() => expect(mocked.upload).toHaveBeenCalledTimes(3));
    await act(async () =>
      resolvers.get("c.pdf")!({
        id: "mo-c",
        name: "c.pdf",
        type: "application/pdf",
        size: 4,
        mediaObjectId: "mo-c",
      }),
    );
    // No chip remains stranded in pending.
    await waitFor(() => expect(screen.queryByText(/uploading/)).toBeNull());
    expect(screen.getByText("b.pdf")).toBeTruthy();
    expect(screen.getByText("c.pdf")).toBeTruthy();
    expect(screen.queryByText("a.pdf")).toBeNull();
  });

  it("removing a queued file keeps the batch progressing", async () => {
    const resolvers = new Map<string, (v: Record<string, unknown>) => void>();
    mocked.upload.mockImplementation(
      (i) =>
        new Promise<Record<string, unknown>>((resolve) => {
          resolvers.set((i as { fileName: string }).fileName, resolve);
        }),
    );
    const file = (n: string) => new File(["x"], n, { type: "application/pdf" });
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    fireEvent.change(await screen.findByLabelText("Attach files"), {
      target: { files: [file("a.pdf"), file("b.pdf"), file("c.pdf")] },
    });
    await waitFor(() => expect(mocked.upload).toHaveBeenCalledTimes(1));
    // Remove a still-queued file before it ever starts.
    fireEvent.click(screen.getByLabelText("Remove c.pdf"));
    await act(async () =>
      resolvers.get("a.pdf")!({
        id: "mo-a",
        name: "a.pdf",
        type: "application/pdf",
        size: 4,
        mediaObjectId: "mo-a",
      }),
    );
    await waitFor(() => expect(mocked.upload).toHaveBeenCalledTimes(2));
    await act(async () =>
      resolvers.get("b.pdf")!({
        id: "mo-b",
        name: "b.pdf",
        type: "application/pdf",
        size: 4,
        mediaObjectId: "mo-b",
      }),
    );
    // c was cancelled before upload — the batch still settles clean.
    expect(mocked.upload).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByText(/uploading/)).toBeNull());
    expect(screen.queryByText("c.pdf")).toBeNull();
  });

  it("an identity change cancels the whole pending batch safely", async () => {
    let resolveUpload!: (v: Record<string, unknown>) => void;
    mocked.upload.mockImplementationOnce(
      () =>
        new Promise<Record<string, unknown>>(
          (resolve) => (resolveUpload = resolve),
        ),
    );
    const file = (n: string) => new File(["x"], n, { type: "application/pdf" });
    const { rerender } = render(
      <RemoteConversation workspaceId="ws-1" clientName="Amara" />,
    );
    fireEvent.change(await screen.findByLabelText("Attach files"), {
      target: { files: [file("a.pdf"), file("b.pdf")] },
    });
    await waitFor(() =>
      expect(screen.queryAllByText(/uploading/).length).toBeGreaterThan(0),
    );
    rerender(<RemoteConversation workspaceId="ws-2" clientName="Amara" />);
    fireEvent.click(
      await screen.findByRole("button", { name: /View conversation/ }),
    );
    // The old session's batch resolves late — nothing lands, no chips
    // restore, no unhandled rejection.
    await act(async () =>
      resolveUpload({
        id: "mo-a",
        name: "a.pdf",
        type: "application/pdf",
        size: 4,
        mediaObjectId: "mo-a",
      }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(screen.queryByText("a.pdf")).toBeNull();
    expect(screen.queryByText("b.pdf")).toBeNull();
  });

  it("the real coach MediaCard survives malformed metadata", async () => {
    const { MediaCard: CoachCard } =
      await import("../../components/canvas/coach/media");
    render(
      <CoachProvider>
        <CoachCard
          item={{
            id: "mo-x",
            name: "report.pdf",
            type: 123 as unknown as string,
            size: 4,
            mediaObjectId: "mo-x",
          }}
        />
      </CoachProvider>,
    );
    expect(screen.getByText("report.pdf")).toBeTruthy();
    // toCanvasMessage degrades malformed wire metadata safely.
    const { toCanvasMessage } =
      await import("../../components/canvas/data/messages");
    const view = toCanvasMessage(
      {
        id: "m1",
        body: "hi",
        senderKind: "STAFF",
        sentAt: "x",
        read: true,
        clientRequestId: "r1",
        attachments: [
          {
            mediaObjectId: 1,
            fileName: null,
            contentType: 123,
            byteSize: "big",
          } as never,
        ],
      } as never,
      "cp-1",
    );
    expect(view.attachments[0].name).toBe("attachment unavailable");
    expect(view.attachments[0].type).toBe("");
  });

  it("failed send keeps the draft and shows an accessible error; retry reuses the key", async () => {
    mocked.sendOwn.mockRejectedValueOnce(new Error("boom"));
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    const input = (await screen.findByLabelText("Message")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "retry me" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await screen.findByRole("alert");
    expect(input.value).toBe("retry me");
    const firstKey = (
      mocked.sendOwn.mock.calls[0] as unknown as [
        string,
        string,
        string[] | undefined,
        string | undefined,
      ]
    )[3];
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(mocked.sendOwn).toHaveBeenCalledTimes(2));
    expect(
      (
        mocked.sendOwn.mock.calls[1] as unknown as [
          string,
          string,
          string[] | undefined,
          string | undefined,
        ]
      )[3],
    ).toBe(firstKey);
  });

  it("send success + refresh failure clears the draft without resending", async () => {
    mocked.fetchOwn
      .mockResolvedValueOnce({ messages: [] })
      .mockRejectedValueOnce(new Error("offline"));
    render(<RemoteConversation workspaceId="ws-1" clientName="Amara" />);
    const input = (await screen.findByLabelText("Message")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sent but no refresh" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(input.value).toBe(""));
    expect(mocked.sendOwn).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("served dashboard tab (RemoteDashboardTab)", () => {
  const variant = {
    id: "variant-test",
    name: "Test variant",
    nutrition: "Meal plan",
    views: [
      "Dashboard",
      "Tracker",
      "Nutrition",
      "Timeline / Roadmap",
      "Training Program",
      "Check-In",
    ],
    habits: false,
    widgets: [],
    fields: [],
    roadmap: [],
    training: { fields: [], volume: true, breakdown: "", presentation: "" },
    questions: [],
    summaries: [],
  } as unknown as Variant;
  const client = canvasSeed().clients[0] as CoachClient;
  const own = { workspaceId: "ws-1", clientProfileId: "cp-1" };

  function mountTab(identity = own) {
    writeCoachState({ ...canvasSeed(), hydrated: true } as never);
    return render(
      <CoachProvider>
        <RemoteDashboardTab
          configuration={variant}
          client={client}
          own={identity}
        />
      </CoachProvider>,
    );
  }

  function toggle(taskId = "t1", completed = true) {
    act(() =>
      builderProps().onRecordsChange({
        ...builderProps().sourceRecords,
        tasks: builderProps().sourceRecords.tasks.map((task) =>
          task.id === taskId ? { ...task, completed } : task,
        ),
      } as never),
    );
  }

  beforeEach(() => {
    cleanup();
    mocked.fetchTasks.mockReset();
    mocked.fetchTasks.mockResolvedValue({
      clientProfileId: "cp-1",
      tasks: [taskWire()],
      hasMore: false,
    } as never);
    mocked.setTask.mockReset();
    mocked.setTask.mockResolvedValue({
      revision: 2,
      status: "COMPLETED",
      changed: true,
    });
    mocked.fetchOwn.mockReset();
    mocked.fetchOwn.mockResolvedValue({ messages: [] });
    mocked.markRead.mockClear();
    mocked.builder.current = null;
  });

  function builderProps() {
    return mocked.builder.current!;
  }

  it("a message sync cannot revert an in-flight task toggle", async () => {
    let resolveWrite!: (v: Record<string, unknown>) => void;
    mocked.setTask.mockImplementationOnce(
      () =>
        new Promise<Record<string, unknown>>(
          (resolve) => (resolveWrite = resolve),
        ),
    );
    mountTab();
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("open"),
    );
    act(() =>
      builderProps().onRecordsChange({
        ...builderProps().sourceRecords,
        tasks: builderProps().sourceRecords.tasks.map((task) => ({
          ...task,
          completed: true,
        })),
      } as never),
    );
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("done"),
    );
    expect(mocked.setTask).toHaveBeenCalledTimes(1);
    // The composer's wire snapshot lands mid-write — the optimistic toggle
    // lives in the parent's wire state, so the rebuild cannot paint it back.
    await act(async () => builderProps().onMessagesRefresh?.("ws-1"));
    expect(screen.getByTestId("task-t1").textContent).toBe("done");
    await act(async () =>
      resolveWrite({ revision: 2, status: "COMPLETED", changed: true }),
    );
    expect(screen.getByTestId("task-t1").textContent).toBe("done");
  });

  it("a failed toggle write drops back to wire truth", async () => {
    mocked.setTask.mockRejectedValueOnce(new Error("offline"));
    mountTab();
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("open"),
    );
    act(() =>
      builderProps().onRecordsChange({
        ...builderProps().sourceRecords,
        tasks: builderProps().sourceRecords.tasks.map((task) => ({
          ...task,
          completed: true,
        })),
      } as never),
    );
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("done"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("open"),
    );
  });

  it("message edits on the records channel trigger no second resync", async () => {
    mountTab();
    await waitFor(() => expect(mocked.fetchOwn).toHaveBeenCalledTimes(1));
    act(() =>
      builderProps().onRecordsChange({
        ...builderProps().sourceRecords,
        messages: [
          {
            id: "x",
            date: "2026-10-20",
            sender: "Coach",
            excerpt: "edited locally",
            unread: true,
          },
        ],
      } as never),
    );
    expect(mocked.fetchOwn).toHaveBeenCalledTimes(1);
  });

  it("a same-workspace profile change starts a new lifecycle", async () => {
    const { rerender } = mountTab();
    await waitFor(() => expect(mocked.fetchTasks).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocked.fetchOwn).toHaveBeenCalledTimes(1));
    rerender(
      <CoachProvider>
        <RemoteDashboardTab
          configuration={variant}
          client={client}
          own={{ workspaceId: "ws-1", clientProfileId: "cp-2" }}
        />
      </CoachProvider>,
    );
    // Same workspace, different client profile = a different account: the
    // thread and tasks reload under the new session.
    await waitFor(() => expect(mocked.fetchTasks).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocked.fetchOwn).toHaveBeenCalledTimes(2));
  });

  it("rapid same-task toggles serialize on the confirmed revision", async () => {
    let resolveFirst!: (v: Record<string, unknown>) => void;
    let resolveSecond!: (v: Record<string, unknown>) => void;
    mocked.setTask
      .mockImplementationOnce(
        () =>
          new Promise<Record<string, unknown>>(
            (resolve) => (resolveFirst = resolve),
          ),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Record<string, unknown>>(
            (resolve) => (resolveSecond = resolve),
          ),
      );
    mountTab();
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("open"),
    );
    toggle();
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("done"),
    );
    toggle("t1", false);
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("open"),
    );
    // The second intent queues behind the first write — no stale-revision
    // PATCH is issued concurrently.
    expect(mocked.setTask).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolveFirst({ revision: 2, status: "COMPLETED", changed: true }),
    );
    await waitFor(() => expect(mocked.setTask).toHaveBeenCalledTimes(2));
    expect(
      (mocked.setTask.mock.calls[1][3] as { expectedRevision: number })
        .expectedRevision,
    ).toBe(2);
    await act(async () =>
      resolveSecond({ revision: 3, status: "OPEN", changed: true }),
    );
    // The last intent wins and the revision chain stayed monotonic.
    expect(screen.getByTestId("task-t1").textContent).toBe("open");
  });

  it("a failed queued write reverts to the latest confirmed wire", async () => {
    mocked.setTask
      .mockResolvedValueOnce({
        revision: 2,
        status: "COMPLETED",
        changed: true,
      })
      .mockRejectedValueOnce(new Error("conflict"));
    mountTab();
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("open"),
    );
    toggle();
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("done"),
    );
    await waitFor(() => expect(mocked.setTask).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("done"),
    );
    toggle("t1", false);
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("open"),
    );
    await waitFor(() => expect(mocked.setTask).toHaveBeenCalledTimes(2));
    expect(
      (mocked.setTask.mock.calls[1][3] as { expectedRevision: number })
        .expectedRevision,
    ).toBe(2);
    // The queued write fails — the paint reverts to the confirmed
    // revision-2 state, not the closed-over revision-1 snapshot.
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("done"),
    );
  });

  it("a late old-session success cannot regress the confirmed revision", async () => {
    let resolveOld!: (v: Record<string, unknown>) => void;
    mocked.setTask
      .mockImplementationOnce(
        () =>
          new Promise<Record<string, unknown>>(
            (resolve) => (resolveOld = resolve),
          ) as never,
      )
      .mockResolvedValue({ revision: 3, status: "COMPLETED", changed: true });
    mocked.fetchTasks
      .mockResolvedValueOnce({
        clientProfileId: "cp-1",
        tasks: [taskWire()],
        hasMore: false,
      } as never)
      .mockResolvedValueOnce({
        clientProfileId: "cp-2",
        tasks: [taskWire({ id: "t2" })],
        hasMore: false,
      } as never)
      .mockResolvedValue({
        clientProfileId: "cp-1",
        tasks: [taskWire({ revision: 2 })],
        hasMore: false,
      } as never);
    const { rerender } = mountTab();
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("open"),
    );
    toggle();
    await waitFor(() => expect(mocked.setTask).toHaveBeenCalledTimes(1));
    // ws-1 → ws-2 → ws-1: a new session reloads the task at revision 2.
    rerender(
      <CoachProvider>
        <RemoteDashboardTab
          configuration={variant}
          client={client}
          own={{ workspaceId: "ws-2", clientProfileId: "cp-2" }}
        />
      </CoachProvider>,
    );
    rerender(
      <CoachProvider>
        <RemoteDashboardTab
          configuration={variant}
          client={client}
          own={{ workspaceId: "ws-1", clientProfileId: "cp-1" }}
        />
      </CoachProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("open"),
    );
    toggle();
    await waitFor(() => expect(mocked.setTask).toHaveBeenCalledTimes(2));
    expect(
      (mocked.setTask.mock.calls[1][3] as { expectedRevision: number })
        .expectedRevision,
    ).toBe(2);
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("done"),
    );
    // The old session's write finally lands at the older revision 2 —
    // it must not overwrite the new session's confirmed revision 3.
    await act(async () =>
      resolveOld({ revision: 2, status: "COMPLETED", changed: true }),
    );
    toggle("t1", false);
    await waitFor(() => expect(mocked.setTask).toHaveBeenCalledTimes(3));
    expect(
      (mocked.setTask.mock.calls[2][3] as { expectedRevision: number })
        .expectedRevision,
    ).toBe(3);
  });

  it("a stale failure cannot roll back the current session", async () => {
    let rejectOld!: (e: Error) => void;
    mocked.setTask
      .mockImplementationOnce(
        () =>
          new Promise<Record<string, unknown>>(
            (_resolve, reject) => (rejectOld = reject),
          ) as never,
      )
      .mockResolvedValue({ revision: 3, status: "COMPLETED", changed: true });
    mocked.fetchTasks
      .mockResolvedValueOnce({
        clientProfileId: "cp-1",
        tasks: [taskWire()],
        hasMore: false,
      } as never)
      .mockResolvedValueOnce({
        clientProfileId: "cp-2",
        tasks: [taskWire({ id: "t2" })],
        hasMore: false,
      } as never)
      .mockResolvedValue({
        clientProfileId: "cp-1",
        tasks: [taskWire({ revision: 2 })],
        hasMore: false,
      } as never);
    const { rerender } = mountTab();
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("open"),
    );
    toggle();
    await waitFor(() => expect(mocked.setTask).toHaveBeenCalledTimes(1));
    rerender(
      <CoachProvider>
        <RemoteDashboardTab
          configuration={variant}
          client={client}
          own={{ workspaceId: "ws-2", clientProfileId: "cp-2" }}
        />
      </CoachProvider>,
    );
    rerender(
      <CoachProvider>
        <RemoteDashboardTab
          configuration={variant}
          client={client}
          own={{ workspaceId: "ws-1", clientProfileId: "cp-1" }}
        />
      </CoachProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("open"),
    );
    toggle();
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("done"),
    );
    // The old session's write fails late — it cannot roll back or clear
    // the new session's confirmed revision-3 state.
    await act(async () => rejectOld(new Error("conflict")));
    expect(screen.getByTestId("task-t1").textContent).toBe("done");
  });

  it("a pending write from the old account never touches the new account", async () => {
    let resolveWrite!: (v: Record<string, unknown>) => void;
    mocked.setTask.mockImplementationOnce(
      () =>
        new Promise<Record<string, unknown>>(
          (resolve) => (resolveWrite = resolve),
        ),
    );
    mocked.fetchTasks.mockImplementation(
      (w?: string) =>
        Promise.resolve(
          w === "ws-1"
            ? { clientProfileId: "cp-1", tasks: [taskWire()], hasMore: false }
            : {
                clientProfileId: "cp-2",
                tasks: [taskWire({ id: "t2" })],
                hasMore: false,
              },
        ) as never,
    );
    const { rerender } = mountTab();
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("open"),
    );
    toggle();
    await waitFor(() =>
      expect(screen.getByTestId("task-t1").textContent).toBe("done"),
    );
    rerender(
      <CoachProvider>
        <RemoteDashboardTab
          configuration={variant}
          client={client}
          own={{ workspaceId: "ws-2", clientProfileId: "cp-2" }}
        />
      </CoachProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("task-t2").textContent).toBe("open"),
    );
    await act(async () =>
      resolveWrite({ revision: 2, status: "COMPLETED", changed: true }),
    );
    expect(screen.queryByTestId("task-t1")).toBeNull();
    expect(screen.getByTestId("task-t2").textContent).toBe("open");
  });
});
