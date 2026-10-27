#!/usr/bin/env bash
# OWNER-AUTHORIZED SCOPED TRANSITION — single-step executor (NOT independent SHIP).
# Usage: integrate-transition.sh <manifest.json> --pr <N>
# Executes ONE authorized PR step per invocation under the full safeguard set:
# shared lock, isolated test merge, mandatory fast gate, required combined gate,
# baseline-activation boundary, head/base revalidation, merge-parent/tree proof,
# task-owned state record and audit log. Fail closed on any mismatch.
# INTEGRATE_DRY_RUN=1 stops before the merge call.
# Exits: 0 ok/already-merged · 2 usage/state · 3 merge conflict ·
#        4 authorization/identity/state refusal · 5 gate red · 6 activation boundary
set -euo pipefail
die() { echo "integrate-transition: $*" >&2; exit "${2:-2}"; }
[[ -z "${POSTGRES_PASSWORD:-}" ]] && die "POSTGRES_PASSWORD is not set" 2
[[ "${INTEGRATE_ACTIVATE_BASELINE:-0}" == "1" ]] && die "baseline activation is prohibited by this transition" 4

MANIFEST=""; WANT_PR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr) WANT_PR="${2:?--pr requires a PR number}"; shift 2 ;;
    -*) die "unknown flag $1" ;;
    *) MANIFEST="$1"; shift ;;
  esac
done
[[ -n "$MANIFEST" && -n "$WANT_PR" ]] || die "usage: integrate-transition.sh <manifest> --pr <N>" 2
[[ "$WANT_PR" =~ ^[0-9]+$ ]] || die "--pr must be an integer" 2

REPO="${INTEGRATE_REPO:-hanzlahsfc/vari8}"
DB_CONTAINER="${INTEGRATE_DB_CONTAINER:-app-db-1}"
TOOLS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$TOOLS/paths.sh"
BETA="${INTEGRATE_BETA:-$BETA}"
HERE="$(git rev-parse --show-toplevel)"
[[ "$(realpath "$HERE")" != "$(realpath "$BETA")" ]] || die "run from a task worktree, not the integration checkout" 2
# Environment preflight — before ANY mutation: manifest exists, workspace paths
# exist, the named container is the one actually running.
[[ -f "$MANIFEST" ]] || die "manifest missing: $MANIFEST" 2
[[ -d "$BETA" && -d "$WT" ]] || die "unsafe workspace paths ($BETA / $WT)" 2
docker inspect "$DB_CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q true \
  || die "db container '$DB_CONTAINER' not running — no fallback to stale hosts" 2
command -v jq >/dev/null || die "jq required" 2
command -v node >/dev/null || die "node required (approved runtime)" 2

node "$TOOLS/transition-check.mjs" "$MANIFEST" || die "manifest invalid" 4

jqf() { jq -r --argjson pr "$WANT_PR" --arg f "$1" \
  '(.items | map(select(.pr == $pr)) | .[0]) as $it
   | if $it == null then error("unlisted PR") else ($it[$f] | if . == null then "" else . end) end' \
  "$MANIFEST"; }
PR_ITEM() { jqf "$1" || die "unlisted PR #$WANT_PR — not in the authorized manifest" 4; }
STEP_ORDER="$(PR_ITEM order)"; HEAD_SHA="$(PR_ITEM head)"; ITEM_BASE="$(PR_ITEM base)"
ITEM_BRANCH="$(PR_ITEM branch)"; ITEM_DRAFT="$(PR_ITEM isDraft)"
COMBINED_REF="$(jq -r '.gates.combined.reference // ""' "$MANIFEST")"
STATE_DIR="$HERE/_transition"; mkdir -p "$STATE_DIR"
STATE="$STATE_DIR/p${WANT_PR}.json"

# Selected step already merged remotely → prove + exit (no merge repetition).
SEL_J="$(gh pr view "$WANT_PR" -R "$REPO" --json state,mergeCommit)"
if [[ "$(jq -r .state <<<"$SEL_J")" == "MERGED" ]]; then
  mc="$(jq -r '.mergeCommit.oid // ""' <<<"$SEL_J")"
  [[ -n "$mc" ]] || die "PR #$WANT_PR reports MERGED with no mergeCommit" 4
  echo "PR #$WANT_PR already MERGED as $mc — nothing to do"; exit 0
fi

# --- Authorization: verify the pinned records, not just their existence. ---
verify_auth() {
  local key url author contains id body pending
  key="$1"
  pending="$(jq -r --arg k "$key" '.authorization[$k].pendingInput // ""' "$MANIFEST")"
  [[ -z "$pending" ]] || die "authorization input pending: $pending" 4
  url="$(jq -r --arg k "$key" '.authorization[$k].commentUrl // ""' "$MANIFEST")"
  author="$(jq -r --arg k "$key" '.authorization[$k].author // ""' "$MANIFEST")"
  contains="$(jq -r --arg k "$key" '.authorization[$k].contains // ""' "$MANIFEST")"
  id="${url##*issuecomment-}"
  body="$(gh api "repos/${REPO}/issues/comments/${id}" --jq '{l:.user.login,b:.body}' 2>/dev/null)" \
    || die "cannot verify $key — comment record unreachable via gh api; missing input: comment $id on $REPO" 4
  [[ "$(jq -r .l <<<"$body")" == "$author" ]] || die "$key author mismatch" 4
  jq -r .b <<<"$body" | grep -qF "$contains" \
    || die "$key record does not contain the pinned content" 4
}
verify_auth mergeAuthorization
verify_auth scopedAcceptance
echo "authorization records verified"

# --- ALL-steps preflight BEFORE any merge: catch a downstream prerequisite
# mismatch before merging anything. ---
git fetch -q origin
mkdir -p "$LOCKS"
exec 9>"$LOCKS/Vari8-Beta.lock"; echo "waiting for the integration lock"; flock 9; echo "lock held"
COUNT="$(jq '.items | length' "$MANIFEST")"
for i in $(seq 1 "$COUNT"); do
  pf() { jq -r --argjson i "$i" --arg f "$1" '.items[$i - 1][$f] | if . == null then "" else . end' "$MANIFEST"; }
  p="$(pf pr)"; h="$(pf head)"; b="$(pf base)"; d="$(pf isDraft)"
  J="$(gh pr view "$p" -R "$REPO" --json headRefOid,baseRefName,state,isDraft,comments,mergeCommit)"
  [[ "$(jq -r .headRefOid <<<"$J")" == "$h" ]] || die "PR #$p head moved (authorized $h) — fresh authorization required" 4
  if [[ "$(jq -r .state <<<"$J")" == "MERGED" ]]; then
    mc="$(jq -r '.mergeCommit.oid // ""' <<<"$J")"
    [[ -n "$mc" ]] || die "PR #$p reports MERGED with no mergeCommit" 4
    echo "  prerequisite PR #$p already MERGED as $mc — recorded prerequisite satisfied"
    continue
  fi
  [[ "$(jq -r .baseRefName <<<"$J")" == "$b" ]] || die "PR #$p base is $(jq -r .baseRefName <<<"$J"), manifest says $b — retarget is a separate step" 4
  [[ "$(jq -r .state <<<"$J")" == "OPEN" ]] || die "PR #$p not OPEN" 4
  [[ "$(jq -r .isDraft <<<"$J")" == "$d" ]] || die "PR #$p draft state changed; manifest stale — re-review" 4
  jq -r '.comments[].body' <<<"$J" | grep -qE "^FIX .*$h" && die "unresolved FIX finding on $h (PR #$p)" 4
done
echo "all $COUNT authorized steps' live state matches the manifest"

# --- Task-owned state record: detect already-merged / interrupted attempts. ---
if [[ -f "$STATE" ]]; then
  st="$(jq -r .status "$STATE")"
  if [[ "$st" == done ]]; then
    merged="$(gh pr view "$WANT_PR" -R "$REPO" --json state,mergeCommit --jq 'select(.state=="MERGED").mergeCommit.oid')"
    rec="$(jq -r '.mergeSha // ""' "$STATE")"
    [[ -n "$merged" && "$merged" == "$rec" ]] || die "recorded merge $rec does not match remote ${merged:-none} — inspect" 4
    mt="$(git rev-parse "$merged^{tree}" 2>/dev/null || echo unknown)"
    rt="$(jq -r '.testedTree // ""' "$STATE")"
    [[ "$mt" == "$rt" ]] || die "remote merge tree $mt != recorded tested tree $rt" 4
    echo "PR #$WANT_PR already merged as $merged (parents+tree proven); nothing to do"; exit 0
  fi
  [[ "$st" == running ]] && die "interrupted attempt recorded in $STATE — inspect before retry (refusing to repeat blindly)" 4
fi
echo "{\"status\":\"running\",\"pr\":$WANT_PR,\"head\":\"$HEAD_SHA\",\"base\":\"$ITEM_BASE\",\"started\":\"$(date -u +%FT%TZ)\"}" > "$STATE"
trap 'jq -n --arg s interrupted "{status:\$s}" > "$STATE.tmp" 2>/dev/null && mv "$STATE.tmp" "$STATE" 2>/dev/null || true' ERR

# --- Baseline boundary snapshot BEFORE the test merge. ---
BASE_REF="origin/$ITEM_BASE"
snap() { git rev-parse -q --verify "origin/$1:$2" 2>/dev/null || echo "absent"; }
BASELINE_SNAP=""
for bp in $(jq -r '(.baseline.paths // ["tools/parity/baseline"]) | join(" ")' "$MANIFEST"); do
  BASELINE_SNAP="$BASELINE_SNAP$bp::$(snap "$ITEM_BASE" "$bp") "
done

# --- Isolated test merge at the exact pinned head over the live base. ---
git checkout -q --detach "$HEAD_SHA"
BASE_TIP="$(git rev-parse "$BASE_REF")"
if ! git merge -q --no-ff --no-edit -m "test merge transition PR-$WANT_PR" "$BASE_REF"; then
  git merge --abort || true
  die "conflict merging $HEAD_SHA into $ITEM_BASE" 3
fi
TEST_TREE="$(git rev-parse 'HEAD^{tree}')"

# --- Activation boundary: the merge result must not touch baseline/active
# reference paths (files, config, symlinks, resolutions). ---
while IFS= read -r changed; do
  for bp in $(jq -r '(.baseline.paths // ["tools/parity/baseline"]) | join(" ")' "$MANIFEST"); do
    [[ "$changed" == "$bp"* ]] && die "merge touches baseline path $changed — unauthorized activation" 6
    [[ -L "$changed" && "$changed" == tools/parity/* ]] && die "merge introduces symlink $changed under tools/parity" 6
  done
done < <(git diff --name-only "$BASE_REF" HEAD)

# --- Task-owned disposable DB: unique name, refuse existing, drop only ours. ---
DB="app_transition_p${WANT_PR}"
if docker exec "$DB_CONTAINER" psql -U app -d postgres -lqt 2>/dev/null | grep -qw "$DB"; then
  die "database $DB already exists — refusing to reuse an unowned resource" 2
fi
docker exec "$DB_CONTAINER" createdb -U app "$DB"
CREATED_DB=1
trap '[[ "${CREATED_DB:-0}" == 1 ]] && docker exec "$DB_CONTAINER" dropdb -U app --if-exists "'"$DB"'" >/dev/null 2>&1 || true' EXIT
export DATABASE_URL="postgresql://app:${POSTGRES_PASSWORD}@127.0.0.1:5433/${DB}?schema=public"
export AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -base64 32)}"

gate() {
  npm ci --no-audit --no-fund --prefer-offline &&
    npx prisma generate &&
    npx prisma migrate deploy &&
    npm run typecheck &&
    npm run lint &&
    npm run test &&
    npm run build
}
if ! gate > "$STATE_DIR/p${WANT_PR}.merge-gate.log" 2>&1; then
  tail -40 "$STATE_DIR/p${WANT_PR}.merge-gate.log" >&2
  die "fast gate red on the test-merge result (PR #$WANT_PR)" 5
fi

# --- Mandatory combined gate on the actual test-merge material inputs.
# Runner argv comes from the manifest; missing verifier/package/inputs fails
# before mutation — historical receipts alone are never sufficient. ---
CG_OUT="$STATE_DIR/p${WANT_PR}.combined"; mkdir -p "$CG_OUT"
BUNDLE_COMMIT="$(jq -r '.gates.combined.bundle.commit? // ""' "$MANIFEST")"
BUNDLE_PATH="$(jq -r '.gates.combined.bundle.path? // ""' "$MANIFEST")"
BUNDLE_TREE="$(jq -r '.gates.combined.bundle.treeSha? // ""' "$MANIFEST")"
GATE_HOME="$STATE_DIR/gate-tools"
if [[ -n "$BUNDLE_COMMIT" ]]; then
  [[ "$(git rev-parse "$BUNDLE_COMMIT:$BUNDLE_PATH" 2>/dev/null)" == "$BUNDLE_TREE" ]]     || die "gate bundle tree sha mismatch for $BUNDLE_COMMIT:$BUNDLE_PATH" 5
  mkdir -p "$GATE_HOME"
  rm -rf "$GATE_HOME/$BUNDLE_PATH"
  git archive "$BUNDLE_COMMIT" "$BUNDLE_PATH" | tar -x -C "$GATE_HOME"     || die "gate bundle extraction failed" 5
  RUNNER_DIR="$GATE_HOME"
else
  RUNNER_DIR="$HERE"
fi
CG_OK=1
RUNNER=()
while IFS= read -r a; do RUNNER+=("$a"); done < <(jq -r '.gates.combined.runner[]' "$MANIFEST")
[[ -f "${RUNNER[1]:-}" ]] || die "combined gate runner missing: ${RUNNER[1]:-?}" 5
[[ -d "$COMBINED_REF" ]] || die "combined reference package missing: $COMBINED_REF" 5
if (cd "$RUNNER_DIR"; unset NODE_ENV; PARITY_OUT_DIR="$CG_OUT" PARITY_COMPARER=reference PARITY_REFERENCE_DIR="$COMBINED_REF" PARITY_PORT="${PARITY_PORT:-58300}" APP_ENV=development NEXT_TELEMETRY_DISABLED=1 MEDIA_STORAGE_ADAPTER=local MEDIA_STORAGE_DIR="$STATE_DIR/media" "${RUNNER[@]}") > "$CG_OUT/run.log" 2>&1; then CG_OK=0; fi
CG_JSON="$CG_OUT/current/manifest.json"
CANON_N=0; STRICT_N=0
[[ -f "$CG_OUT/proposed-canonical.json" ]] && CANON_N="$(jq -r '.passed // 0' "$CG_OUT/proposed-canonical.json")"
[[ -f "$CG_OUT/proposed-strict.json" ]] && STRICT_N="$(jq -r '.passed // 0' "$CG_OUT/proposed-strict.json")"
EXP_CANON="$(jq -r '.gates.combined.expectedCanonical // ""' "$MANIFEST")"
EXP_STRICT="$(jq -r '.gates.combined.expectedStrictMin // 0' "$MANIFEST")"
[[ "$CG_OK" == 0 ]] || die "combined gate runner failed; see $CG_OUT/run.log" 5
[[ "$CANON_N" == "$EXP_CANON" ]] || die "combined canonical $CANON_N != expected $EXP_CANON" 5
(( STRICT_N >= EXP_STRICT )) || die "combined strict $STRICT_N < expected minimum $EXP_STRICT" 5

if [[ "${INTEGRATE_DRY_RUN:-0}" == 1 ]]; then
  echo "DRY RUN: would mark-ready+merge PR #$WANT_PR at $HEAD_SHA into $ITEM_BASE"
  echo "{\"status\":\"pending\",\"pr\":$WANT_PR,\"note\":\"dry run\"}" > "$STATE"
  exit 0
fi

# --- Revalidate remote state immediately before merge (head/base/state; the
# base tip must not have moved since the test merge — abort on movement). ---
git fetch -q origin
[[ "$(git rev-parse "$BASE_REF")" == "$BASE_TIP" ]] || die "base $ITEM_BASE moved during gating — aborting; rerun required" 4
J="$(gh pr view "$WANT_PR" -R "$REPO" --json headRefOid,baseRefName,state,isDraft)"
[[ "$(jq -r .headRefOid <<<"$J")" == "$HEAD_SHA" ]] || die "remote head moved before merge — abort" 4
[[ "$(jq -r .baseRefName <<<"$J")" == "$ITEM_BASE" ]] || die "remote base changed before merge — abort" 4
[[ "$(jq -r .state <<<"$J")" == "OPEN" ]] || die "PR #$WANT_PR no longer open" 4
[[ "$(jq -r .isDraft <<<"$J")" == true ]] && gh pr ready "$WANT_PR" -R "$REPO" >/dev/null

gh pr merge "$WANT_PR" -R "$REPO" --merge --match-head-commit "$HEAD_SHA"
MERGE_SHA="$(gh pr view "$WANT_PR" -R "$REPO" --json mergeCommit --jq '.mergeCommit.oid')"

# --- Post-merge integrity: parents + tree must equal the tested result. ---
git fetch -q origin "$ITEM_BASE" >/dev/null 2>&1 || true
MP="$(git cat-file -p "$MERGE_SHA" 2>/dev/null | awk '/^parent/{print $2}' | tr '\n' ' ')"
MT="$(git rev-parse "$MERGE_SHA^{tree}" 2>/dev/null || echo unknown)"
[[ "$MT" == "$TEST_TREE" ]] || die "remote merge tree $MT != tested $TEST_TREE — remote race, investigate" 4
[[ "${MP% }" == "$BASE_TIP $HEAD_SHA" ]] || die "merge parents $MP != expected $BASE_TIP $HEAD_SHA — hard failure, investigate" 4

for bp in $(jq -r '(.baseline.paths // ["tools/parity/baseline"]) | join(" ")' "$MANIFEST"); do
  want="$(printf '%s' "$BASELINE_SNAP" | tr ' ' '\n' | grep "^${bp}::" | cut -d: -f3-)"
  [[ "$(snap "$ITEM_BASE" "$bp")" == "$want" ]] || die "baseline path $bp changed by merge — activation boundary violated" 6
done

printf '| %s | transition | #%s | %s | head %s | step %s/%s |\n' \
  "$(date '+%Y-%m-%d %H:%M')" "$WANT_PR" "${MERGE_SHA:0:8}" "${HEAD_SHA:0:8}" "$STEP_ORDER" "$COUNT" \
  >> "$STATE_DIR/merge-log.md"
jq -n --arg s done --arg m "$MERGE_SHA" --arg t "$TEST_TREE" --arg b "$BASE_TIP" \
  "{status:\$s, mergeSha:\$m, testedTree:\$t, testedBase:\$b}" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
git -C "$BETA" fetch -q origin; git -C "$BETA" merge --ff-only "origin/Vari8-Beta" 2>/dev/null || true
echo "TRANSITION STEP MERGED: #$WANT_PR as $MERGE_SHA (remaining race: base can move between --match-head-commit and merge; verified parents/tree afterward)"
