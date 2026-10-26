// Validator for OWNER-AUTHORIZED SCOPED TRANSITION manifests (v2).
// Single-step executor contract: each invocation selects one authorized PR.
// Fail closed on: wrong kind, bypass flags, altered activation boundary,
// missing/invalid authorization record, malformed or unpinned fields.
// Pure module — no I/O.
const HEX40 = /^[0-9a-f]{40}$/;
const SAFE = /^[a-zA-Z0-9._\/-]+$/;

export function validateTransitionManifest(m) {
  const fail = (msg) => {
    throw new Error(`transition manifest: ${msg}`);
  };
  if (!m || typeof m !== "object") fail("not an object");
  if (m.kind !== "owner-authorized-scoped-transition")
    fail("kind must be owner-authorized-scoped-transition");
  if (m.skipVerdict !== undefined || m.bypass !== undefined)
    fail("generic bypass flags are forbidden");
  if (m.baselineActivation !== "prohibited")
    fail("baselineActivation must be exactly 'prohibited'");

  // Authorization: three separately-pinned records — merge authorization,
  // scoped technical acceptance, and the executor role. Each must name the
  // concrete recorded evidence, not merely a nonempty string.
  const az = m.authorization;
  if (!az || typeof az !== "object") fail("authorization block required");
  for (const key of ["mergeAuthorization", "scopedAcceptance"]) {
    const rec = az[key];
    if (!rec || typeof rec !== "object") fail(`authorization.${key} required`);
    if (
      typeof rec.commentUrl !== "string" ||
      !/^https:\/\/[a-zA-Z0-9._\/-]+#issuecomment-[0-9]+$/.test(rec.commentUrl)
    )
      fail(`authorization.${key}.commentUrl must be a safe URL`);
    if (!/issuecomment-\d+/.test(rec.commentUrl))
      fail(`authorization.${key}.commentUrl must name a recorded comment`);
    if (typeof rec.author !== "string" || !rec.author.length)
      fail(`authorization.${key}.author required (identity to verify)`);
    if (typeof rec.contains !== "string" || rec.contains.length < 8)
      fail(`authorization.${key}.contains must pin recognizable content`);
  }
  if (!m.executor || typeof m.executor.role !== "string" || !m.executor.role)
    fail("executor.role required");

  if (!Array.isArray(m.items) || m.items.length === 0)
    fail("items must list authorized PRs in order");
  const seen = new Set();
  m.items.forEach((it, i) => {
    if (!Number.isInteger(it?.order) || it.order !== i + 1)
      fail(`items[${i}].order must be ${i + 1}`);
    if (!Number.isInteger(it?.pr) || it.pr <= 0) fail(`items[${i}].pr invalid`);
    if (!HEX40.test(it?.head ?? "")) fail(`items[${i}].head must be 40-hex`);
    // Honest stacked base: whatever the PR currently targets — may be another
    // step's branch. Retargeting is a separate authorized operation.
    if (typeof it?.base !== "string" || !it.base.length || !SAFE.test(it.base))
      fail(`items[${i}].base required`);
    if (
      typeof it?.branch !== "string" ||
      !it.branch.length ||
      !SAFE.test(it.branch)
    )
      fail(`items[${i}].branch required (the PR's head branch)`);
    if (typeof it?.isDraft !== "boolean")
      fail(`items[${i}].isDraft must record the PR's actual draft state`);
    if (it?.dependsOn !== undefined && !Array.isArray(it.dependsOn))
      fail(`items[${i}].dependsOn must be an array of PR numbers`);
    if (seen.has(it.pr)) fail(`duplicate PR ${it.pr}`);
    seen.add(it.pr);
  });
  // Prerequisite sanity: a step whose base is another step's head branch must
  // declare that dependency and be ordered after it.
  m.items.forEach((it) => {
    const dep = m.items.find((o) => o !== it && o.branch === it.base);
    if (dep) {
      if (!Array.isArray(it.dependsOn) || !it.dependsOn.includes(dep.pr))
        fail(`PR ${it.pr} bases on PR ${dep.pr}'s branch; declare dependsOn`);
      if (dep.order >= it.order)
        fail(`PR ${it.pr} depends on PR ${dep.pr} but is not ordered after`);
    }
  });

  if (m.gates?.fast !== true) fail("gates.fast must be true");
  const cg = m.gates?.combined;
  if (cg?.required !== true) fail("gates.combined.required must be true");
  if (
    !Array.isArray(cg?.runner) ||
    !cg.runner.every((a) => typeof a === "string")
  )
    fail("gates.combined.runner must be an argv array");
  if (
    typeof cg?.reference !== "string" ||
    !cg.reference.startsWith("tools/parity/")
  )
    fail("gates.combined.reference must be a tools/parity path");
  if (!Number.isInteger(cg?.expectedCanonical))
    fail("gates.combined.expectedCanonical must be an integer");
  if (m.baseline?.paths && !Array.isArray(m.baseline.paths))
    fail("baseline.paths must be an array of path prefixes");
  return m;
}
