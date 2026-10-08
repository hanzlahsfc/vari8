"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import type {
  TransitionReviewPayload,
  TransitionTargetsPayload,
} from "@/lib/coaching/client-setup-transition-boundary";
import {
  executeSetupTransition,
  loadTransitionTargets,
  reviewSetupTransition,
} from "./transition-actions";

const GENERIC = "Something went wrong. Please try again in a moment.";

/**
 * P-020B — minimal staff-facing transition review panel (decisions #58–#62).
 *
 * Rendered only when the transitions gate is on, the actor holds
 * `clientSetups` write scope, and the row's pin is ACTIVE on a non-archived
 * template. Flow: choose a target (server-selected latest upgrade or a
 * positional rollback choice) → mandatory structural review (including
 * empty diffs) → explicit confirm. Every step resubmits the positional
 * pinIndex + row fingerprint; the review fingerprint binds the exact
 * computed state — drift fails closed with a stale message.
 *
 * The panel never sees raw database ids: options are positional, the review
 * payload is serialized through `serializeTransitionReview`, and the
 * fingerprint is an opaque sha-256 consistency token.
 */

const DIRECTION_LABEL: Record<string, string> = {
  UPGRADE: "Upgrade",
  ROLLBACK: "Roll back",
};

const DETAIL_TEXT: Record<string, string> = {
  item_removed: "Parameter removed",
  item_rebound: "Item rebound to a different parameter",
  item_added: "Parameter added",
  item_moved: "Item moved",
  required_on: "Now required",
  required_off: "No longer required",
  label_changed: "Label changed",
  help_changed: "Help text changed",
  group_changed: "Group changed",
  title_changed: "Template title changed",
  section_label_changed: "Section renamed",
};

const BLOCKED_TEXT: Record<string, string> = {
  TARGET_INELIGIBLE:
    "The target version isn't structurally eligible for data collection.",
  PROVIDER_UNAVAILABLE: "A data-impact provider is unavailable.",
  PROVIDER_VERSION_MISMATCH: "A data-impact provider returned a stale version.",
  PROVIDER_EXECUTION_FAILED: "A data-impact provider failed to run.",
  PROVIDER_OUTPUT_INVALID: "A data-impact provider returned invalid output.",
  PROVIDER_REPORTED_BLOCK: "A data-impact provider reported a block.",
};

const ELIGIBILITY_TEXT: Record<string, string> = {
  snapshot_malformed: "Snapshot is malformed",
  duplicate_parameter: "Duplicate parameter reference",
  metadata_incoherent: "Parameter metadata is incoherent",
  missing_classification: "Missing data classification",
  malformed_classification: "Malformed data classification",
  specialist_classification: "Specialist classification isn't eligible",
  unsupported_kind: "Unsupported parameter kind",
  unsupported_rating_scheme: "Unsupported rating scheme",
};

const detailText = (d: string) => DETAIL_TEXT[d] ?? "Changed";
const blockedText = (c: string) =>
  BLOCKED_TEXT[c] ?? "This transition is blocked.";
const eligibilityText = (c: string) => ELIGIBILITY_TEXT[c] ?? "Not eligible";

export function TransitionPanel({
  workspaceId,
  rowIndex,
  rowFingerprint,
  clientName,
  templateName,
  pending,
  onDone,
  onClose,
}: {
  workspaceId: string;
  rowIndex: number;
  rowFingerprint: string;
  clientName: string;
  templateName: string;
  pending: boolean;
  onDone: () => void;
  onClose: () => void;
}) {
  const [targets, setTargets] = useState<TransitionTargetsPayload | null>(null);
  const [direction, setDirection] = useState<"UPGRADE" | "ROLLBACK" | null>(
    null,
  );
  const [targetIndex, setTargetIndex] = useState<string>("");
  const [review, setReview] = useState<TransitionReviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const disabled = pending || busy;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const fd = new FormData();
    fd.set("pinIndex", String(rowIndex));
    fd.set("rowFingerprint", rowFingerprint);
    let cancelled = false;
    void (async () => {
      try {
        const r = await loadTransitionTargets(workspaceId, fd);
        if (cancelled) return;
        if (!r.ok) setError(r.message);
        else setTargets(r.value);
      } catch {
        if (!cancelled) setError(GENERIC);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, rowIndex, rowFingerprint]);

  function submitReview() {
    if (direction === null) return;
    const fd = new FormData();
    fd.set("pinIndex", String(rowIndex));
    fd.set("rowFingerprint", rowFingerprint);
    fd.set("direction", direction);
    if (direction === "ROLLBACK") fd.set("targetIndex", targetIndex);
    setError(null);
    startTransition(async () => {
      try {
        const r = await reviewSetupTransition(workspaceId, fd);
        if (!r.ok) {
          setError(r.message);
          setReview(null);
          return;
        }
        setReview(r.value);
      } catch {
        setError(GENERIC);
        setReview(null);
      }
    });
  }

  function confirmTransition() {
    if (!review) return;
    const fd = new FormData();
    fd.set("pinIndex", String(rowIndex));
    fd.set("rowFingerprint", rowFingerprint);
    fd.set("direction", review.direction);
    if (review.direction === "ROLLBACK" && targetIndex !== "")
      fd.set("targetIndex", targetIndex);
    fd.set("reviewFingerprint", review.reviewFingerprint);
    fd.set("confirm", "1");
    setError(null);
    startTransition(async () => {
      try {
        const r = await executeSetupTransition(workspaceId, fd);
        if (!r.ok) {
          setError(r.message);
          setReview(null);
          return;
        }
      } catch {
        setError(GENERIC);
        setReview(null);
        return;
      }
      onDone();
    });
  }

  const canReview =
    targets !== null &&
    (direction === "UPGRADE"
      ? targets.canUpgrade
      : direction === "ROLLBACK" &&
        targetIndex !== "" &&
        targets.rollbackTargets.length > 0);

  return (
    <section
      className="transition-panel"
      aria-label={`Change version for ${clientName}`}
      data-testid="transition-panel"
    >
      <h2
        className="assignment-manager__subtitle"
        tabIndex={-1}
        ref={headingRef}
      >
        Change version — {clientName} · {templateName}
      </h2>

      {targets === null && error === null ? (
        <p className="app-lede" role="status">
          Loading version options…
        </p>
      ) : null}

      {error !== null ? (
        <p
          className="assignment-manager__alert"
          role="alert"
          data-testid="transition-alert"
        >
          {error}
        </p>
      ) : null}

      {targets !== null ? (
        <div className="transition-panel__choices">
          {targets.canUpgrade ? (
            <button
              type="button"
              className="assignment-button-secondary"
              disabled={disabled}
              aria-pressed={direction === "UPGRADE"}
              onClick={() => {
                setDirection("UPGRADE");
                setReview(null);
              }}
              data-testid="transition-upgrade-choice"
            >
              Upgrade to version {targets.latestVersionSeq}
            </button>
          ) : null}
          {targets.rollbackTargets.length > 0 ? (
            <label className="catalog-search__field">
              Roll back to
              <select
                className="catalog-search__input"
                value={direction === "ROLLBACK" ? targetIndex : ""}
                disabled={disabled}
                onChange={(e) => {
                  setDirection("ROLLBACK");
                  setTargetIndex(e.target.value);
                  setReview(null);
                }}
                data-testid="transition-rollback-select"
              >
                <option value="">Choose a version…</option>
                {targets.rollbackTargets.map((t) => (
                  <option key={t.index} value={t.index}>
                    Version {t.versionSeq}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {!targets.canUpgrade && targets.rollbackTargets.length === 0 ? (
            <p className="app-lede" role="status">
              No other versions are available for this template.
            </p>
          ) : null}
          <button
            type="button"
            className="catalog-search__submit"
            disabled={disabled || !canReview}
            onClick={submitReview}
            data-testid="transition-review-button"
          >
            Review transition
          </button>
        </div>
      ) : null}

      {review !== null ? (
        <div
          className="transition-panel__review"
          aria-live="polite"
          data-testid="transition-review"
        >
          <h3 className="assignment-manager__subtitle">
            {DIRECTION_LABEL[review.direction]} review: version{" "}
            {review.currentVersionSeq} → version {review.targetVersionSeq}
          </h3>

          {review.entries.length === 0 ? (
            <p role="status" data-testid="transition-empty-diff">
              No structural changes between the two versions. You must still
              confirm to apply this transition.
            </p>
          ) : (
            <ul
              className="transition-panel__changes"
              data-testid="transition-changes"
            >
              {review.entries.map((e, i) => (
                <li key={i} data-warn={e.warn ? "true" : undefined}>
                  {detailText(e.detail)}
                  {e.parameterLabel !== null || e.parameterKey !== null
                    ? ` — ${e.parameterLabel ?? e.parameterKey}`
                    : ""}
                  {e.reboundParameterLabel !== null ||
                  e.reboundParameterKey !== null
                    ? ` → ${e.reboundParameterLabel ?? e.reboundParameterKey}`
                    : ""}
                </li>
              ))}
            </ul>
          )}

          {review.warningCount > 0 ? (
            <p role="alert" data-testid="transition-warnings">
              {review.warningCount === 1
                ? "This transition removes or rebinds a parameter. Any existing recorded history may be affected — confirm only if intended."
                : `This transition removes or rebinds ${review.warningCount} parameters. Any existing recorded history may be affected — confirm only if intended.`}
            </p>
          ) : null}

          {review.providersDeclared === 0 ? (
            <p className="app-lede" data-testid="transition-no-providers">
              No data-collection features are installed, so recorded-history
              impact can&apos;t be evaluated for this transition.
            </p>
          ) : null}

          {review.blockedReasonCodes.length > 0 ? (
            <div role="alert" data-testid="transition-blocked">
              <p>This transition is blocked:</p>
              <ul>
                {review.blockedReasonCodes.map((c) => (
                  <li key={c}>{blockedText(c)}</li>
                ))}
                {review.eligibilityReasonCodes.map((c) => (
                  <li key={c}>{eligibilityText(c)}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="transition-panel__actions">
            {review.blockedReasonCodes.length === 0 ? (
              <button
                type="button"
                className="catalog-search__submit"
                disabled={disabled}
                onClick={confirmTransition}
                data-testid="transition-confirm"
              >
                Confirm transition
              </button>
            ) : null}
            <button
              type="button"
              className="assignment-button-secondary"
              disabled={disabled}
              onClick={() => setReview(null)}
            >
              Back
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="assignment-button-secondary"
        disabled={disabled}
        onClick={onClose}
      >
        Close
      </button>
    </section>
  );
}
