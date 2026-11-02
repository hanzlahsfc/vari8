// @vitest-environment jsdom
// P688 — "View transcript" panel: on-demand load, labeled automatic
// result, failure + retry, real cancellation, session cache, and the
// unsupported-device path — none of which may touch playback or send.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceTranscript } from "../../components/canvas/coach/voice-transcript-panel";
import * as engine from "../../components/canvas/coach/voice-transcript";

vi.mock(
  "../../components/canvas/coach/voice-transcript",
  async (importOriginal) => {
    const mod = await importOriginal<typeof engine>();
    return {
      ...mod,
      transcriptionSupported: vi.fn(() => true),
      transcribeAudio: vi.fn(),
    };
  },
);
const mockSupported = vi.mocked(engine.transcriptionSupported);
const mockTranscribe = vi.mocked(engine.transcribeAudio);

const blobFetch = () => {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(new Blob(["audio"], { type: "audio/webm" }), {
        status: 200,
      }),
    ),
  ) as unknown as typeof fetch;
};

const mount = () =>
  render(<VoiceTranscript audioUrl="blob:audio" cacheKey="mo-1" />);

describe("VoiceTranscript — on-device, on demand (P688)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    blobFetch();
    mockSupported.mockReturnValue(true);
    mockTranscribe.mockReset();
  });
  afterEach(() => cleanup());

  it("transcribes on request and labels the result automatic", async () => {
    mockTranscribe.mockResolvedValue("hello from the recording");
    mount();
    fireEvent.click(screen.getByRole("button", { name: "View transcript" }));
    await waitFor(() => screen.getByText("hello from the recording"));
    expect(
      screen.getByText(/Auto-transcript — may contain errors/),
    ).toBeTruthy();
    expect(mockTranscribe).toHaveBeenCalledTimes(1);
    // Temporary cache, exact media identity — never a message field.
    expect(sessionStorage.getItem("vt1:mo-1")).toBe("hello from the recording");
  });

  it("a failed run surfaces a retry and keeps the control recoverable", async () => {
    mockTranscribe
      .mockRejectedValueOnce(new Error("model missing"))
      .mockResolvedValueOnce("second try worked");
    mount();
    fireEvent.click(screen.getByRole("button", { name: "View transcript" }));
    await waitFor(() => screen.getByText(/is unavailable right now/));
    expect(screen.getByText(/still plays and sends/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry transcript" }));
    await waitFor(() => screen.getByText("second try worked"));
  });

  it("cancel aborts the run and returns to idle", async () => {
    mockTranscribe.mockImplementation(
      (_blob, opts) =>
        new Promise<string>((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    mount();
    fireEvent.click(screen.getByRole("button", { name: "View transcript" }));
    await waitFor(() => screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      screen.getByRole("button", { name: "View transcript" }),
    );
    expect(sessionStorage.getItem("vt1:mo-1")).toBeNull();
  });

  it("serves a cached transcript without re-running the pipeline", async () => {
    sessionStorage.setItem("vt1:mo-1", "cached take");
    mount();
    await waitFor(() => screen.getByText("cached take"));
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("an unverifiable device shows no control at all", () => {
    mockSupported.mockReturnValue(false);
    mount();
    expect(screen.queryByRole("button", { name: /transcript/i })).toBeNull();
  });
});
