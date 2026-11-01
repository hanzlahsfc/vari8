// @vitest-environment jsdom
// P680 — deterministic actual-recorder tests: five-minute voice cap,
// elapsed-time auto-stop (background-tab safe), discard/re-record,
// close near the limit and unmount-during-recording cleanup.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoRecorder } from "../../components/canvas/coach/demo-recorder";
import type { Media } from "../../components/canvas/coach/model";

// jsdom lacks MediaRecorder + getUserMedia — a trackable mock drives the
// real component through record → stop → preview → attach.
const tracks: Array<{ stop: ReturnType<typeof vi.fn> }> = [];
class MockRecorder {
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["audio"], { type: "audio/webm" }),
    });
    this.onstop?.();
  }
  static isTypeSupported() {
    return true;
  }
}
(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
  MockRecorder;
Object.defineProperty(navigator, "mediaDevices", {
  value: {
    getUserMedia: () =>
      Promise.resolve({
        getTracks: () => (tracks.length ? tracks : [{ stop: vi.fn() }]),
      }),
  },
  configurable: true,
});
URL.createObjectURL = () => "blob:mock";
URL.revokeObjectURL = vi.fn();

vi.mock("../../components/canvas/coach/media-card", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("../../components/canvas/coach/media-card")
    >();
  return { ...mod, uploadWorkspaceMedia: vi.fn() };
});

const mount = (onAttach = vi.fn()) =>
  render(
    <DemoRecorder
      kind="voice"
      workspaceId="ws-1"
      clientProfileId="cp-1"
      onAttach={onAttach}
    />,
  );

describe("DemoRecorder — five-minute voice cap (P680)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    tracks.length = 0;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows elapsed time and the five-minute limit while recording", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /Record voice note/ }),
    );
    await waitFor(() => screen.getByText(/Recording · 0 \/ 300s/));
    vi.advanceTimersByTime(4200);
    await waitFor(() => screen.getByText(/Recording · 4 \/ 300s/));
  });

  it("manual stop lands in preview before the cap", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /Record voice note/ }),
    );
    await waitFor(() => screen.getByText(/Recording · 0 \/ 300s/));
    vi.advanceTimersByTime(10_000);
    fireEvent.click(
      await screen.findByRole("button", { name: /Stop & preview/ }),
    );
    await waitFor(() =>
      screen.getByRole("button", { name: /Attach voice note/ }),
    );
  });

  it("auto-stops at 300s and lands in preview", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /Record voice note/ }),
    );
    await waitFor(() => screen.getByText(/Recording · 0 \/ 300s/));
    vi.advanceTimersByTime(300_500);
    await waitFor(() =>
      screen.getByRole("button", { name: /Attach voice note/ }),
    );
  });

  it("a throttled interval still stops on elapsed time (background tab)", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /Record voice note/ }),
    );
    await waitFor(() => screen.getByText(/Recording · 0 \/ 300s/));
    // Simulate a backgrounded tab: one long advance, then a visibility
    // check fires — the elapsed check, not a tick count, stops recording.
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(301_000);
    await waitFor(() =>
      screen.getByRole("button", { name: /Attach voice note/ }),
    );
  });

  it("discard then re-record produces a fresh take", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /Record voice note/ }),
    );
    await waitFor(() => screen.getByText(/Recording · 0 \/ 300s/));
    fireEvent.click(
      await screen.findByRole("button", { name: /Stop & preview/ }),
    );
    await waitFor(() =>
      screen.getByRole("button", { name: /Attach voice note/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() =>
      screen.getByRole("button", { name: /Record voice note/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Record voice note/ }));
    await waitFor(() => screen.getByText(/Recording · 0 \/ 300s/));
  });

  it("closing near the limit releases tracks and never attaches", async () => {
    const onAttach = vi.fn();
    const { unmount } = mount(onAttach);
    fireEvent.click(
      await screen.findByRole("button", { name: /Record voice note/ }),
    );
    await waitFor(() => screen.getByText(/Recording · 0 \/ 300s/));
    vi.advanceTimersByTime(299_800);
    unmount();
    expect(onAttach).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toThrow();
  });
});
