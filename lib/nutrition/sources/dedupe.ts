/**
 * #182 cross-source dedupe decision binding — a recorded human decision
 * applies ONLY to the exact candidate pairs it covers. Anything else
 * refuses; there is no general authorization for new candidates.
 */

import { readFileSync } from "node:fs";

import { SourceAdapterError } from "./common";

export interface DedupeCandidate {
  name: string;
  rows: { name: string; sourceId: string; source: string }[];
}

interface DecisionPair {
  name: string;
  rows: { source: string; sourceId: string }[];
}

interface Decision {
  verdict: string;
  decisionMaker: string;
  decidedAt: string;
  commentUrl: string;
  pairs: DecisionPair[];
}

const APPROVED_VERDICT = "retain separate source records";

/** Canonical pair key — source-name + stable source-id sets,
 * independent of row/pair ordering. */
function pairKey(rows: { source: string; sourceId: string }[]): string {
  return rows
    .map((r) => `${r.source}:${r.sourceId}`)
    .sort()
    .join("|");
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Validate the decision record and bind it to the detected pairs.
 * Throws SourceAdapterError on malformed, empty, duplicate, stale or
 * unrelated records — never reports "decided" on partial coverage. */
export function applyDedupeDecision(
  candidates: DedupeCandidate[],
  decisionFile: string,
): { status: "decided"; decision: Decision } {
  let decision: Decision;
  try {
    decision = JSON.parse(readFileSync(decisionFile, "utf8"));
  } catch (e) {
    throw new SourceAdapterError(
      "unexpected_header",
      `dedupe decision unreadable: ${(e as Error).message}`,
    );
  }
  if (
    typeof decision !== "object" ||
    decision === null ||
    decision.verdict !== APPROVED_VERDICT ||
    !decision.decisionMaker ||
    !decision.decidedAt ||
    !decision.commentUrl ||
    !Array.isArray(decision.pairs) ||
    decision.pairs.length === 0
  )
    throw new SourceAdapterError(
      "unexpected_header",
      "dedupe decision malformed: required fields/verdict/pairs missing or empty",
    );

  const detected = new Map<string, DedupeCandidate>();
  for (const c of candidates) detected.set(pairKey(c.rows), c);

  const seen = new Set<string>();
  for (const p of decision.pairs) {
    if (!p.name || !Array.isArray(p.rows) || p.rows.length < 2)
      throw new SourceAdapterError(
        "unexpected_header",
        `dedupe decision pair malformed: ${JSON.stringify(p)}`,
      );
    const key = pairKey(p.rows);
    if (seen.has(key))
      throw new SourceAdapterError(
        "unexpected_header",
        `dedupe decision has duplicate pair: ${p.name}`,
      );
    seen.add(key);
    const hit = detected.get(key);
    if (!hit || normalizeName(hit.name) !== normalizeName(p.name))
      throw new SourceAdapterError(
        "unexpected_header",
        `dedupe decision covers pair not detected in this run: ${p.name}`,
      );
  }
  if (detected.size !== decision.pairs.length)
    throw new SourceAdapterError(
      "unexpected_header",
      `dedupe decision covers ${decision.pairs.length} pairs; this run detected ${detected.size} — a decision applies to its exact pair set only`,
    );
  return { status: "decided", decision };
}
