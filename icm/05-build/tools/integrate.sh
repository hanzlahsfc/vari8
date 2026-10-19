#!/usr/bin/env bash
# Integrate one verified branch into Vari8-Beta (D35). Run from the merge card's own worktree.
# Usage: integrate.sh <verified-branch> <PLAN-id>
# One lock serializes every write to Vari8-Beta. The merge happens here, the fast gate runs here,
# and Vari8-Beta only moves by fast-forward, so a failed gate never touches the integration branch.
set -euo pipefail
BR="${1:?verified branch, e.g. beta/pr-01-canvas-takeover-verify}"
PR="${2:?plan id, e.g. PR-01}"
BETA="${INTEGRATE_BETA:-/home/nexuslink/vari8-worktrees/beta}"
TARGET="${INTEGRATE_TARGET:-Vari8-Beta}"
LOCKS="/home/nexuslink/vari8-worktrees/.locks"
HERE="$(git rev-parse --show-toplevel)"
[[ "$(realpath "$HERE")" != "$(realpath "$BETA")" ]] || { echo "run from the merge card worktree, not $BETA" >&2; exit 2; }
[[ "$(git -C "$BETA" branch --show-current)" == "$TARGET" ]] || { echo "$BETA is not on $TARGET" >&2; exit 2; }
mkdir -p "$LOCKS"
exec 9>"$LOCKS/${TARGET//\//_}.lock"
echo "waiting for the integration lock"
flock 9
echo "lock held"

git merge --no-edit "$TARGET"
if ! git merge --no-ff --no-edit -m "merge: $PR ($BR)" "$BR"; then
  echo "CONFLICT merging $BR; resolve here, commit, and re-run this script" >&2
  git diff --name-only --diff-filter=U >&2
  exit 3
fi

NORM="$(echo "$PR" | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9')"
DB="app_merge_${NORM}"
PGPASS="${POSTGRES_PASSWORD:-app_dev_password}"
export DATABASE_URL="postgresql://app:${PGPASS}@127.0.0.1:5433/${DB}?schema=public"
export AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -base64 32)}"
docker exec vari8-db-1 dropdb -U app --if-exists "$DB" >/dev/null
docker exec vari8-db-1 createdb -U app "$DB"
trap 'docker exec vari8-db-1 dropdb -U app --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

npm ci --no-audit --no-fund --prefer-offline
npx prisma generate
npx prisma migrate deploy
npm run typecheck
npm run lint
npm run test
npm run build

SHA="$(git rev-parse HEAD)"
git -C "$BETA" merge --ff-only "$SHA"
printf '| %s | %s | merged | %s | %s |\n' "$(date '+%Y-%m-%d %H:%M')" "$PR" "${SHA:0:8}" "$BR" >> "$BETA/icm/05-build/BLACKBOARD.md"
git -C "$BETA" commit -q -m "chore(icm): blackboard, $PR merged at ${SHA:0:8}" -- icm/05-build/BLACKBOARD.md
echo "INTEGRATED $PR $SHA into $TARGET ($(git -C "$BETA" rev-parse --short HEAD))"
