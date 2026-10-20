// @vitest-environment jsdom
// PR-MEDIA round 2/3: clientProfileIdFor must not cache a failed roster
// fetch. A transient 500/401 used to poison the in-memory map, silently
// stripping clientProfileId from every later staff upload (400
// invalid_input in the service). This test fails on the old order.
import { cleanup, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { CoachProvider, useCoach } from "../../components/canvas/coach/store";

function rosterResponse(status: number) {
  return new Response(
    JSON.stringify({
      items: [{ clientProfileId: "cp-emma", name: "Emma Anders" }],
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

describe("clientProfileIdFor (canvas roster resolution)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("a failed roster fetch does not poison the cache; the next call retries", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      // First call fails, second succeeds.
      return rosterResponse(calls.length === 1 ? 500 : 200);
    });
    vi.stubGlobal("fetch", fetchMock);

    let resolve: ((name: string) => Promise<string | null>) | null = null;
    function Probe() {
      const coach = useCoach();
      useEffect(() => {
        resolve = coach.clientProfileIdFor;
      }, [coach]);
      return null;
    }
    render(
      <CoachProvider workspaceId="ws-1">
        <Probe />
      </CoachProvider>,
    );
    await waitFor(() => expect(resolve).not.toBeNull());

    const first = await resolve!("Emma Anders");
    expect(first).toBeNull(); // transient 500 -> null, NOT cached
    const second = await resolve!("Emma Anders");
    expect(second).toBe("cp-emma"); // retried and resolved
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("without a workspace the resolver never hits the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let resolve: ((name: string) => Promise<string | null>) | null = null;
    function Probe() {
      const coach = useCoach();
      useEffect(() => {
        resolve = coach.clientProfileIdFor;
      }, [coach]);
      return null;
    }
    render(
      <CoachProvider>
        <Probe />
      </CoachProvider>,
    );
    await waitFor(() => expect(resolve).not.toBeNull());
    expect(await resolve!("Emma Anders")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
