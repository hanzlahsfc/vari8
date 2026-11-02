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

const actorOf = (scope: string) => ({
  status: "ready" as const,
  scope,
  retry: () => {},
});
const mount = () =>
  render(
    <VoiceTranscript
      audioUrl="blob:audio"
      cacheKey="mo-1"
      actor={actorOf("ws-1:cp-1")}
    />,
  );

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
    expect(sessionStorage.getItem("vt1:w1:ws-1:cp-1:mo-1")).toBe(
      "hello from the recording",
    );
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
    expect(sessionStorage.getItem("vt1:w1:ws-1:cp-1:mo-1")).toBeNull();
  });

  it("serves a cached transcript without re-running the pipeline", async () => {
    sessionStorage.setItem("vt1:w1:ws-1:cp-1:mo-1", "cached take");
    // A differently-scoped stale entry must not leak in.
    sessionStorage.setItem("vt1:w1:other:mo-1", "foreign take");
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

describe("VoiceTranscript — actor transitions (P698)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    blobFetch();
    mockSupported.mockReturnValue(true);
    mockTranscribe.mockReset();
  });
  afterEach(() => cleanup());

  it("ready A → loading → error: text clears at every transition", async () => {
    sessionStorage.setItem("vt1:w1:ws:uA:mo-1", "actor A text");
    const { rerender } = render(
      <VoiceTranscript
        audioUrl="blob:audio"
        cacheKey="mo-1"
        actor={actorOf("ws:uA")}
      />,
    );
    await waitFor(() => screen.getByText("actor A text"));
    rerender(
      <VoiceTranscript
        audioUrl="blob:audio"
        cacheKey="mo-1"
        actor={{ status: "loading", retry: () => {} }}
      />,
    );
    expect(screen.queryByText("actor A text")).toBeNull();
    rerender(
      <VoiceTranscript
        audioUrl="blob:audio"
        cacheKey="mo-1"
        actor={{ status: "error", retry: () => {} }}
      />,
    );
    expect(screen.queryByText("actor A text")).toBeNull();
    screen.getByRole("button", { name: "Retry" });
  });

  it("ready A → B shows only B's cache", async () => {
    sessionStorage.setItem("vt1:w1:ws:uA:mo-1", "actor A text");
    sessionStorage.setItem("vt1:w1:ws:uB:mo-1", "actor B text");
    const { rerender } = render(
      <VoiceTranscript
        audioUrl="blob:audio"
        cacheKey="mo-1"
        actor={actorOf("ws:uA")}
      />,
    );
    await waitFor(() => screen.getByText("actor A text"));
    rerender(
      <VoiceTranscript
        audioUrl="blob:audio"
        cacheKey="mo-1"
        actor={actorOf("ws:uB")}
      />,
    );
    await waitFor(() => screen.getByText("actor B text"));
    expect(screen.queryByText("actor A text")).toBeNull();
  });

  it("A→B→A late completion never surfaces under B", async () => {
    let resolveRun: ((t: string) => void) | null = null;
    mockTranscribe.mockImplementation(
      () => new Promise<string>((res) => (resolveRun = res)),
    );
    const { rerender } = render(
      <VoiceTranscript
        audioUrl="blob:audio"
        cacheKey="mo-1"
        actor={actorOf("ws:uA")}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "View transcript" }));
    // Identity changes while inference is in flight.
    rerender(
      <VoiceTranscript
        audioUrl="blob:audio"
        cacheKey="mo-1"
        actor={actorOf("ws:uB")}
      />,
    );
    rerender(
      <VoiceTranscript
        audioUrl="blob:audio"
        cacheKey="mo-1"
        actor={actorOf("ws:uA")}
      />,
    );
    // The run must actually be in flight before resolving it.
    await waitFor(() => expect(resolveRun).toBeTruthy());
    resolveRun!("late take text");
    // Written under the producing actor A only — never displayed mid-B.
    await waitFor(() =>
      expect(sessionStorage.getItem("vt1:w1:ws:uA:mo-1")).toBe(
        "late take text",
      ),
    );
    expect(sessionStorage.getItem("vt1:w1:ws:uB:mo-1")).toBeNull();
  });
});

describe("VoiceTranscript — async run ownership (P700)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    blobFetch();
    mockSupported.mockReturnValue(true);
    mockTranscribe.mockReset();
  });
  afterEach(() => cleanup());

  it("A pending → B current → A rejects: B's cached text is untouched", async () => {
    sessionStorage.setItem("vt1:w1:ws:uB:mo-1", "actor B cached text");
    let rejectRun: ((e: Error) => void) | null = null;
    mockTranscribe.mockImplementation(
      () => new Promise<string>((_res, rej) => (rejectRun = rej)),
    );
    const { rerender } = render(
      <VoiceTranscript
        audioUrl="blob:audio"
        cacheKey="mo-1"
        actor={actorOf("ws:uA")}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "View transcript" }));
    await waitFor(() => expect(rejectRun).toBeTruthy());
    // Identity switches to B while A's run is in flight — B reads cache.
    rerender(
      <VoiceTranscript
        audioUrl="blob:audio"
        cacheKey="mo-1"
        actor={actorOf("ws:uB")}
      />,
    );
    await waitFor(() => screen.getByText("actor B cached text"));
    // A's stale rejection must not clear B's text or mark an error.
    rejectRun!(new Error("stale inference failure"));
    await waitFor(() => screen.getByText("actor B cached text"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/unavailable/)).toBeNull();
  });
});

describe("VoiceTranscript — same-session run ownership (P703)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    blobFetch();
    mockSupported.mockReturnValue(true);
    mockTranscribe.mockReset();
  });
  afterEach(() => cleanup());

  /**
   * Overlapping runs inside ONE actor scope: a take swap (cacheKey
   * change) aborts and supersedes the in-flight run, but decode/
   * inference itself is not cancellable mid-flight — the stale promise
   * still settles. Only the per-run token can keep its settlement off
   * the live run; the scope check alone passes for the same actor.
   */
  const mountSuperseded = async () => {
    const runs: { res: (t: string) => void; rej: (e: unknown) => void }[] = [];
    mockTranscribe.mockImplementation(
      () =>
        new Promise<string>((res, rej) => {
          runs.push({ res, rej });
        }),
    );
    const { rerender } = render(
      <VoiceTranscript
        audioUrl="blob:first"
        cacheKey="mo-1"
        actor={actorOf("ws:uA")}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "View transcript" }));
    await waitFor(() => expect(runs.length).toBe(1));
    // Same actor, different attachment — run 1 is superseded in place.
    rerender(
      <VoiceTranscript
        audioUrl="blob:second"
        cacheKey="mo-2"
        actor={actorOf("ws:uA")}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "View transcript" }));
    await waitFor(() => expect(runs.length).toBe(2));
    return runs;
  };

  it("a superseded run's late success cannot clobber the live run", async () => {
    const runs = await mountSuperseded();
    runs[0]!.res("stale same-session text");
    // The cache write proves the stale settlement ran; it stays keyed
    // to its own media id and must not disturb run 2's busy state.
    await waitFor(() =>
      expect(sessionStorage.getItem("vt1:w1:ws:uA:mo-1")).toBe(
        "stale same-session text",
      ),
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.queryByText("stale same-session text")).toBeNull();
    runs[1]!.res("live take text");
    await waitFor(() => screen.getByText("live take text"));
    expect(screen.queryByText("stale same-session text")).toBeNull();
    expect(sessionStorage.getItem("vt1:w1:ws:uA:mo-2")).toBe("live take text");
  });

  it("a superseded run's late failure cannot mark the live run errored", async () => {
    const runs = await mountSuperseded();
    runs[0]!.rej(new Error("stale inference failure"));
    await waitFor(() => screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/unavailable/)).toBeNull();
    runs[1]!.res("live take text");
    await waitFor(() => screen.getByText("live take text"));
  });

  it("a superseded run's late abort cannot idle the live run", async () => {
    const runs = await mountSuperseded();
    runs[0]!.rej(new DOMException("Aborted", "AbortError"));
    await waitFor(() => screen.getByRole("button", { name: "Cancel" }));
    // Unguarded, the stale abort would return the panel to idle and
    // hide run 2's pending state — Cancel must still be shown.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "View transcript" }),
    ).toBeNull();
    runs[1]!.res("live take text");
    await waitFor(() => screen.getByText("live take text"));
  });
});
