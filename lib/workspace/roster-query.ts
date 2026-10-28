import type { Prisma } from "@prisma/client";

/**
 * P-010 read-only client roster — pure URL query seam.
 *
 * The roster page strictly validates the `?c=` cursor and `?p=` history stack
 * before anything reaches `listAccessibleClientProfiles` (the service treats
 * `c` as an opaque `id > c` cursor). `p` carries the cursors that fetched
 * previous pages so a real Previous link works against the forward-only
 * cursor. Both builders emit only `c`/`p` on the canonical route path —
 * nothing else is propagated.
 *
 * Validation failures are not sanitized, they are rejected: the route maps
 * `null` to the repo-standard non-disclosing 403.
 */

/** Fixed server-controlled page size (the service clamps 1..100 anyway). */
export const ROSTER_PAGE_SIZE = 25;

/**
 * History sentinel marking the cursor-less first page. `-` can never collide
 * with a cursor because it fails the cursor charset.
 */
export const HISTORY_START = "-";

const MAX_HISTORY_DEPTH = 64;
const MAX_HISTORY_LENGTH = 2048;
const CURSOR_PATTERN = /^[a-z0-9]{1,64}$/i;

export type RosterQuery = {
  /** Cursor for the current page (`id > cursor`); absent on page 1. */
  cursor: string | undefined;
  /** Cursors that fetched previous pages; HISTORY_START marks page 1. */
  history: string[];
};

const isCursor = (value: string): boolean => CURSOR_PATTERN.test(value);

/**
 * Parse raw searchParams values into a RosterQuery, or return null when
 * anything is duplicated, malformed, oversized, or incoherent (`p` without
 * `c` describes a non-existent page).
 */
export function parseRosterQuery(raw: {
  c?: string | string[];
  p?: string | string[];
}): RosterQuery | null {
  const c = raw.c;
  if (c !== undefined && (typeof c !== "string" || !isCursor(c))) return null;

  const history: string[] = [];
  if (raw.p !== undefined) {
    if (typeof raw.p !== "string" || raw.p.length > MAX_HISTORY_LENGTH)
      return null;
    for (const [index, entry] of raw.p.split(",").entries()) {
      if (index >= MAX_HISTORY_DEPTH) return null;
      if (entry === HISTORY_START) {
        if (index !== 0) return null;
      } else if (!isCursor(entry)) {
        return null;
      }
      history.push(entry);
    }
  }
  if (c === undefined && history.length > 0) return null;
  return { cursor: c, history };
}

/** Current 1-based page number derived from history depth. */
export function rosterPageNumber(history: string[]): number {
  return history.length + 1;
}

function href(
  base: string,
  cursor: string | undefined,
  history: string[],
): string {
  const parts: string[] = [];
  if (cursor !== undefined) parts.push(`c=${encodeURIComponent(cursor)}`);
  if (history.length > 0)
    parts.push(`p=${history.map(encodeURIComponent).join(",")}`);
  return parts.length === 0 ? base : `${base}?${parts.join("&")}`;
}

/** Link to the next page; pushes the current page's cursor onto history. */
export function nextRosterHref(
  base: string,
  current: RosterQuery,
  nextCursor: string,
): string {
  return href(base, nextCursor, [
    ...current.history,
    current.cursor ?? HISTORY_START,
  ]);
}

/** Link back to the previous page; null on page 1. */
export function prevRosterHref(base: string, history: string[]): string | null {
  if (history.length === 0) return null;
  const popped = history[history.length - 1];
  return href(
    base,
    popped === HISTORY_START ? undefined : popped,
    history.slice(0, -1),
  );
}

/**
 * PR-M1 (D27): archived clients leave the roster. Every roster-scoped
 * client-profile query composes this predicate so "hide archived" is defined
 * in exactly one place. Pass `includeArchived` only where a surface
 * deliberately lists archived profiles (the staff restore flow).
 */
export function rosterClientVisibility(
  includeArchived: boolean,
): Prisma.ClientProfileWhereInput {
  return includeArchived ? {} : { archivedAt: null };
}
