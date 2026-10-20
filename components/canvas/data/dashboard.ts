// Dashboard domain provider (PR-W0). Owns the ethereal dashboard-builder
// keys: the local draft and the sample records the widgets bind to. The
// per-variant dashboard definitions inside templates ride the templates
// slice — they are template-definition slots, not builder drafts. PR-W9
// wires this domain to the server; it edits this file only.

import { readJson, writeJson } from "./provider";

// The dashboard domain keeps no CoachSlice of the coach envelope: the
// per-variant dashboard definitions serialize inside the templates slice.
// The registry in index.ts lists the domain once, with a null slice.

const DRAFT_KEY = "ethereal-dashboard-draft-v1";
const RECORD_KEY = "ethereal-dashboard-records-v1";

/**
 * Parsed value of the stored builder draft, or undefined when absent or
 * empty. Parse failures throw so the caller shows its restore-failed notice;
 * shape validation (isValidDraft) stays with the caller.
 */
export function loadDashboardDraft(): unknown {
  return readJson(DRAFT_KEY);
}

export function saveDashboardDraft(draft: unknown): void {
  writeJson(DRAFT_KEY, draft);
}

/**
 * Parsed value of the stored sample records, or undefined when absent or
 * empty. Parse failures throw; shape validation (isValidRecords) stays with
 * the caller.
 */
export function loadDashboardRecords(): unknown {
  return readJson(RECORD_KEY);
}

export function saveDashboardRecords(records: unknown): void {
  writeJson(RECORD_KEY, records);
}
