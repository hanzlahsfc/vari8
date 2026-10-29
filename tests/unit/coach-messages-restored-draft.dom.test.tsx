// @vitest-environment jsdom
//
// w2-t8 repair round 3, blocking defect B1: a file attached to a composer
// draft and restored after a reload can never be sent, because the send
// guard reads "no session blob URL" as "upload still in flight" and the
// toast promises a retry that cannot land (the blob is gone for good).
//
// w2-t8 repair round 4, blocking defect B1: a composer attachment whose
// background upload settles without a media_object id keeps its session
// blob, so the send guard passed and the message landed with no server
// attachment and no notice. The canvas twin now classifies that outcome
// as failed and refuses the send until the item is removed or reattached.
//
// These tests mount the REAL CoachProvider + MessagesWorkspace for each
// twin (frontend/ local preview and components/canvas/), seeding each
// persistence seam the way a reload leaves it: the draft attachment's
// metadata is in storage while the in-memory media URL map is empty.
// send() is invoked through the rendered Send button.
//
// Assertions read DOM state directly; jest-dom is not part of the harness.

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  query: "",
  upload: vi.fn(async () => false),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocked.query),
}));

vi.mock("../../components/canvas/coach/media-card", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("../../components/canvas/coach/media-card")
    >();
  return { ...mod, uploadCanvasMedia: mocked.upload };
});

import type { Media } from "../../frontend/src/components/coach/model";
import {
  seedState as frontendSeed,
  STORAGE_KEY,
} from "../../frontend/src/components/coach/model";
import { MessagesWorkspace as FrontendMessages } from "../../frontend/src/components/coach/messages";
import {
  CoachProvider as FrontendProvider,
  useCoach as useFrontendCoach,
} from "../../frontend/src/components/coach/store";
import { seedState as canvasSeed } from "../../components/canvas/coach/model";
import { MessagesWorkspace as CanvasMessages } from "../../components/canvas/coach/messages";
import {
  CoachProvider as CanvasProvider,
  useCoach as useCanvasCoach,
} from "../../components/canvas/coach/store";
import { writeCoachState } from "../../components/canvas/data";

const HONEST_COPY =
  "Attachment kept as metadata after reload - reattach it to send it, or remove it.";
const FAILED_COPY =
  "Attachment upload failed. Remove it and reattach to send it.";

function restoredItem(): Media {
  return {
    id: "attachment-restored",
    name: "plan.pdf",
    type: "application/pdf",
    size: 2048,
  };
}

function FrontendProbe() {
  const { notice, state } = useFrontendCoach();
  const client = new URLSearchParams(mocked.query).get("client") ?? "";
  const draftAttachments = state.drafts[client]?.attachments.length ?? -1;
  return (
    <output
      data-testid="notice"
      data-messages={state.messages.length}
      data-draft-attachments={draftAttachments}
    >
      {notice?.text ?? ""}
    </output>
  );
}

function CanvasProbe() {
  const { notice, state } = useCanvasCoach();
  const client = new URLSearchParams(mocked.query).get("client") ?? "";
  const draftAttachments = state.drafts[client]?.attachments.length ?? -1;
  return (
    <output
      data-testid="notice"
      data-messages={state.messages.length}
      data-draft-attachments={draftAttachments}
    >
      {notice?.text ?? ""}
    </output>
  );
}

async function restoredDraftLoaded() {
  // The composer textarea only carries the restored draft text once the
  // provider has hydrated the seeded storage into state.
  const area =
    await screen.findByPlaceholderText<HTMLTextAreaElement>(/Write a message/);
  await waitFor(() => expect(area.value).toBe("see attached"));
}

describe("frontend coach messages (local preview twin)", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-session-url");
    globalThis.URL.revokeObjectURL = vi.fn();
    const client = frontendSeed().clients[0].id;
    mocked.query = `section=messages&client=${client}`;
  });
  afterEach(cleanup);

  it("restored file draft with no session blob surfaces the honest copy", async () => {
    const seeded = frontendSeed();
    const client = seeded.clients[0].id;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...seeded,
        drafts: {
          [client]: { text: "see attached", attachments: [restoredItem()] },
        },
      }),
    );
    render(
      <FrontendProvider>
        <FrontendMessages />
        <FrontendProbe />
      </FrontendProvider>,
    );
    await restoredDraftLoaded();
    const before = screen.getByTestId("notice").dataset.messages;
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    const notice = await screen.findByTestId("notice");
    expect(notice.textContent).toBe(HONEST_COPY);
    expect(notice.dataset.messages).toBe(before);
    expect(notice.dataset.draftAttachments).toBe("1");
  });

  it("freshly attached file still sends with its session blob", async () => {
    render(
      <FrontendProvider>
        <FrontendMessages />
        <FrontendProbe />
      </FrontendProvider>,
    );
    const area =
      await screen.findByPlaceholderText<HTMLTextAreaElement>(
        /Write a message/,
      );
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, {
      target: {
        files: [new File(["x"], "plan.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.change(area, { target: { value: "see attached" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(screen.getByTestId("notice").dataset.messages).not.toBe("0"),
    );
    expect(screen.getByTestId("notice").textContent).not.toContain("uploading");
  });
});

describe("canvas coach messages (backend twin)", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-session-url");
    globalThis.URL.revokeObjectURL = vi.fn();
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const client = canvasSeed({ demo: false }).clients[0].id;
    mocked.query = `section=messages&client=${client}`;
  });
  afterEach(cleanup);

  it("restored file draft with no session blob surfaces the honest copy", async () => {
    const seeded = canvasSeed({ demo: false });
    const client = seeded.clients[0].id;
    writeCoachState({
      ...seeded,
      drafts: {
        [client]: { text: "see attached", attachments: [restoredItem()] },
      },
    });
    render(
      <CanvasProvider workspaceId="ws-test">
        <CanvasMessages />
        <CanvasProbe />
      </CanvasProvider>,
    );
    await restoredDraftLoaded();
    const before = screen.getByTestId("notice").dataset.messages;
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    const notice = await screen.findByTestId("notice");
    expect(notice.textContent).toBe(HONEST_COPY);
    expect(notice.dataset.messages).toBe(before);
    expect(notice.dataset.draftAttachments).toBe("1");
  });

  it("a failed upload keeps the draft and blocks the send", async () => {
    mocked.upload.mockClear();
    render(
      <CanvasProvider workspaceId="ws-test">
        <CanvasMessages />
        <CanvasProbe />
      </CanvasProvider>,
    );
    const area =
      await screen.findByPlaceholderText<HTMLTextAreaElement>(
        /Write a message/,
      );
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, {
      target: {
        files: [new File(["x"], "plan.pdf", { type: "application/pdf" })],
      },
    });
    await waitFor(() => expect(mocked.upload).toHaveBeenCalledTimes(1));
    await act(async () => {
      await mocked.upload.mock.results[0]?.value;
    });
    fireEvent.change(area, { target: { value: "see attached" } });
    const before = screen.getByTestId("notice").dataset.messages;
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    const notice = await screen.findByTestId("notice");
    await waitFor(() => expect(notice.textContent).toBe(FAILED_COPY));
    expect(notice.dataset.messages).toBe(before);
    expect(notice.dataset.draftAttachments).toBe("1");
  });
});
