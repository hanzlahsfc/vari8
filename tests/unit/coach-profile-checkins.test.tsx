// @vitest-environment jsdom
// W2-A3: the athlete profile surfaces read check-ins and progress photos
// from the backend, not the local seed.
//
// 1. Profile hydration: opening a client profile must fold the staff
//    schedule-rules into client.schedules and replace the viewed client's
//    submission rows with the answer-free list DTO, without touching the
//    rows other clients carry. A merge that drops other clients' data, or
//    keeps the local seed, fails these assertions.
// 2. Physique columns: loadPhysiquePhotos groups the entry list by takenOn,
//    resolves each media object to a download url, recovers the pose from
//    the media file name and carries the submission link for the review
//    action.
import { cleanup, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () =>
    new URLSearchParams("section=clients&client=client-001"),
}));

vi.mock("../../components/canvas/data/http", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "../../components/canvas/data/http";
import { loadPhysiquePhotos } from "../../components/canvas/data/progress-photos";
import type { CoachState } from "../../components/canvas/coach/model";
import { CoachProvider, useCoach } from "../../components/canvas/coach/store";

const apiFetchMock = vi.mocked(apiFetch);

function rosterResponse() {
  return new Response(
    JSON.stringify({
      items: [{ clientProfileId: "cp-emma", name: "Emma Anders" }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("athlete profile check-in hydration (W2-A3)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("replaces the viewed client's seed rows with the staff read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => rosterResponse()),
    );
    let instancesSpanDays = Number.NaN;
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path.includes("/checkins/schedule-rules")) {
        return {
          items: [
            {
              ruleId: "rule-1",
              formId: "form-1",
              weekday: "MONDAY",
              startDate: "2026-09-01",
              endDate: null,
              status: "ACTIVE",
            },
          ],
        };
      }
      if (path.includes("/checkins/instances")) {
        const q = new URLSearchParams(path.split("?")[1]);
        // The staff calendar read is bounded at 95 days server-side.
        instancesSpanDays =
          (Date.parse(q.get("to") ?? "") - Date.parse(q.get("from") ?? "")) /
          86_400_000;
        return { items: [] };
      }
      if (path.includes("/checkins/submissions")) {
        return {
          items: [
            {
              instanceId: "inst-1",
              submissionId: "sub-backend-1",
              formName: "Weekly check-in",
              dueAt: "2026-10-12T07:00:00Z",
              submittedAt: "2026-10-12T08:00:00Z",
              reviewedAt: "2026-10-13T09:00:00Z",
            },
          ],
        };
      }
      // a2 plan reads and the exercise library: deny so they no-op.
      throw new Error("not_available");
    });

    let latest: CoachState | null = null;
    function Probe() {
      const { state } = useCoach();
      useEffect(() => {
        latest = state;
      }, [state]);
      return null;
    }
    render(
      <CoachProvider workspaceId="ws-1">
        <Probe />
      </CoachProvider>,
    );

    await waitFor(() => {
      const emma = latest?.clients.find((c) => c.id === "client-001");
      expect(emma?.schedules).toEqual([
        { effective: "2026-09-01", weekdays: [0] },
      ]);
    });

    const state = latest as CoachState | null;
    if (!state) throw new Error("state not captured");
    const mine = state.submissions.filter((s) => s.clientId === "client-001");
    // The seeded "submission-emma" row is gone; the backend row stands.
    expect(mine.map((s) => s.id)).toEqual(["sub-backend-1"]);
    expect(mine[0].note).toBe("");
    expect(mine[0].answers).toEqual([]);
    // reviewedAt becomes a sent response so the status reads right.
    expect(mine[0].response?.date).toBe("2026-10-13");
    expect(mine[0].type).toBe("Full"); // MONDAY rule occurrence
    // Other clients keep their seeded rows (the merge names them failed).
    expect(state.extras.some((e) => e.id === "extra-maya")).toBe(true);
    // The profile window must stay inside the route's 95-day bound.
    expect(instancesSpanDays).toBeLessThanOrEqual(95);
  });
});

describe("loadPhysiquePhotos (W2-A3)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("groups entries by date, mints urls and recovers the pose", async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path.endsWith("/progress-photos")) {
        return {
          entries: [
            {
              id: "pp-1",
              mediaObjectId: "m-front",
              takenOn: "2026-10-05",
              clientVisible: true,
              checkInSubmissionId: "sub-backend-1",
              createdAt: "2026-10-05T08:00:00Z",
            },
            {
              id: "pp-2",
              mediaObjectId: "m-side",
              takenOn: "2026-10-05",
              clientVisible: true,
              checkInSubmissionId: "sub-backend-1",
              createdAt: "2026-10-05T08:01:00Z",
            },
            {
              id: "pp-3",
              mediaObjectId: "m-later",
              takenOn: "2026-10-12",
              clientVisible: true,
              checkInSubmissionId: null,
              createdAt: "2026-10-12T08:00:00Z",
            },
            {
              id: "pp-4",
              mediaObjectId: "m-broken",
              takenOn: "2026-10-12",
              clientVisible: true,
              checkInSubmissionId: null,
              createdAt: "2026-10-12T08:02:00Z",
            },
          ],
        };
      }
      const media: Record<string, string> = {
        "m-front": "Front · 05 October",
        "m-side": "Side · 05 October",
        "m-later": "upload.jpg",
      };
      const id = path.split("/").at(-1) ?? "";
      if (id === "m-broken") throw new Error("denied");
      return {
        mediaObject: {
          id,
          kind: "IMAGE",
          fileName: media[id] ?? id,
          contentType: "image/png",
          byteSize: 10,
        },
        download: { url: `https://dl/${id}`, expiresAt: "soon" },
      };
    });

    const columns = await loadPhysiquePhotos("ws-1", "cp-emma");
    expect(columns).toEqual([
      {
        date: "2026-10-05",
        submissionId: "sub-backend-1",
        photos: [
          { pose: "Front", src: "https://dl/m-front" },
          { pose: "Side", src: "https://dl/m-side" },
        ],
      },
      {
        date: "2026-10-12",
        submissionId: undefined,
        photos: [{ pose: "Photo", src: "https://dl/m-later" }],
      },
    ]);
  });
});
