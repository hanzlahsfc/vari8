// @vitest-environment jsdom

/**
 * w2-photo-tiles (verifier F3): the gallery must not orphan in-flight media
 * mints. A second entries load that lands while mints are still pending
 * (the real user path here is Delete, which re-lists after the delete) has
 * to let the still-pending ids mint again on the next pass. The cancelled
 * first pass can never write their urls, so entries left in `requested`
 * would render as permanent placeholder tiles.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchMediaDownload } from "@/components/canvas/data/media";
import {
  deleteProgressPhoto,
  listProgressPhotos,
  type ProgressPhotoEntryWire,
} from "@/components/canvas/data/progress-photos";
import { PhotosPanel } from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/photos/photos-panel";

vi.mock("@/components/canvas/data/media", () => ({
  fetchMediaDownload: vi.fn(),
}));

vi.mock("@/components/canvas/data/progress-photos", () => ({
  listProgressPhotos: vi.fn(),
  compareProgressPhotos: vi.fn(),
  deleteProgressPhoto: vi.fn(),
}));

afterEach(cleanup);

const entry = (id: string, mediaObjectId: string): ProgressPhotoEntryWire => ({
  id,
  mediaObjectId,
  takenOn: `2026-10-${id.slice(-2)}`,
  clientVisible: true,
  checkInSubmissionId: null,
  createdAt: "2026-10-24T00:00:00.000Z",
});

type Mint = { download: { url: string; expiresAt: string } };

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const mintFor = (mediaObjectId: string): Mint => ({
  download: {
    url: `https://media.test/${mediaObjectId}`,
    expiresAt: "2026-10-24T01:00:00.000Z",
  },
});

describe("PhotosPanel media mints", () => {
  it("re-mints entries whose download mint was cancelled mid-flight", async () => {
    const initial = [
      entry("e-01", "m-1"),
      entry("e-02", "m-2"),
      entry("e-03", "m-3"),
      entry("e-04", "m-4"),
    ];
    const mints = new Map<string, ReturnType<typeof deferred<Mint>>[]>();
    vi.mocked(fetchMediaDownload).mockImplementation((_ws, id) => {
      const d = deferred<Mint>();
      const list = mints.get(id) ?? [];
      list.push(d);
      mints.set(id, list);
      return d.promise as Promise<
        Awaited<ReturnType<typeof fetchMediaDownload>>
      >;
    });
    vi.mocked(listProgressPhotos)
      .mockResolvedValueOnce({ entries: initial })
      .mockResolvedValue({ entries: initial.slice(0, 3) });
    vi.mocked(deleteProgressPhoto).mockResolvedValue({
      deleted: true,
      id: "e-04",
    });

    render(<PhotosPanel workspaceId="w-1" clientProfileId="c-1" />);

    await waitFor(() =>
      expect(document.querySelectorAll(".photos-gallery__item")).toHaveLength(
        4,
      ),
    );

    // Only the first mint resolves before the list changes; m-2..m-4 stay
    // in flight when the delete reload swaps the entries array.
    await act(async () => mints.get("m-1")![0].resolve(mintFor("m-1")));
    await waitFor(() =>
      expect(
        document.querySelectorAll(".photos-gallery__item img"),
      ).toHaveLength(1),
    );

    await act(async () =>
      fireEvent.click(
        screen.getAllByRole("button", { name: "Delete" }).at(-1)!,
      ),
    );
    await waitFor(() =>
      expect(document.querySelectorAll(".photos-gallery__item")).toHaveLength(
        3,
      ),
    );

    // The cancelled first-round mints land now; their writes must not count.
    await act(async () => {
      mints.get("m-2")![0].resolve(mintFor("m-2"));
      mints.get("m-3")![0].resolve(mintFor("m-3"));
      mints.get("m-4")![0].resolve(mintFor("m-4"));
    });

    // The second pass re-mints only the still-unresolved ids.
    await waitFor(() =>
      expect(vi.mocked(fetchMediaDownload).mock.calls).toHaveLength(6),
    );
    await act(async () => {
      for (const id of ["m-2", "m-3"])
        mints.get(id)!.at(-1)!.resolve(mintFor(id));
    });
    await waitFor(() =>
      expect(
        document.querySelectorAll(".photos-gallery__item img"),
      ).toHaveLength(3),
    );
    // m-1 resolved before the reload and keeps its url; m-2 and m-3 are
    // minted once more by the second pass. Nothing is minted for m-4.
    expect(vi.mocked(fetchMediaDownload).mock.calls).toHaveLength(6);
  });
});
