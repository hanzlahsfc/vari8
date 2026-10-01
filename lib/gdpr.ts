/**
 * S1-G privacy/GDPR boundary.
 *
 * The allowlist export (`lib/gdpr/export.ts`), retention policy-as-data
 * (`lib/gdpr/retention.ts`), and the storage port (`lib/storage.ts`) are
 * internal services only. No external surface may reach them until all of the
 * following exist:
 *
 * - the S1-H routing slice (reviewed routes/actions, typed 403 handling);
 * - the export delivery mechanism (download/streaming policy is undecided);
 * - an independent different-model review of this slice;
 * - every deferred erasure path (all blocked on `TODO(human)` policy — see
 *   `docs/tasks/s1-g-privacy-storage.md` §5) and route-layer rate limiting.
 *
 * This assertion fails closed; it is not a no-op placeholder.
 */
export class GdprNotExposableError extends Error {
  constructor(readonly code: "gdpr_not_exposable") {
    super(code);
    this.name = "GdprNotExposableError";
  }
}

export function assertGdprExternallyExposable(): never {
  throw new GdprNotExposableError("gdpr_not_exposable");
}
