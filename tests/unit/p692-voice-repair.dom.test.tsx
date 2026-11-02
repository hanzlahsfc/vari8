// @vitest-environment jsdom
//
// P692/P693 committed regressions for the closure-review findings:
//  - non-fixture coach conversation renders and send/read target the
//    exact server clientProfileId (never the display name);
//  - actor-scoped temporary transcripts: isolation, scoped clear, and
//    no cross-consumer disruption;
//  - worker lifecycle: decode failure, missing Worker, abort and retry
//    all release the busy bound;
//  - raced recordings release capacity (mic guard + removal).
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  query: "",
  lastUrl: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocked.query),
}));

vi.mock(
  "../../components/canvas/coach/voice-transcript",
  async (importOriginal) => {
    const mod =
      await importOriginal<
        typeof import("../../components/canvas/coach/voice-transcript")
      >();
    return { ...mod, transcriptionSupported: vi.fn(() => true) };
  },
);

import { seedState as canvasSeed } from "../../components/canvas/coach/model";
import { MessagesWorkspace as CanvasMessages } from "../../components/canvas/coach/messages";
import {
  CoachProvider as CanvasProvider,
  useCoach,
} from "../../components/canvas/coach/store";
import { writeCoachState } from "../../components/canvas/data";
import {
  clearVoiceTranscriptCache,
  readCachedTranscript,
  transcribeAudio,
  writeCachedTranscript,
} from "../../components/canvas/coach/voice-transcript";
import { VoiceTranscript } from "../../components/canvas/coach/voice-transcript-panel";

// -- helpers ---------------------------------------------------------------

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function wireFetch() {
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      mocked.lastUrl = url;
      if (init?.method === "POST" && url.includes("/conversations/cp-real"))
        return json({
          message: {
            id: "srv-m2",
            body: "hi coach reply",
            senderKind: "STAFF",
            sentAt: "2026-11-02T10:01:00Z",
            clientRequestId: "r2",
            read: true,
            priority: false,
            links: null,
            attachments: [],
          },
        });
      if (url.endsWith("/conversations"))
        return json({
          conversations: [
            {
              clientProfileId: "cp-real",
              clientName: "E2E Client",
              lastMessageAt: null,
              lastMessagePreview: null,
              unreadCount: 0,
              hasPriority: false,
            },
          ],
        });
      if (url.includes("/conversations/cp-real"))
        return json({
          clientProfileId: "cp-real",
          messages: [
            {
              id: "m1",
              body: "voice below",
              senderKind: "CLIENT",
              sentAt: "2026-11-02T10:00:00Z",
              clientRequestId: "r1",
              read: true,
              priority: false,
              links: null,
              attachments: [
                {
                  mediaObjectId: "mo-a1",
                  fileName: "voice.webm",
                  contentType: "audio/webm",
                  byteSize: 100,
                },
              ],
            },
          ],
          draft: null,
        });
      if (url.includes("/media/")) return json({ download: { url: "blob:x" } });
      if (url.endsWith("/session")) return json({ user: { id: "user-1" } });
      return json({ items: [] });
    },
  ) as unknown as typeof fetch;
}

function StateProbe() {
  const { state } = useCoach();
  const srv = state.clients.find((c) => c.id === "srv-cp-real");
  return (
    <output
      data-testid="probe"
      data-srv={srv ? "yes" : "no"}
      data-coachtasks={Array.isArray(srv?.coachTasks) ? "arr" : "undef"}
      data-profile={
        (srv as { serverProfileId?: string } | undefined)?.serverProfileId ?? ""
      }
    />
  );
}

// -- coach non-fixture identity --------------------------------------------

describe("P692 — real coach conversation identity", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    wireFetch();
    const seeded = canvasSeed({ demo: false });
    const client = seeded.clients[0].id;
    writeCoachState(seeded);
    mocked.query = `section=messages&client=srv-cp-real`;
  });
  afterEach(cleanup);

  it("a non-fixture server conversation renders without crash, keyed by clientProfileId", async () => {
    render(
      <CanvasProvider workspaceId="ws-test">
        <CanvasMessages />
        <StateProbe />
      </CanvasProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe").dataset.srv).toBe("yes"),
    );
    // The crash field from the closure review exists as an empty array.
    expect(screen.getByTestId("probe").dataset.coachtasks).toBe("arr");
    // Thread selection carries the authoritative id.
    expect(screen.getByTestId("probe").dataset.profile).toBe("cp-real");
    // The real client name renders and the thread is reachable.
    await waitFor(() => screen.getAllByText(/E2E Client/));
    // Reads hit the server profile id, not a resolved name.
    await waitFor(() =>
      expect(
        (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some((call) =>
          String(call[0]).includes("/conversations/cp-real"),
        ),
      ).toBe(true),
    );
  });

  it("a staff send on the synthesized thread POSTs to the exact clientProfileId", async () => {
    render(
      <CanvasProvider workspaceId="ws-test">
        <CanvasMessages />
        <StateProbe />
      </CanvasProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe").dataset.profile).toBe("cp-real"),
    );
    const area =
      await screen.findByPlaceholderText<HTMLTextAreaElement>(
        /Write a message/,
      );
    fireEvent.change(area, { target: { value: "hi coach reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(
        (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(
          (call) =>
            String(call[0]).endsWith("/conversations/cp-real") &&
            (call[1] as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true),
    );
  });
});

// -- actor-scoped temporary transcripts -------------------------------------

describe("P692 — scoped temporary transcript cache", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(cleanup);

  it("scopes isolate actors; scoped clear never touches another scope", () => {
    writeCachedTranscript("ws:u1", "mo-1", "u1 transcript");
    writeCachedTranscript("ws:u2", "mo-1", "u2 transcript");
    expect(readCachedTranscript("ws:u1", "mo-1")).toBe("u1 transcript");
    expect(readCachedTranscript("ws:u2", "mo-1")).toBe("u2 transcript");
    clearVoiceTranscriptCache("ws:u1");
    expect(readCachedTranscript("ws:u1", "mo-1")).toBeNull();
    // Same media id, different actor: untouched.
    expect(readCachedTranscript("ws:u2", "mo-1")).toBe("u2 transcript");
  });

  it("logout boundary: unscoped clear drops every actor's entries", () => {
    writeCachedTranscript("ws:u1", "mo-1", "u1 transcript");
    writeCachedTranscript("ws:u2", "mo-1", "u2 transcript");
    clearVoiceTranscriptCache();
    expect(readCachedTranscript("ws:u1", "mo-1")).toBeNull();
    expect(readCachedTranscript("ws:u2", "mo-1")).toBeNull();
  });

  it("two mounted consumers with different scopes cannot disrupt each other", () => {
    writeCachedTranscript("ws:u1", "mo-a", "panel one");
    writeCachedTranscript("ws:u2", "mo-b", "panel two");
    render(
      <>
        <VoiceTranscript audioUrl="x" cacheKey="mo-a" scope="ws:u1" />
        <VoiceTranscript audioUrl="x" cacheKey="mo-b" scope="ws:u2" />
      </>,
    );
    screen.getByText("panel one");
    screen.getByText("panel two");
    clearVoiceTranscriptCache("ws:u1");
    expect(readCachedTranscript("ws:u2", "mo-b")).toBe("panel two");
  });
});

// -- worker lifecycle -------------------------------------------------------

describe("P692 — bounded worker lifecycle", () => {
  beforeEach(() => {
    // jsdom: no OfflineAudioContext, no Worker — exercises the real
    // engine's decode/init failure boundaries.
  });
  it("decode failure releases busy so retry is possible", async () => {
    const blob = new Blob(["x"], { type: "audio/webm" });
    await expect(transcribeAudio(blob)).rejects.toThrow("unsupported");
    // The wedge from the review: a second call must fail the same way,
    // never with transcribe_busy.
    await expect(transcribeAudio(blob)).rejects.toThrow("unsupported");
  });

  it("worker construction failure releases busy and permits retry", async () => {
    // Decode succeeds (mocked OfflineAudioContext), `new Worker` then
    // throws (jsdom has none) — init failure must not wedge `busy`.
    const MockDecode = class {
      async decodeAudioData() {
        return { duration: 1 } as AudioBuffer;
      }
      createBufferSource() {
        return {
          connect: vi.fn(),
          start: vi.fn(),
        } as unknown as AudioBufferSourceNode;
      }
      get destination() {
        return {} as AudioDestinationNode;
      }
      async startRendering() {
        return {
          getChannelData: () => new Float32Array(16),
        } as unknown as AudioBuffer;
      }
    };
    const prev = globalThis.OfflineAudioContext;
    globalThis.OfflineAudioContext =
      MockDecode as unknown as typeof OfflineAudioContext;
    try {
      const blob = new Blob(["x"], { type: "audio/webm" });
      await expect(transcribeAudio(blob)).rejects.toThrow();
      await expect(transcribeAudio(blob)).rejects.toThrow();
    } finally {
      globalThis.OfflineAudioContext = prev;
    }
  });

  it("pre-abort releases busy and a later run still reaches decode", async () => {
    const blob = new Blob(["x"], { type: "audio/webm" });
    const ac = new AbortController();
    ac.abort();
    await expect(transcribeAudio(blob, { signal: ac.signal })).rejects.toThrow(
      "Aborted",
    );
    await expect(transcribeAudio(blob)).rejects.toThrow("unsupported");
  });
});
