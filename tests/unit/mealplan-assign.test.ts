// Saved meal assign-to-client: cached roster, PUT upsert, POST assignment.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assignSavedMealToClient,
  clientProfileIdForName,
} from "@/components/canvas/ethereal/mealplan/assign-saved-meal";
import type { ReusableMeal } from "@/components/canvas/ethereal/mealplan/model";

const meal: ReusableMeal = {
  id: "saved-meal-x",
  name: "Breakfast",
  savedAt: "2026-01-01T00:00:00.000Z",
  meal: {
    id: "m1",
    label: "Breakfast",
    time: "08:00",
    portions: [{ foodId: "food-057", quantity: 50 }],
  },
};

const roster = (
  status = 200,
  items = [{ clientProfileId: "cp-1", name: "Emma Anders" }],
) =>
  new Response(JSON.stringify({ items }), {
    status,
    headers: { "content-type": "application/json" },
  });

const ok = (status = 200) =>
  new Response(JSON.stringify({}), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("assignSavedMealToClient - happy path", () => {
  it("rosters, upserts the saved meal and posts the assignment", async () => {
    const workspaceId = "ws-assign-happy";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(roster())
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      assignSavedMealToClient(workspaceId, "Emma Anders", meal, 2),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const base = `/api/v1/saved-meals/${workspaceId}/saved-meal-x`;
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/v1/workspaces/${workspaceId}/clients?limit=100`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(base);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      name: "Breakfast",
      meal: {
        id: "m1",
        label: "Breakfast",
        time: "08:00",
        portions: [{ foodId: "food-057", quantity: 50 }],
      },
      sortOrder: 2,
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`${base}/assignments`);
    expect(fetchMock.mock.calls[2]?.[0]?.endsWith("/assignments")).toBe(true);
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string)).toEqual({
      clientProfileId: "cp-1",
    });
  });
});

describe("clientProfileIdForName - roster cache", () => {
  it("fetches the roster once per workspace and caches the success", async () => {
    const workspaceId = "ws-assign-cache";
    const fetchMock = vi.fn().mockResolvedValueOnce(roster());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      clientProfileIdForName(workspaceId, "Emma Anders"),
    ).resolves.toBe("cp-1");
    await expect(
      clientProfileIdForName(workspaceId, "Emma Anders"),
    ).resolves.toBe("cp-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed roster fetch", async () => {
    const workspaceId = "ws-assign-retry";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(roster(500))
      .mockResolvedValueOnce(roster());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      assignSavedMealToClient(workspaceId, "Emma Anders", meal, 1),
    ).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBeUndefined();

    await expect(
      clientProfileIdForName(workspaceId, "Emma Anders"),
    ).resolves.toBe("cp-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("assignSavedMealToClient - misses resolve false", () => {
  it("resolves false when the client name is absent from the roster", async () => {
    const workspaceId = "ws-assign-miss";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        roster(200, [{ clientProfileId: "cp-9", name: "Someone Else" }]),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      assignSavedMealToClient(workspaceId, "Emma Anders", meal, 1),
    ).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);
  });

  it("resolves false and skips the assignment POST when the PUT fails", async () => {
    const workspaceId = "ws-assign-put403";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(roster())
      .mockResolvedValueOnce(ok(403));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      assignSavedMealToClient(workspaceId, "Emma Anders", meal, 1),
    ).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("/assignments"),
      ),
    ).toBe(false);
  });

  it("resolves false when the assignment POST fails", async () => {
    const workspaceId = "ws-assign-post500";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(roster())
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok(500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      assignSavedMealToClient(workspaceId, "Emma Anders", meal, 1),
    ).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("POST");
  });

  it("resolves false when fetch rejects", async () => {
    const workspaceId = "ws-assign-network";
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      assignSavedMealToClient(workspaceId, "Emma Anders", meal, 1),
    ).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves false without fetching on empty inputs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      assignSavedMealToClient("", "Emma Anders", meal, 1),
    ).resolves.toBe(false);
    await expect(
      assignSavedMealToClient("ws-assign-empty", "", meal, 1),
    ).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("assignSavedMealToClient - duplicate roster names", () => {
  it("blocks an ambiguous name with no PUT/POST; a unique name still assigns", async () => {
    const workspaceId = "ws-assign-duplicate";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        roster(200, [
          { clientProfileId: "cp-1", name: "Emma Anders" },
          { clientProfileId: "cp-2", name: "Emma Anders" },
          { clientProfileId: "cp-3", name: "Mika Reyes" },
        ]),
      )
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      clientProfileIdForName(workspaceId, "Emma Anders"),
    ).resolves.toBe(null);
    await expect(
      assignSavedMealToClient(workspaceId, "Emma Anders", meal, 1),
    ).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => init?.method === "PUT" || init?.method === "POST",
      ),
    ).toBe(false);

    await expect(
      assignSavedMealToClient(workspaceId, "Mika Reyes", meal, 2),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string)).toEqual({
      clientProfileId: "cp-3",
    });
  });
});
