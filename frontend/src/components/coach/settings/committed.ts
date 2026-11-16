/** Reconciliation model for the committed settings text field. The field
 * normalizes a draft with the same rule the caller uses for the read
 * projection, so a stored value that comes back through props is
 * recognised as the field's own write rather than an outside change. */

export type CommitOutcome =
  | { action: "save"; submitted: string }
  | { action: "discard" }
  | { action: "noop" };

/** Decide what a commit (blur, Enter or debounce) should do with a draft.
 * `external` means a different value arrived while editing — the stale
 * draft must be dropped, never written over it. A draft that normalizes
 * to the current value or to the value we already submitted saves
 * nothing. */
export function decideCommit({
  draft,
  value,
  lastSent,
  external,
  normalize = (v: string) => v,
}: {
  draft: string;
  value: string;
  lastSent: string | null;
  external: boolean;
  normalize?: (value: string) => string;
}): CommitOutcome {
  if (external) return { action: "discard" };
  const submitted = normalize(draft);
  if (submitted !== value && submitted !== lastSent)
    return { action: "save", submitted };
  return { action: "noop" };
}

export type AckOutcome =
  | { kind: "own" }
  | { kind: "external" }
  | { kind: "resync" };

/** Classify a prop change: the echo of our own submission (drop the
 * marker), an outside write while editing (mark the draft stale) or a
 * plain resync for an unfocused field. */
export function acknowledgeValue({
  value,
  lastSent,
  focused,
}: {
  value: string;
  lastSent: string | null;
  focused: boolean;
}): AckOutcome {
  if (lastSent !== null && value === lastSent) return { kind: "own" };
  return { kind: focused ? "external" : "resync" };
}
