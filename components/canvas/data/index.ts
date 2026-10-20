// The canvas data seam (PR-W0): one provider file per domain. Every domain
// is listed here once, so a later wiring PR edits only its own provider
// file. The monolithic `coach-desktop-mockup-v1` envelope is separated
// before serializing into one localStorage key per domain, and the ethereal
// localStorage keys live behind their domain providers too. Local reads and
// writes go through provider.ts, the only module that touches localStorage;
// remote transport goes through http.ts, the shared /api/v1 client (O1).

import { STORAGE_KEY as LEGACY_KEY, type CoachState } from "../coach/model";
import { appearanceSlice } from "./appearance";
import { checkinsSlice } from "./checkins";
import { clientsSlice } from "./clients";
import { habitsSlice } from "./habits";
import { messagesSlice } from "./messages";
import { notesSlice } from "./notes";
import { nutritionSlice } from "./nutrition";
import {
  type CoachSlice,
  readStorage,
  removeStorage,
  writeJson,
} from "./provider";
import { templatesSlice } from "./templates";
import { trackerSlice } from "./tracker";
import { trainingSlice } from "./training";

export { ApiClientError, apiFetch } from "./http";

/**
 * Every data domain once, in merge order. `slice` owns the domain's share of
 * the persisted coach state; `keys` lists the other localStorage keys the
 * domain owns (its ethereal drafts). Clients merges first because the other
 * domains fold their slices onto the client cores it restores; the dashboard
 * domain keeps no coach slice because variant dashboards serialize inside
 * templates.
 */
export const dataDomains = [
  {
    domain: "clients",
    slice: clientsSlice,
    keys: ["coaching-clients-workspace-v1"],
  },
  { domain: "templates", slice: templatesSlice, keys: [] },
  { domain: "checkins", slice: checkinsSlice, keys: [] },
  { domain: "habits", slice: habitsSlice, keys: [] },
  {
    domain: "nutrition",
    slice: nutritionSlice,
    keys: ["coaching-mealplans-v1"],
  },
  { domain: "training", slice: trainingSlice, keys: [] },
  {
    domain: "dashboard",
    slice: null,
    keys: ["ethereal-dashboard-draft-v1", "ethereal-dashboard-records-v1"],
  },
  { domain: "notes", slice: notesSlice, keys: [] },
  { domain: "messages", slice: messagesSlice, keys: [] },
  {
    domain: "appearance",
    slice: appearanceSlice,
    keys: ["coaching-ethereal-appearance-v1"],
  },
  {
    domain: "tracker",
    slice: trackerSlice,
    keys: ["coaching-client-tracker-maya-v1"],
  },
] as const;

const slices: CoachSlice[] = dataDomains.flatMap(({ slice }) =>
  slice ? [slice] : [],
);

/**
 * Reads the persisted coach state for the store's hydration.
 *
 * Returns undefined when nothing is stored (the store keeps its seed) and
 * the candidate state otherwise — assembled from the domain slices, or the
 * legacy `coach-desktop-mockup-v1` envelope when only it exists. The caller
 * runs the same migrate + isCoachState + normalize pipeline on the candidate
 * as the single-envelope read did, so an invalid candidate keeps the
 * preserve-the-raw notice path, and the legacy key is only dropped after a
 * full write of the new slices (writeCoachState), never before.
 *
 * Throws on unreadable data — bad JSON or an incomplete set of domain keys —
 * the same path a corrupt envelope took before.
 */
export function readCoachState(): unknown {
  const raws = slices.map((slice) => readStorage(slice.key));
  const present = raws.filter((raw) => raw !== null).length;
  if (present === 0) {
    const legacy = readStorage(LEGACY_KEY);
    if (!legacy) return undefined;
    return JSON.parse(legacy);
  }
  if (present !== slices.length)
    throw new Error("Persisted coach data is incomplete.");
  const state = { version: 1 } as CoachState;
  for (const [index, slice] of slices.entries()) {
    const envelope: unknown = JSON.parse(raws[index] as string);
    if (!envelope || typeof envelope !== "object" || !("data" in envelope))
      throw new Error(`Invalid ${slice.key} envelope`);
    slice.merge((envelope as { data: unknown }).data, state);
  }
  return state;
}

/**
 * Persists the coach state as one key per domain, then drops the legacy
 * envelope once every slice is written so a crash mid-write cannot lose the
 * last complete copy. Throws on a storage failure, like the single setItem
 * did.
 */
export function writeCoachState(state: CoachState): void {
  for (const slice of slices)
    writeJson(slice.key, { version: 1, data: slice.extract(state) });
  try {
    removeStorage(LEGACY_KEY);
  } catch {
    // Not fatal: a leftover legacy key loses precedence to the slices.
  }
}
