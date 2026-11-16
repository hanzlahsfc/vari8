/** Per-reply remount ticks for the saved-replies list. Rejecting a
 * blank edit must restore only its own field: bumping a reply's tick
 * changes that input's key alone, so the field remounts and re-seeds
 * its saved text while every other row keeps its component — and with
 * it any uncommitted draft and the caret/focus it holds. */

export type ReplyRestoreTicks = Record<string, number>;

export function bumpReplyRestore(
  ticks: ReplyRestoreTicks,
  id: string,
): ReplyRestoreTicks {
  return { ...ticks, [id]: (ticks[id] ?? 0) + 1 };
}

/** The reply input's remount key — stable across other replies' ticks. */
export function replyInputKey(id: string, ticks: ReplyRestoreTicks): string {
  return `${id}:${ticks[id] ?? 0}`;
}
