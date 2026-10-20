// Templates domain provider (PR-W0). Owns the template library, the template
// editor drafts, and the per-client template assignments (including their
// snapshots — the assign dialog and snapshot-vs-version-pin contract belong
// to PR-W3). Variant dashboard definitions ride inside the template objects.

import type { Assignment, CoachState, Template } from "../coach/model";
import type { CoachSlice } from "./provider";

export const TEMPLATES_KEY = "coach-data-templates-v1";

type TemplatesData = {
  templates: Template[];
  editorDrafts: Record<string, Template>;
  assignments: Record<string, Assignment>;
};

export const templatesSlice: CoachSlice = {
  key: TEMPLATES_KEY,
  extract: (state): TemplatesData => ({
    templates: state.templates,
    editorDrafts: state.editorDrafts,
    assignments: Object.fromEntries(
      state.clients.flatMap((client) =>
        client.assignment ? [[client.id, client.assignment]] : [],
      ),
    ),
  }),
  merge: (slice, state) => {
    if (!slice || typeof slice !== "object")
      throw new Error("Invalid templates slice");
    const data = slice as Partial<TemplatesData>;
    state.templates = data.templates as Template[];
    state.editorDrafts = data.editorDrafts as Record<string, Template>;
    if (data.assignments && typeof data.assignments === "object")
      for (const client of state.clients) {
        const assignment = data.assignments[client.id];
        if (assignment) client.assignment = assignment;
      }
  },
};
