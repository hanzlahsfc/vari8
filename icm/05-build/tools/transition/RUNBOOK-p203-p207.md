# Supervised transition runbook — PR #203 → #206 → #207

Status: preparation + no-merge verification only. PR #209's executor is NOT approved for
execution (parked, unmodified). This runbook is the concrete supervised procedure — exact
commands and checkpoints, no reusable framework.

Owner authorization (task P447/P450, 2026-10-26): integrate #203, #206, #207 in order under
the disclosed cross-review arrangement, conditional on reviewed tooling and real gates.
Baseline activation and deployment are prohibited.
**Pending authorization input:** a human-posted GitHub comment recording this decision. It
must name author, approved heads and activation prohibition. No merge step may run before it
is supplied and verified; nothing agent-authored substitutes for it.

## Pinned state (verified live 2026-10-26)

| step | PR   | head                                       | branch                               | current base                        | draft |
| ---- | ---- | ------------------------------------------ | ------------------------------------ | ----------------------------------- | ----- |
| 1    | #203 | `90c16bee63e2609ebc4f09e91459332390562464` | beta/parity-https                    | Vari8-Beta                          | yes   |
| 2    | #206 | `43b63ed0f41e6e92e93ecf72065c0190c9ef3dea` | beta/visual-reference-establishment  | beta/parity-https                   | yes   |
| 3    | #207 | `04902f1dc3d317e0959ae533f2f4c479a8fc55f9` | beta/p203-p206-combined-verification | beta/visual-reference-establishment | yes   |

Permitted deviation from canonical `integrate.sh`: the stacked sequence — #203 lands on
Vari8-Beta first, then #206 and #207 are explicitly retargeted and re-integrated. Everything
else is preserved: real shared lock, isolated test merge, fast gate, combined gate,
head-pinned merge, post-merge parent/tree/audit checks, baseline boundary.

## #203 preparation — exact commands (already executed; transcript `p452/prep.log`)

```bash
set -euo pipefail

# variables — all defined; secrets from env only (POSTGRES_PASSWORD, BETTER_AUTH_SECRET)
REPO=hanzlahsfc/vari8
HEADSHA=90c16bee63e2609ebc4f09e91459332390562464   # pinned #203 head
BASE=Vari8-Beta
HEAD="$HEADSHA"
BUNDLE_COMMIT=04902f1dc3d317e0959ae533f2f4c479a8fc55f9
BUNDLE_PATH=tools/parity
BUNDLE_TREE=f457065f61753245b6853ac3ddb3236deb00c8bd
NODE="npx -y node@24.22.1"
PORT=${PORT:-58152}
RUN_ID=p203-prep      # this task's run identity — receipt + capture out-dir

# task-owned scratch — REQUIRED input, never a shared default. An existing
# directory must carry this task's sentinel (bound to its canonical path) or
# the block refuses untouched; a symlinked destination refuses outright.
SCRATCH="${SCRATCH:?set SCRATCH to a task-owned scratch directory}"
SCRATCH="$(cd -P "$(dirname "$SCRATCH")" && pwd -P)/$(basename "$SCRATCH")"
[[ ! -L "$SCRATCH" ]] || { echo "refusing symlinked scratch $SCRATCH"; exit 4; }
if [[ -e "$SCRATCH" ]]; then
  grep -qxF "$SCRATCH" "$SCRATCH/.task-owned" 2>/dev/null \
    || { echo "refusing foreign/unowned $SCRATCH"; exit 4; }
else
  mkdir -p "$SCRATCH" && echo "$SCRATCH" > "$SCRATCH/.task-owned"
fi
. icm/05-build/tools/paths.sh   # canonical LOCKS — before WT (paths.sh sets WT)
WT="$SCRATCH/wt"; STATE="$SCRATCH/state"; DB=app_p203
[[ ! -e "$WT" ]] || { echo "WT $WT already exists — refusing to reuse"; exit 4; }
mkdir -p "$STATE" "$SCRATCH/overlay"

# refuse-before-mutation — every cleanup/removal below re-verifies the target
# resolves inside THIS canonical scratch and is not a symlink alias
task_owned() {
  [[ -n "${1:-}" && "$1" == "$SCRATCH/"* && ! -L "$1" ]] || return 1
  local d; d="$(cd -P "$(dirname -- "$1")" && pwd -P)" || return 1
  [[ "$d/$(basename -- "$1")" == "$SCRATCH/"* ]] \
    && grep -qxF "$SCRATCH" "$SCRATCH/.task-owned" >/dev/null
}

# lock — the REAL shared repository-wide integration lock (same file every
# task contends on; per-scratch paths would serialize nothing). LOCKS comes
# from the canonical paths.sh derivation ($VARI8_WORKTREES or program-config).
mkdir -p "$LOCKS"; exec 9>"$LOCKS/Vari8-Beta.lock"; flock -x 9
trap 'flock -u 9 2>/dev/null; exec 9>&-; [[ "${DB_CREATED:-}" == 1 ]] && docker exec "$DB_CONTAINER" dropdb -U app --if-exists "$DB" 2>/dev/null; true' EXIT

# isolated worktree FIRST — at the pinned PR head; no `git -C $WT` before this
git worktree add "$WT" --detach "$HEADSHA"

# revalidate refs (live, under the lock)
gh pr view 203 -R "$REPO" --json headRefOid,baseRefName,state,isDraft
git -C "$WT" fetch -q origin
BASETIP=$(git -C "$WT" rev-parse "origin/$BASE")   # explicit, recorded
git -C "$WT" merge -q --no-ff --no-edit -m "test merge transition p203" "$BASETIP"
# both inputs must be ancestors of the merge result
git -C "$WT" merge-base --is-ancestor "$HEADSHA" HEAD || exit 4
git -C "$WT" merge-base --is-ancestor "$BASETIP" HEAD || exit 4
TMERGE=$(git -C "$WT" rev-parse HEAD)            # the test-merge commit itself
MERGETREE=$(git -C "$WT" rev-parse 'HEAD^{tree}')
git -C "$WT" diff --stat "$BASETIP" HEAD -- app lib db | head -20   # #203 changes present

# baseline boundary — BEFORE
git -C "$WT" rev-parse "origin/$BASE:$BUNDLE_PATH/baseline"
git -C "$WT" rev-parse -q --verify "origin/$BASE:$BUNDLE_PATH/reference/active" \
  || echo "no active reference on base"

# disposable task DB — verified container (app-db-1, postgres:16-alpine).
# Admin inside the container; host port resolved from its published mapping —
# never hardcoded. A pre-existing DB refuses; ONLY a DB this invocation
# created is dropped on exit (refusals/failures leave foreign DBs untouched).
DB_CONTAINER="${DB_CONTAINER:-app-db-1}"
DB=app_p203
docker inspect "$DB_CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q true \
  || { echo "db container '$DB_CONTAINER' not running"; exit 2; }
DB_PORT=$(docker inspect "$DB_CONTAINER" --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}')
if docker exec "$DB_CONTAINER" psql -U app -d postgres -lqt 2>/dev/null | grep -qw "$DB"; then
  echo "database $DB exists — not this task's, refusing"; exit 2
fi
docker exec "$DB_CONTAINER" createdb -U app "$DB" && DB_CREATED=1
export DATABASE_URL="postgresql://app:${POSTGRES_PASSWORD}@127.0.0.1:${DB_PORT}/${DB}?schema=public"

# dirty-state refusal probe — the runner MUST refuse (expected failure is
# explicit, not a set -e abort); file restored byte-identically before gates
cp "$WT/$BUNDLE_PATH/run.mjs" "$STATE/run.mjs.bak"
echo dirty >> "$WT/$BUNDLE_PATH/run.mjs"
if (cd "$WT" && $NODE $BUNDLE_PATH/run.mjs); then
  echo "dirty state ACCEPTED — runner refusal gate broken"; exit 5
fi
echo "dirty-state refusal confirmed"
cmp -s "$STATE/run.mjs.bak" "$WT/$BUNDLE_PATH/run.mjs" || cp "$STATE/run.mjs.bak" "$WT/$BUNDLE_PATH/run.mjs"
shasum -a 256 "$STATE/run.mjs.bak" "$WT/$BUNDLE_PATH/run.mjs"   # byte-identical proof

# fast gate — unmasked exits
cd "$WT"; npm ci --no-audit --no-fund --prefer-offline
$NODE ./node_modules/.bin/prisma generate
$NODE ./node_modules/.bin/prisma migrate deploy
$NODE ./node_modules/.bin/tsc --noEmit
$NODE ./node_modules/.bin/eslint .
npm run test
$NODE ./node_modules/.bin/next build

# reviewed tooling overlay — pinned bundle grafted as a temp task-owned commit.
# The #203 merge tree lacks tools/parity/reference; the overlay supplies gate tools only.
# Verify: git diff HEAD~1 HEAD -- ':!tools/parity' must be EMPTY (no app/product/auth change).
[[ "$(git rev-parse "$BUNDLE_COMMIT:$BUNDLE_PATH")" == "$BUNDLE_TREE" ]] \
  || { echo "bundle tree mismatch at $BUNDLE_COMMIT:$BUNDLE_PATH — unauthorized tooling"; exit 4; }
mkdir -p "$WT/tools"
task_owned "$SCRATCH/overlay/tools" || { echo "overlay target not task-owned — refusing"; exit 4; }
rm -rf "$SCRATCH/overlay/tools"
git archive "$BUNDLE_COMMIT" "$BUNDLE_PATH" | tar -x -C "$SCRATCH/overlay"
task_owned "$WT/$BUNDLE_PATH" || { echo "worktree bundle target not task-owned — refusing"; exit 4; }
rm -rf "$WT/$BUNDLE_PATH"; cp -R "$SCRATCH/overlay/$BUNDLE_PATH" "$WT/tools/"
git -C "$WT" add -f "$BUNDLE_PATH"
git -C "$WT" commit -qm "overlay graft $BUNDLE_TREE"

# combined capture — proposed-reference
(cd "$WT/$BUNDLE_PATH/reference" && npm ci --no-audit --no-fund)
cd "$WT" && env -u NODE_ENV APP_ENV=development DATABASE_URL="$DATABASE_URL" \
  MEDIA_STORAGE_ADAPTER=local MEDIA_STORAGE_DIR="$STATE/media" \
  NEXT_TELEMETRY_DISABLED=1 PARITY_COMPARER=reference \
  PARITY_REFERENCE_DIR=$BUNDLE_PATH/reference/proposed \
  PARITY_OUT_DIR=$BUNDLE_PATH/out/$RUN_ID PARITY_PORT=$PORT \
  $NODE $BUNDLE_PATH/run.mjs            # require: canonical 70/70; strict diagnostics reported

# gate evidence — parsed from the capture's own receipts, bound to this run
CANON_N=$(jq -r '.passed // 0' "$WT/$BUNDLE_PATH/out/$RUN_ID/proposed-canonical.json")
STRICT_N=$(jq -r '.passed // 0' "$WT/$BUNDLE_PATH/out/$RUN_ID/proposed-strict.json")
[[ "$CANON_N" == 70 && "$STRICT_N" -ge 68 ]] \
  || { echo "gate counts below expected (canonical $CANON_N/70, strict $STRICT_N/68)"; exit 5; }

# baseline boundary — AFTER (must equal BEFORE)
git rev-parse "HEAD:$BUNDLE_PATH/baseline"

# persist structured receipts (JSON, strict-validated — later invocations load
# these, never shell state from a previous run) + integrity sidecar
PREP_FILE="$STATE/p203-prep.json"
jq -n --arg head "$HEADSHA" --arg base "$BASE" --arg baseTip "$BASETIP" \
  --arg testMergeCommit "$TMERGE" --arg mergeTree "$MERGETREE" --arg runId "$RUN_ID" \
  --arg bundleCommit "$BUNDLE_COMMIT" --arg bundlePath "$BUNDLE_PATH" --arg bundleTree "$BUNDLE_TREE" \
  --argjson canonical "$CANON_N" --argjson strict "$STRICT_N" \
  '{schema:"transition-prep-v2", pr:203, head:$head, base:$base, baseTip:$baseTip,
    testMergeCommit:$testMergeCommit, mergeTree:$mergeTree,
    toolBundle:{commit:$bundleCommit, path:$bundlePath, tree:$bundleTree},
    gates:{runId:$runId,
           canonical:{expected:70, observed:$canonical},
           strict:{expectedMin:68, observed:$strict}}}' > "$PREP_FILE"
shasum -a 256 "$PREP_FILE" > "$PREP_FILE.sha256"   # tamper-evident reload proof

# cleanup — handled by the EXIT trap (drops only the DB this step created,
# releases this step's lock); a later step repeats acquisition/validation
```

## Single-invocation execution block (merge — NOT run in this task)

The preparation above releases its lock and resources when it ends. A merge
invocation is a NEW lock-held block that reacquires the lock, revalidates refs
and repeats required preparation/gates; stale preparation is never permission.

```bash
set -euo pipefail

# task-owned scratch — REQUIRED; must carry the sentinel preparation created.
# A missing/foreign/symlinked destination refuses before anything is touched.
SCRATCH="${SCRATCH:?set SCRATCH to the task-owned scratch used by preparation}"
SCRATCH="$(cd -P "$(dirname "$SCRATCH")" && pwd -P)/$(basename "$SCRATCH")"
[[ ! -L "$SCRATCH" ]] || { echo "refusing symlinked scratch $SCRATCH"; exit 4; }
grep -qxF "$SCRATCH" "$SCRATCH/.task-owned" 2>/dev/null \
  || { echo "no task-owned scratch at $SCRATCH — run preparation first"; exit 4; }
STATE="$SCRATCH/state"; DB=app_p203
MWT="$SCRATCH/wt-merge"; [[ ! -e "$MWT" ]] || { echo "$MWT already exists — refusing"; exit 4; }
REPO=hanzlahsfc/vari8
NODE="npx -y node@24.22.1"; PORT=${PORT:-58152}

task_owned() {
  [[ -n "${1:-}" && "$1" == "$SCRATCH/"* && ! -L "$1" ]] || return 1
  local d; d="$(cd -P "$(dirname -- "$1")" && pwd -P)" || return 1
  [[ "$d/$(basename -- "$1")" == "$SCRATCH/"* ]] \
    && grep -qxF "$SCRATCH" "$SCRATCH/.task-owned" >/dev/null
}

. icm/05-build/tools/paths.sh   # canonical shared LOCKS=$WT/.locks
mkdir -p "$LOCKS"; exec 9>"$LOCKS/Vari8-Beta.lock"; flock -x 9   # REACQUIRE
trap 'flock -u 9 2>/dev/null; exec 9>&-; [[ "${DB_CREATED:-}" == 1 ]] && docker exec "$DB_CONTAINER" dropdb -U app --if-exists "$DB" 2>/dev/null; true' EXIT
git fetch -q origin

# reload + validate the persisted receipt — integrity sidecar first, then the
# exact schema: missing keys, extras, non-SHA identities or failed-gate counts
# all refuse before any merge command
PREP_FILE="$STATE/p203-prep.json"
[[ -f "$PREP_FILE" && -f "$PREP_FILE.sha256" ]] \
  || { echo "missing prep receipt/digest — re-run preparation"; exit 4; }
[[ "$(shasum -a 256 "$PREP_FILE" | cut -d' ' -f1)" == "$(cut -d' ' -f1 "$PREP_FILE.sha256")" ]] \
  || { echo "receipt digest mismatch — tampered; re-run preparation"; exit 4; }
PREP="$(jq -c '
  if (keys | sort) != ["base","baseTip","gates","head","mergeTree","pr","schema","testMergeCommit","toolBundle"]
    then error("receipt fields") else . end
  | if .schema != "transition-prep-v2" or .pr != 203 or .base != "Vari8-Beta"
    then error("receipt identity") else . end
  | if (.head | test("^[0-9a-f]{40}$") | not)
       or (.baseTip | test("^[0-9a-f]{40}$") | not)
       or (.mergeTree | test("^[0-9a-f]{40}$") | not)
       or (.testMergeCommit | test("^[0-9a-f]{40}$") | not)
    then error("receipt shas") else . end
  | if (.toolBundle.commit | test("^[0-9a-f]{40}$") | not)
       or (.toolBundle.tree | test("^[0-9a-f]{40}$") | not)
       or .toolBundle.path != "tools/parity"
    then error("bundle identity") else . end
  | if (.gates.canonical.observed != .gates.canonical.expected)
       or (.gates.strict.observed < .gates.strict.expectedMin)
    then error("gate evidence") else . end' "$PREP_FILE")" \
  || { echo "invalid prep receipt — re-run preparation"; exit 4; }
# every later variable comes from the validated receipt, never the environment
HEADSHA=$(jq -r .head <<<"$PREP"); BASE=$(jq -r .base <<<"$PREP")
BASETIP=$(jq -r .baseTip <<<"$PREP"); MERGETREE=$(jq -r .mergeTree <<<"$PREP")
BUNDLE_COMMIT=$(jq -r .toolBundle.commit <<<"$PREP")
BUNDLE_PATH=$(jq -r .toolBundle.path <<<"$PREP"); BUNDLE_TREE=$(jq -r .toolBundle.tree <<<"$PREP")
RUN_ID=$(jq -r .gates.runId <<<"$PREP"); TMC=$(jq -r .testMergeCommit <<<"$PREP")

# live revalidation under the fresh lock — receipt identities must still hold
J=$(gh pr view 203 -R "$REPO" --json headRefOid,baseRefName,state,isDraft)
[[ "$(jq -r .headRefOid <<<"$J")" == "$HEADSHA" ]] || { echo "head moved — fresh authorization required"; exit 4; }
[[ "$(jq -r .baseRefName <<<"$J")" == "$BASE" ]] || { echo "base retargeted — re-review"; exit 4; }
[[ "$(jq -r .state <<<"$J")" == "OPEN" ]] || { echo "PR not OPEN"; exit 4; }
[[ "$(git rev-parse "origin/$BASE")" == "$BASETIP" ]] || { echo "base moved — stale receipt"; exit 4; }

# resolve the recorded test-merge commit: it must exist, its tree must equal
# the recorded mergeTree, and the approved head+base must both be its ancestors
git cat-file -e "$TMC" \
  || { echo "recorded test-merge commit $TMC missing — re-run preparation"; exit 4; }
[[ "$(git rev-parse "$TMC^{tree}")" == "$MERGETREE" ]] \
  || { echo "recorded test-merge commit/tree mismatch"; exit 4; }
git merge-base --is-ancestor "$HEADSHA" "$TMC" \
  || { echo "approved head is not an ancestor of the recorded test merge"; exit 4; }
git merge-base --is-ancestor "$BASETIP" "$TMC" \
  || { echo "approved base is not an ancestor of the recorded test merge"; exit 4; }

# recorded tool bundle must equal the authorized manifest identity AND resolve
# to the recorded tree at the recorded commit/path — a forged tree refuses here,
# before any fresh gate or merge
BUNDLE_MANIFEST=icm/05-build/tools/transition/p203-p207.json
[[ "$BUNDLE_COMMIT" == "$(jq -r '.gates.combined.bundle.commit' "$BUNDLE_MANIFEST")" \
   && "$BUNDLE_PATH" == "$(jq -r '.gates.combined.bundle.path' "$BUNDLE_MANIFEST")" \
   && "$BUNDLE_TREE" == "$(jq -r '.gates.combined.bundle.treeSha' "$BUNDLE_MANIFEST")" ]] \
  || { echo "recorded bundle identity != authorized manifest"; exit 4; }
[[ "$(git rev-parse "$BUNDLE_COMMIT:$BUNDLE_PATH")" == "$BUNDLE_TREE" ]] \
  || { echo "bundle tree does not resolve at $BUNDLE_COMMIT:$BUNDLE_PATH"; exit 4; }

# fresh locked preparation repeats — a persisted receipt is never permission.
# disposable task DB — same verified-container pattern as preparation:
# refuse pre-existing, drop only if THIS invocation created it
DB_CONTAINER="${DB_CONTAINER:-app-db-1}"; DB=app_p203
docker inspect "$DB_CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q true \
  || { echo "db container '$DB_CONTAINER' not running"; exit 2; }
DB_PORT=$(docker inspect "$DB_CONTAINER" --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}')
if docker exec "$DB_CONTAINER" psql -U app -d postgres -lqt 2>/dev/null | grep -qw "$DB"; then
  echo "database $DB exists — not this task's, refusing"; exit 2
fi
docker exec "$DB_CONTAINER" createdb -U app "$DB" && DB_CREATED=1
export DATABASE_URL="postgresql://app:${POSTGRES_PASSWORD}@127.0.0.1:${DB_PORT}/${DB}?schema=public"

# isolated test merge at the receipt-pinned head over the live base
git worktree add "$MWT" --detach "$HEADSHA"
git -C "$MWT" fetch -q origin
git -C "$MWT" merge -q --no-ff --no-edit -m "test merge transition p203 (merge invocation)" "$BASETIP"
git -C "$MWT" merge-base --is-ancestor "$HEADSHA" HEAD || exit 4
git -C "$MWT" merge-base --is-ancestor "$BASETIP" HEAD || exit 4
[[ "$(git -C "$MWT" rev-parse 'HEAD^{tree}')" == "$MERGETREE" ]] \
  || { echo "fresh test-merge tree != receipt mergeTree — investigate"; exit 4; }

# fast gate — unmasked exits (identical to preparation)
cd "$MWT"; npm ci --no-audit --no-fund --prefer-offline
$NODE ./node_modules/.bin/prisma generate
$NODE ./node_modules/.bin/prisma migrate deploy
$NODE ./node_modules/.bin/tsc --noEmit
$NODE ./node_modules/.bin/eslint .
npm run test
$NODE ./node_modules/.bin/next build

# reviewed tooling overlay — same pinned graft as preparation
mkdir -p "$MWT/tools" "$SCRATCH/overlay-merge"
task_owned "$SCRATCH/overlay-merge/tools" || { echo "overlay target not task-owned — refusing"; exit 4; }
rm -rf "$SCRATCH/overlay-merge/tools"
git archive "$BUNDLE_COMMIT" "$BUNDLE_PATH" | tar -x -C "$SCRATCH/overlay-merge"
task_owned "$MWT/$BUNDLE_PATH" || { echo "worktree bundle target not task-owned — refusing"; exit 4; }
rm -rf "$MWT/$BUNDLE_PATH"; cp -R "$SCRATCH/overlay-merge/$BUNDLE_PATH" "$MWT/tools/"
git -C "$MWT" add -f "$BUNDLE_PATH"
git -C "$MWT" commit -qm "overlay graft $BUNDLE_TREE (merge invocation)"

# combined gate — fresh capture, bound to the receipt's recorded run identity
(cd "$MWT/$BUNDLE_PATH/reference" && npm ci --no-audit --no-fund)
cd "$MWT" && env -u NODE_ENV APP_ENV=development DATABASE_URL="$DATABASE_URL" \
  MEDIA_STORAGE_ADAPTER=local MEDIA_STORAGE_DIR="$STATE/media" \
  NEXT_TELEMETRY_DISABLED=1 PARITY_COMPARER=reference \
  PARITY_REFERENCE_DIR=$BUNDLE_PATH/reference/proposed \
  PARITY_OUT_DIR=$BUNDLE_PATH/out/$RUN_ID-merge PARITY_PORT=$PORT \
  $NODE $BUNDLE_PATH/run.mjs
CANON_N=$(jq -r '.passed // 0' "$MWT/$BUNDLE_PATH/out/$RUN_ID-merge/proposed-canonical.json")
STRICT_N=$(jq -r '.passed // 0' "$MWT/$BUNDLE_PATH/out/$RUN_ID-merge/proposed-strict.json")
[[ "$CANON_N" == "$(jq -r .gates.canonical.expected <<<"$PREP")" \
   && "$STRICT_N" -ge "$(jq -r .gates.strict.expectedMin <<<"$PREP")" ]] \
  || { echo "fresh gate counts below recorded expected"; exit 5; }

# then, with the owner comment recorded and verified:
gh pr ready 203 -R "$REPO"    # only if still draft and owner-authorized
gh pr merge 203 -R "$REPO" --merge --match-head-commit "$HEADSHA"
MERGE_SHA=$(gh pr view 203 -R "$REPO" --json mergeCommit --jq .mergeCommit.oid)
git fetch -q origin "$MERGE_SHA"          # fetch BEFORE checking parents/tree
P1=$(git rev-parse "$MERGE_SHA^1"); P2=$(git rev-parse "$MERGE_SHA^2")
MT=$(git rev-parse "$MERGE_SHA^{tree}")
[[ "$P1" == "$BASETIP" && "$P2" == "$HEADSHA" && "$MT" == "$MERGETREE" ]]   || { echo "merge tree/parent mismatch — investigate"; exit 4; }
git rev-parse "origin/$BASE:$BUNDLE_PATH/baseline"   # must equal the BEFORE hash
```

## Remaining steps

2. **#206 — concrete procedure** (fresh lock, no force-push):

```bash
set -euo pipefail

SCRATCH="${SCRATCH:?set SCRATCH to the task-owned scratch}"
SCRATCH="$(cd -P "$(dirname "$SCRATCH")" && pwd -P)/$(basename "$SCRATCH")"
[[ ! -L "$SCRATCH" ]] || { echo "refusing symlinked scratch"; exit 4; }
grep -qxF "$SCRATCH" "$SCRATCH/.task-owned" 2>/dev/null \
  || { echo "no task-owned scratch — refusing"; exit 4; }
STATE="$SCRATCH/state"; mkdir -p "$STATE"
REPO=hanzlahsfc/vari8
. icm/05-build/tools/paths.sh; mkdir -p "$LOCKS"
exec 9>"$LOCKS/Vari8-Beta.lock"; flock -x 9          # reacquire — shared lock
MERGED_203=$(gh pr view 203 -R "$REPO" --json state,mergeCommit --jq 'select(.state=="MERGED").mergeCommit.oid')
[[ -n "$MERGED_203" ]] || { echo "#203 not merged — stop"; exit 4; }
git fetch -q origin; git rev-parse "origin/Vari8-Beta"  # new base tip (contains 203)
gh pr edit 206 -R "$REPO" -B Vari8-Beta                 # explicit authorized retarget
# normal forward update of the PR branch — merge the new base INTO it (no force-push):
git checkout -q beta/visual-reference-establishment && git pull --ff-only
git merge --no-edit origin/Vari8-Beta || { echo "conflict — manual review"; exit 3; }
git push origin beta/visual-reference-establishment
H206=$(gh pr view 206 -R "$REPO" --json headRefOid --jq .headRefOid)   # DERIVED new head
echo "changed head $H206 — fresh review/revalidation REQUIRED before proceeding"
# then the full locked preparation sequence repeats for $H206
# merge (only after reviewed head): gh pr merge 206 --merge --match-head-commit "$H206"
# parents must be [new base tip, $H206]; tree must equal the #206 test-merge tree.
```

3. **#207 — concrete procedure** (fresh lock, no force-push):

```bash
set -euo pipefail

SCRATCH="${SCRATCH:?set SCRATCH to the task-owned scratch}"
SCRATCH="$(cd -P "$(dirname "$SCRATCH")" && pwd -P)/$(basename "$SCRATCH")"
[[ ! -L "$SCRATCH" ]] || { echo "refusing symlinked scratch"; exit 4; }
grep -qxF "$SCRATCH" "$SCRATCH/.task-owned" 2>/dev/null \
  || { echo "no task-owned scratch — refusing"; exit 4; }
STATE="$SCRATCH/state"; mkdir -p "$STATE"
REPO=hanzlahsfc/vari8
. icm/05-build/tools/paths.sh; mkdir -p "$LOCKS"
exec 9>"$LOCKS/Vari8-Beta.lock"; flock -x 9          # reacquire — shared lock
MERGED_206=$(gh pr view 206 -R "$REPO" --json state,mergeCommit --jq 'select(.state=="MERGED").mergeCommit.oid')
[[ -n "$MERGED_206" ]] || { echo "#206 not merged — stop"; exit 4; }
git fetch -q origin; git rev-parse "origin/Vari8-Beta"  # new base tip (contains 206)
gh pr edit 207 -R "$REPO" -B Vari8-Beta                 # explicit authorized retarget
# normal forward update of the PR branch — merge the new base INTO it (no force-push):
git checkout -q beta/p203-p206-combined-verification && git pull --ff-only
git merge --no-edit origin/Vari8-Beta || { echo "conflict — manual review"; exit 3; }
git push origin beta/p203-p206-combined-verification
H207=$(gh pr view 207 -R "$REPO" --json headRefOid --jq .headRefOid)   # DERIVED new head
echo "changed head $H207 — fresh review/revalidation REQUIRED before proceeding"
# then the full locked preparation sequence repeats for $H207 — tools live in
# the branch, so the combined capture runs WITHOUT the overlay graft
# merge (only after reviewed head): gh pr merge 207 --merge --match-head-commit "$H207"
# parents must be [new base tip, $H207]; tree must equal the #207 test-merge tree.
```

4. **Baseline activation:** separately approved later step; not authorized here.

## Stop conditions / residual race

Failed gate · moved head/base · merge parent/tree mismatch · unresolved FIX · infra missing ·
activation-boundary change. `--match-head-commit` pins the head only; the base can still move
between merge and verification — recheck immediately and investigate any mismatch.

## Evidence

`RECEIPTS-p203-prep.md`, `p452/` — complete logged transcript + capture receipts + hashes.
