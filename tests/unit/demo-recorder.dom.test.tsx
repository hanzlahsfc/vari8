// @vitest-environment jsdom
// P682 — deterministic actual-recorder tests: the five-minute voice cap
// is enforced on the take's real encoded duration, not the displayed
// elapsed value. A delayed interval/visibility check detects an overrun
// on resume but cannot prevent one — those takes are rejected before
// attach. Boundary (300.0s) attaches, >300s and unverifiable takes are
// refused, discard/re-record and close cleanup are preserved.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoRecorder } from "../../components/canvas/coach/demo-recorder";
import { uploadWorkspaceMedia } from "../../components/canvas/coach/media-card";

// jsdom lacks MediaRecorder + getUserMedia — a trackable mock drives the
// real component through record → stop → preview → attach.
const tracks: Array<{ stop: ReturnType<typeof vi.fn> }> = [];
// The mock "encodes" for the wall time between start() and stop(), so a
// callback delayed past the cap genuinely produces an over-limit take —
// the same mechanism a real backgrounded MediaRecorder exhibits.
let encodedDuration = 0;
// Exact-duration override for boundary tests the wall clock can't land on.
let nextDuration: number | null = null;
let decodeFails = false;
class MockRecorder {
  state = "inactive";
  private startedAt = 0;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = "recording";
    this.startedAt = Date.now();
  }
  stop() {
    this.state = "inactive";
    encodedDuration = (Date.now() - this.startedAt) / 1000;
    this.ondataavailable?.({
      data: new Blob(["audio"], { type: "audio/webm" }),
    });
    this.onstop?.();
  }
  static isTypeSupported() {
    return true;
  }
}
// jsdom has no WebAudio — the component decodes the finished blob to get
// its real duration, so the mock reports what the mock recorder encoded.
class MockOfflineAudioContext {
  decodeAudioData() {
    if (decodeFails) return Promise.reject(new Error("cannot decode"));
    return Promise.resolve({
      duration: nextDuration ?? encodedDuration,
    });
  }
}
(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder =
  MockRecorder;
(
  globalThis as unknown as { OfflineAudioContext: unknown }
).OfflineAudioContext = MockOfflineAudioContext;
Object.defineProperty(navigator, "mediaDevices", {
  value: {
    getUserMedia: () => {
      const track = { stop: vi.fn() };
      tracks.push(track);
      return Promise.resolve({ getTracks: () => [track] });
    },
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
const mockedUpload = vi.mocked(uploadWorkspaceMedia);

const mount = (onAttach = vi.fn()) =>
  render(
    <DemoRecorder
      kind="voice"
      workspaceId="ws-1"
      clientProfileId="cp-1"
      onAttach={onAttach}
    />,
  );

const record = async () => {
  fireEvent.click(
    await screen.findByRole("button", { name: /Record voice note/ }),
  );
  await waitFor(() => screen.getByText(/Recording · 0 \/ 300s/));
};

describe("DemoRecorder — five-minute voice cap (P682)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    tracks.length = 0;
    encodedDuration = 0;
    nextDuration = null;
    decodeFails = false;
    mockedUpload.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows elapsed time and the five-minute limit while recording", async () => {
    mount();
    await record();
    vi.advanceTimersByTime(4200);
    await waitFor(() => screen.getByText(/Recording · 4 \/ 300s/));
  });

  it("manual stop lands in preview before the cap", async () => {
    mount();
    await record();
    vi.advanceTimersByTime(10_000);
    fireEvent.click(
      await screen.findByRole("button", { name: /Stop & preview/ }),
    );
    await waitFor(() =>
      screen.getByRole("button", { name: /Attach voice note/ }),
    );
  });

  it("auto-stops just under the cap and lands in preview", async () => {
    mount();
    await record();
    vi.advanceTimersByTime(300_500);
    // The UX stop fires at the first check on/after 299s so the encoded
    // take stays strictly under 300s — the preview must still arrive.
    await waitFor(() =>
      screen.getByRole("button", { name: /Attach voice note/ }),
    );
  });

  it("a delayed resume check detects an overrun it could not prevent — the take is rejected", async () => {
    const onAttach = vi.fn();
    mount(onAttach);
    await record();
    // A backgrounded/frozen tab: the clock runs past the cap while the
    // 250ms interval callback is suspended — the recorder keeps encoding.
    vi.setSystemTime(Date.now() + 305_000);
    // The delayed check finally runs on resume and stops the recorder,
    // but the blob already holds ~305s — over the cap.
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => screen.getByText(/exceeded the five-minute limit/));
    expect(
      screen.queryByRole("button", { name: /Attach voice note/ }),
    ).toBeNull();
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(onAttach).not.toHaveBeenCalled();
    // The take is dead — the only way forward is recording again.
    await record();
  });

  it("a take measured at exactly 300s attaches (valid boundary)", async () => {
    const onAttach = vi.fn();
    mount(onAttach);
    await record();
    vi.advanceTimersByTime(10_000);
    nextDuration = 300;
    fireEvent.click(
      await screen.findByRole("button", { name: /Stop & preview/ }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Attach voice note/ }),
    );
    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onAttach).toHaveBeenCalledTimes(1));
  });

  it("a take measured over 300s is rejected even when the stop looked on time", async () => {
    const onAttach = vi.fn();
    mount(onAttach);
    await record();
    vi.advanceTimersByTime(10_000);
    nextDuration = 300.5;
    fireEvent.click(
      await screen.findByRole("button", { name: /Stop & preview/ }),
    );
    await waitFor(() => screen.getByText(/exceeded the five-minute limit/));
    expect(
      screen.queryByRole("button", { name: /Attach voice note/ }),
    ).toBeNull();
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(onAttach).not.toHaveBeenCalled();
  });

  it("an unverifiable duration is surfaced, not assumed under the cap", async () => {
    const onAttach = vi.fn();
    mount(onAttach);
    await record();
    decodeFails = true;
    vi.advanceTimersByTime(5_000);
    fireEvent.click(
      await screen.findByRole("button", { name: /Stop & preview/ }),
    );
    await waitFor(() => screen.getByText(/length could not be verified/));
    expect(
      screen.queryByRole("button", { name: /Attach voice note/ }),
    ).toBeNull();
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(onAttach).not.toHaveBeenCalled();
    // The failure does not wedge the recorder — a fresh take still works.
    decodeFails = false;
    await record();
  });

  it("discard then re-record produces a fresh take", async () => {
    mount();
    await record();
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
    await record();
  });

  it("closing near the limit releases the microphone track and never attaches", async () => {
    const onAttach = vi.fn();
    const { unmount } = mount(onAttach);
    await record();
    vi.advanceTimersByTime(298_500);
    unmount();
    expect(tracks).toHaveLength(1);
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(onAttach).not.toHaveBeenCalled();
  });
});
