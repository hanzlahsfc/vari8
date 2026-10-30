import type { ReusableMeal } from "./model";

/**
 * The studio Assign action talks to the real saved-meals API.
 * The roster lookup mirrors components/canvas/coach/store.tsx: one roster
 * fetch per workspace per session, successes are cached, failures are not.
 */

type RosterEntry = { clientProfileId: string; name: string };

const clientRoster = new Map<string, Promise<Map<string, string> | null>>();

export async function clientProfileIdForName(
  workspaceId: string,
  clientName: string,
): Promise<string | null> {
  if (!workspaceId || !clientName) return null;
  let pending = clientRoster.get(workspaceId);
  if (!pending) {
    pending = fetch(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/clients?limit=100`,
    )
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json().catch(() => null)) as {
          items?: RosterEntry[];
        } | null;
        const roster = new Map<string, string>();
        const ambiguous = new Set<string>();
        for (const entry of body?.items ?? []) {
          if (roster.has(entry.name)) ambiguous.add(entry.name);
          roster.set(entry.name, entry.clientProfileId);
        }
        // A name shared by multiple clients never binds: the assign path
        // would otherwise write to whichever profile loaded last.
        for (const name of ambiguous) roster.delete(name);
        return roster;
      })
      .catch(() => null);
    clientRoster.set(workspaceId, pending);
  }
  const roster = await pending;
  if (roster === null) {
    clientRoster.delete(workspaceId);
    return null;
  }
  return roster.get(clientName) ?? null;
}

/**
 * Save-then-assign: the library row is upserted under the studio
 * `ReusableMeal.id` (idempotent per meal), then one POST creates a fresh
 * client-owned copy. Resolves true only when the assignment POST answers 2xx;
 * every miss (no workspace, no profile match, non-2xx, network error)
 * resolves false so the caller renders the honest failure message.
 */
export async function assignSavedMealToClient(
  workspaceId: string,
  clientName: string,
  meal: ReusableMeal,
  sortOrder?: number,
): Promise<boolean> {
  if (!workspaceId || !clientName) return false;
  try {
    const clientProfileId = await clientProfileIdForName(
      workspaceId,
      clientName,
    );
    if (!clientProfileId) return false;
    const base = `/api/v1/saved-meals/${encodeURIComponent(workspaceId)}/${encodeURIComponent(meal.id)}`;
    const upsert = await fetch(base, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: meal.name,
        meal: meal.meal,
        sortOrder,
      }),
    });
    if (!upsert.ok) return false;
    const assignment = await fetch(`${base}/assignments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientProfileId }),
    });
    return assignment.ok;
  } catch {
    return false;
  }
}
