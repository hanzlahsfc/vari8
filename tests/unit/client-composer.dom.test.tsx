// @vitest-environment jsdom
// The client-side message composer (MobileMessages) wired to sendOwnMessage.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
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
      },
    }),
  ),
  fetchOwn: vi.fn(async (_w?: string) => ({ messages: [] })),
  markRead: vi.fn(async (_w?: string) => ({ marked: 0 })),
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
  };
});
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { MobileMessages } from "../../components/canvas/client-app/mobile/messages";
import { CoachProvider, useCoach } from "../../components/canvas/coach/store";
import { writeCoachState } from "../../components/canvas/data";
import { seedState as canvasSeed } from "../../components/canvas/coach/model";
import type { CoachClient } from "../../components/canvas/coach/model";

function seedClient(): CoachClient {
  const s = canvasSeed();
  return s.clients[0];
}
const client = seedClient();

function Probe() {
  const { state } = useCoach();
  return (
    <output data-testid="msgs">
      {state.messages.filter((m) => m.clientId === client.id).length}
    </output>
  );
}

function mount(workspaceId?: string) {
  writeCoachState({ ...canvasSeed(), hydrated: true } as never);
  return render(
    <CoachProvider>
      <MobileMessages client={client} workspaceId={workspaceId} />
      <Probe />
    </CoachProvider>,
  );
}

describe("client message composer (P620)", () => {
  beforeEach(() => {
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
    mocked.sendOwn.mockClear();
    mocked.fetchOwn.mockClear();
    mocked.markRead.mockClear();
    cleanup();
  });

  it("product scope: send posts through sendOwnMessage and refreshes", async () => {
    mount("ws-1");
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "hello coach" },
    });
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
      )[0],
    ).toBe("ws-1");
    expect(
      (
        mocked.sendOwn.mock.calls[0] as unknown as [
          string,
          string,
          string[] | undefined,
          string | undefined,
        ]
      )[1],
    ).toBe("hello coach");
    // refresh reloads the thread
    await waitFor(() => expect(mocked.fetchOwn).toHaveBeenCalledWith("ws-1"));
  });

  it("demo scope: no workspaceId — sends locally, never calls the API", async () => {
    mount(undefined);
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "demo note" },
    });
    fireEvent.click(screen.getByLabelText("Send"));
    expect(mocked.sendOwn).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId("msgs").textContent).not.toBe("0"),
    );
  });

  it("rapid Enter + click during pending sends only once", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof mocked.sendOwn>>) => void;
    mocked.sendOwn.mockImplementationOnce(
      () =>
        new Promise<Awaited<ReturnType<typeof mocked.sendOwn>>>(
          (r) => (resolve = r),
        ),
    );
    mount("ws-1");
    const input = screen.getByLabelText("Message") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "slow send" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByLabelText("Send"));
    expect(mocked.sendOwn).toHaveBeenCalledTimes(1);
    resolve({
      message: {
        id: "m9",
        senderKind: "CLIENT",
        sentAt: "2026-10-20T10:00:00Z",
        body: "slow send",
        read: false,
      },
    });
  });

  it("failed send keeps the draft and shows an accessible error; retry reuses the key", async () => {
    mocked.sendOwn.mockRejectedValueOnce(new Error("boom"));
    mount("ws-1");
    const input = screen.getByLabelText("Message") as HTMLInputElement;
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
    mocked.sendOwn.mockResolvedValueOnce({
      message: {
        id: "m2",
        senderKind: "CLIENT",
        sentAt: "2026-10-20T10:00:00Z",
        body: "retry me",
        read: false,
      },
    });
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

  it("successful send clears the draft and the next send gets a new key", async () => {
    mount("ws-1");
    const input = screen.getByLabelText("Message") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(mocked.sendOwn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(input.value).toBe(""));
    const firstKey = (
      mocked.sendOwn.mock.calls[0] as unknown as [
        string,
        string,
        string[] | undefined,
        string | undefined,
      ]
    )[3];
    fireEvent.change(input, { target: { value: "second" } });
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
    ).not.toBe(firstKey);
  });

  it("send success + refresh failure clears the draft without resending", async () => {
    mocked.fetchOwn.mockRejectedValueOnce(new Error("offline"));
    mount("ws-1");
    const input = screen.getByLabelText("Message") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sent but no refresh" } });
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(input.value).toBe(""));
    expect(mocked.sendOwn).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
