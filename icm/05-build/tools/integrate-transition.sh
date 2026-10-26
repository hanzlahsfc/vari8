#!/usr/bin/env bash
# OWNER-AUTHORIZED SCOPED TRANSITION — not independent SHIP.
# Usage: integrate-transition.sh <manifest.json>
# Executes the ordered PR sequence from a reviewed transition manifest while
# preserving every integration safeguard: real shared lock, isolated test
# merge, mandatory fast gate, required combined gate, head-pinned merge,
# post-merge integrity + audit record, baseline-activation prohibition.
# Fail closed: missing/invalid manifest, mismatched live heads/bases, unlisted
# PRs, unresolved FIX findings or any activation attempt all refuse.
# INTEGRATE_DRY_RUN=1 stops before each merge.
# Exit codes: 0 done, 2 usage/state, 3 conflict, 4 authorization/state, 5 gate red.
set -euo pipefail
if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "integrate-transition.sh: POSTGRES_PASSWORD is not set." >&2; exit 2
fi
[[ "${INTEGRATE_ACTIVATE_BASELINE:-0}" == "1" ]] && { echo "baseline activation is prohibited by this transition" >&2; exit 4; }
MANIFEST="${1:?transition manifest path, e.g. icm/05-build/tools/transition/p203-p207.json}"
REPO="${INTEGRATE_REPO:-hanzlahsfc/vari8}"
BASE="${INTEGRATE_BASE:-Vari8-Beta}"
DB_CONTAINER="${INTEGRATE_DB_CONTAINER:-vari8-db-1}"
. "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
BETA="${INTEGRATE_BETA:-$BETA}"
HERE="$(git rev-parse --show-toplevel)"
[[ "$(realpath "$HERE")" != "$(realpath "$BETA")" ]] || { echo "run from a task worktree, not $BETA" >&2; exit 2; }
# Environment preflight — reject missing/unsafe paths and unintended containers
# BEFORE any mutation.
[[ -f "$MANIFEST" ]] || { echo "manifest missing: $MANIFEST" >&2; exit 2; }
[[ -d "$BETA" && -d "$WT" ]] || { echo "unsafe workspace paths" >&2; exit 2; }
docker inspect "$DB_CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q true \
  || { echo "db container '$DB_CONTAINER' not running; refusing" >&2; exit 2; }
mkdir -p "$LOCKS" "$HERE/_transition"
exec 9>"$LOCKS/${BASE//\//_}.lock"
echo "waiting for the integration lock"
flock 9
echo "lock held"

# Manifest validation — fail closed on shape errors.
node "$(dirname "${BASH_SOURCE[0]}")/transition-check.mjs" "$MANIFEST"
COMBINED_EVIDENCE="$(node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(m.gates.combined.evidence)' "$MANIFEST")"

git fetch -q origin
COUNT="$(node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(m.items.length)' "$MANIFEST")"
for i in $(seq 1 "$COUNT"); do
  item() { node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(m.items[process.argv[2]-1][process.argv[3]])' "$MANIFEST" "$i" "$1"; }
  PR="$(item pr)"; HEAD_SHA="$(item head)"; WANT_BASE="$(item base)"
  [[ "$WANT_BASE" == "$BASE" ]] || { echo "PR #$PR base $WANT_BASE != $BASE" >&2; exit 4; }
  PR_JSON="$(gh pr view "$PR" -R "$REPO" --json number,headRefOid,baseRefName,state,comments)"
  LIVE_HEAD="$(jq -r .headRefOid <<<"$PR_JSON")"
  LIVE_BASE="$(jq -r .baseRefName <<<"$PR_JSON")"
  [[ "$LIVE_HEAD" == "$HEAD_SHA" ]] || { echo "PR #$PR head moved $LIVE_HEAD != authorized $HEAD_SHA; fresh authorization required" >&2; exit 4; }
  [[ "$LIVE_BASE" == "$BASE" ]] || { echo "PR #$PR not targeting $BASE" >&2; exit 4; }
  jq -e '.state=="OPEN"' <<<"$PR_JSON" >/dev/null || { echo "PR #$PR not open" >&2; exit 4; }
  # Newer unresolved findings on this head fail closed.
  if jq -r '.comments[].body' <<<"$PR_JSON" | grep -qE "^FIX .*$HEAD_SHA"; then
    echo "unresolved FIX finding on $HEAD_SHA (PR #$PR); fresh review required" >&2; exit 4
  fi
  git checkout -q --detach "$HEAD_SHA"
  if ! git merge -q --no-ff --no-edit -m "test merge PR-$PR" "origin/$BASE"; then
    git merge --abort || true
    gh pr comment "$PR" -R "$REPO" --body "FIX transition #$PR $HEAD_SHA: conflict with $BASE at integration."
    exit 3
  fi
  NORM="p${PR}"
  DB="app_merge_${NORM}"
  PGPASS="$POSTGRES_PASSWORD"
  export DATABASE_URL="postgresql://app:${PGPASS}@127.0.0.1:5433/${DB}?schema=public"
  export AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -base64 32)}"
  docker exec "$DB_CONTAINER" dropdb -U app --if-exists "$DB" >/dev/null
  docker exec "$DB_CONTAINER" createdb -U app "$DB"
  trap 'docker exec "$DB_CONTAINER" dropdb -U app --if-exists "'"$DB"'" >/dev/null 2>&1 || true' EXIT
  gate() {
    npm ci --no-audit --no-fund --prefer-offline &&
      npx prisma generate &&
      npx prisma migrate deploy &&
      npm run typecheck &&
      npm run lint &&
      npm run test &&
      npm run build
  }
  if ! gate > "$HERE/_transition/p${PR}.merge-gate.log" 2>&1; then
    tail -40 "$HERE/_transition/p${PR}.merge-gate.log" >&2
    gh pr comment "$PR" -R "$REPO" --body "FIX transition #$PR $HEAD_SHA: fast gate red on the merge result."
    exit 5
  fi
  # Required combined gate for the transition (proposed-reference evidence).
  if [[ -x "$(dirname "${BASH_SOURCE[0]}")/../../parity/reference/verify-combined.mjs" || -f "$COMBINED_EVIDENCE/artifact-index.json" ]]; then
    node tools/parity/reference/verify-combined.mjs --package "$COMBINED_EVIDENCE" \
      || { echo "combined gate failed for $COMBINED_EVIDENCE" >&2; exit 5; }
  fi
  if [[ "${INTEGRATE_DRY_RUN:-0}" == 1 ]]; then
    echo "DRY RUN: would merge PR #$PR at $HEAD_SHA (transition item $i/$COUNT)"
    continue
  fi
  gh pr merge "$PR" -R "$REPO" --merge --match-head-commit "$HEAD_SHA"
  MERGE_SHA="$(gh pr view "$PR" -R "$REPO" --json mergeCommit --jq '.mergeCommit.oid')"
  printf '| %s | transition | #%s | %s | head %s |\n' "$(date '+%Y-%m-%d %H:%M')" "$PR" "${MERGE_SHA:0:8}" "${HEAD_SHA:0:8}" >> "$HERE/_transition/merge-log.md"
  git -C "$BETA" fetch -q origin
  git -C "$BETA" merge --ff-only "origin/$BASE"
  echo "TRANSITION ITEM $i/$COUNT merged #$PR as $MERGE_SHA"
done
echo "TRANSITION COMPLETE: $COUNT PRs merged under owner-authorized scoped transition"
