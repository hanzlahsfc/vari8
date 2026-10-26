// Validator for OWNER-AUTHORIZED SCOPED TRANSITION manifests.
// Fail closed: any missing field, mismatched shape, altered activation
// boundary or generic bypass flag is an error. Pure module — no I/O.
const HEX40 = /^[0-9a-f]{40}$/;

export function validateTransitionManifest(m) {
  const fail = (msg) => {
    throw new Error(`transition manifest: ${msg}`);
  };
  if (!m || typeof m !== "object") fail("not an object");
  if (m.kind !== "owner-authorized-scoped-transition")
    fail(
      "kind must be owner-authorized-scoped-transition (not independent SHIP)",
    );
  if (m.skipVerdict !== undefined || m.bypass !== undefined)
    fail("generic bypass flags are forbidden");
  if (m.baselineActivation !== "prohibited")
    fail("baselineActivation must be exactly 'prohibited'");
  if (!Array.isArray(m.ownerDecisions) || m.ownerDecisions.length === 0)
    fail("ownerDecisions (records + scoped acceptance) required");
  for (const d of m.ownerDecisions) {
    if (!d || typeof d.ref !== "string" || !d.ref.length)
      fail("each ownerDecision needs a ref");
  }
  if (!m.executor || typeof m.executor.role !== "string" || !m.executor.role)
    fail("executor.role required");
  if (!Array.isArray(m.items) || m.items.length === 0)
    fail("items must list authorized PRs in order");
  const seen = new Set();
  m.items.forEach((it, i) => {
    if (!Number.isInteger(it?.order) || it.order !== i + 1)
      fail(`items[${i}].order must be ${i + 1} (explicit sequence)`);
    if (!Number.isInteger(it?.pr) || it.pr <= 0) fail(`items[${i}].pr invalid`);
    if (!HEX40.test(it?.head ?? ""))
      fail(`items[${i}].head must be a 40-hex sha`);
    if (typeof it?.base !== "string" || !it.base.length)
      fail(`items[${i}].base required`);
    if (seen.has(it.pr)) fail(`duplicate PR ${it.pr}`);
    seen.add(it.pr);
  });
  if (m.gates?.fast !== true) fail("gates.fast must be true (mandatory)");
  const cg = m.gates?.combined;
  if (cg?.required !== true) fail("gates.combined.required must be true");
  if (
    typeof cg?.evidence !== "string" ||
    !cg.evidence.startsWith("tools/parity/")
  )
    fail("gates.combined.evidence must be a tools/parity path");
  return m;
}
