import { describe, expect, it } from "vitest";

import {
  type MediaLibraryItem,
  mediaLibraryItemsVisible,
} from "../../components/canvas/coach/media";

/**
 * T6 (R7): the library's type and ownership filter predicate - the same
 * pure function the coach UI runs on both twins.
 */
const items: MediaLibraryItem[] = [
  {
    id: "a",
    name: "guide.jpg",
    type: "image",
    size: 10,
    owner: null,
    assigned: false,
  },
  {
    id: "b",
    name: "clip.mp4",
    type: "video",
    size: 10,
    owner: null,
    assigned: true,
  },
  {
    id: "c",
    name: "photo.png",
    type: "image",
    size: 10,
    owner: "Anna",
    assigned: false,
  },
  {
    id: "d",
    name: "note.wav",
    type: "audio",
    size: 10,
    owner: "Anna",
    assigned: true,
  },
];

describe("mediaLibraryItemsVisible", () => {
  it("returns everything without filters", () => {
    expect(mediaLibraryItemsVisible(items, "all", "all")).toHaveLength(4);
  });

  it("filters by type across kinds", () => {
    expect(
      mediaLibraryItemsVisible(items, "image", "all").map((i) => i.id),
    ).toEqual(["a", "c"]);
    expect(
      mediaLibraryItemsVisible(items, "audio", "all").map((i) => i.id),
    ).toEqual(["d"]);
    expect(mediaLibraryItemsVisible(items, "document", "all")).toHaveLength(0);
  });

  it("filters by ownership: library items vs client uploads", () => {
    expect(
      mediaLibraryItemsVisible(items, "all", "library").map((i) => i.id),
    ).toEqual(["a", "b"]);
    expect(
      mediaLibraryItemsVisible(items, "all", "client").map((i) => i.id),
    ).toEqual(["c", "d"]);
  });

  it("combines type and ownership", () => {
    expect(
      mediaLibraryItemsVisible(items, "image", "client").map((i) => i.id),
    ).toEqual(["c"]);
    expect(
      mediaLibraryItemsVisible(items, "video", "library").map((i) => i.id),
    ).toEqual(["b"]);
    expect(mediaLibraryItemsVisible(items, "video", "client")).toHaveLength(0);
  });
});
