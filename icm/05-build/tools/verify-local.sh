#!/usr/bin/env bash
# Local gate per D13. Contract: icm/03-plan/output/TEST-AUDIT.md, section "Local gate per PR, D13".
# PR-03 promotes this file to scripts/verify-local.sh; until then every lane runs this copy.
#
# Required: BASE_SHA (the Vari8-Beta commit the change is measured against), LANE_DB (app_<lane>).
# Optional: LANE_PORT (default 3999), CARD (plan id, for the schema guard), KEEP_DB=1,
#           SKIP_E2E=1, PARITY_SCREENS (default ALL), REQUIRE_NODE24=1.
set -euo pipefail

: "${BASE_SHA:?Set BASE_SHA to the Vari8-Beta commit this change is measured against}"
: "${LANE_DB:?Set LANE_DB to this lane database, app_<lane>}"
LANE_PORT="${LANE_PORT:-3999}"
CARD="${CARD:-}"
ROOT_CHECKOUT="/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8"
LOCKS="/home/nexuslink/vari8-worktrees/.locks"
SCHEMA_WRITERS="PR-05 PR-M0 PR-R2"

if [[ ! "$LANE_DB" =~ ^app_[a-z0-9_]+$ ]] || [[ "$LANE_DB" == "app_dev" ]]; then
  echo "FAIL setup: LANE_DB must match ^app_[a-z0-9_]+$ and must not be app_dev" >&2
  exit 2
fi
if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "FAIL setup: POSTGRES_PASSWORD is not set. Export it from the root .env (never print it), then re-run." >&2
  exit 2
fi
TOP="$(git rev-parse --show-toplevel)"
if [[ "$(realpath "$TOP")" == "$(realpath "$ROOT_CHECKOUT")" ]]; then
  echo "FAIL setup: never run installs or builds in the root checkout ($ROOT_CHECKOUT)" >&2
  exit 2
fi
cd "$TOP"
mkdir -p "$LOCKS"

SUMMARY=()
step() {
  local name="$1"
  shift
  local t0=$SECONDS
  echo "== $name: $*"
  if "$@"; then
    SUMMARY+=("PASS $name ($((SECONDS - t0))s)")
  else
    local rc=$?
    SUMMARY+=("FAIL $name exit=$rc ($((SECONDS - t0))s)")
    finish 1
  fi
}
skip() { SUMMARY+=("SKIP $1: $2"); echo "== $1: SKIP ($2)"; }
finish() {
  echo
  echo "== verify-local summary"
  echo "head=$(git rev-parse HEAD) base=$(git rev-parse "$BASE_SHA") node=$(node --version) card=${CARD:-none} db=$LANE_DB port=$LANE_PORT"
  printf '%s\n' "${SUMMARY[@]}"
  if [[ "$1" == 0 ]]; then echo "VERIFY-LOCAL PASS"; else echo "VERIFY-LOCAL FAIL"; fi
  echo "A PASS here is not a verdict: the live receipt and parity evidence are still required (TEST-AUDIT D13)."
  exit "$1"
}

git rev-parse --verify "${BASE_SHA}^{commit}" >/dev/null
step "clean tree" bash -c 'git diff --quiet && git diff --cached --quiet'

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" != "24" ]]; then
  if [[ "${REQUIRE_NODE24:-0}" == "1" ]]; then
    SUMMARY+=("FAIL node: target 24, running $(node --version)")
    finish 1
  fi
  SUMMARY+=("WARN node: target 24 (D5), running $(node --version); recorded, not certified")
fi

schema_guard() {
  local changed
  changed="$(git diff --name-only "$BASE_SHA" HEAD -- db/ | tr '\n' ' ')"
  if [[ -z "$changed" ]]; then return 0; fi
  for w in $SCHEMA_WRITERS; do [[ "$CARD" == "$w" ]] && return 0; done
  echo "db/ changed outside the D34 schema chain ($SCHEMA_WRITERS): $changed" >&2
  return 1
}
step "schema guard (D34)" schema_guard

step "npm ci" npm ci --no-audit --no-fund --prefer-offline
step "prisma generate" npx prisma generate
HAS_FRONTEND=0
[[ -f frontend/package.json ]] && HAS_FRONTEND=1
if [[ "$HAS_FRONTEND" == 1 ]]; then step "frontend npm ci" npm --prefix frontend ci --no-audit --no-fund --prefer-offline; fi

step "format check" npm run format:check
step "typecheck" npm run typecheck
if [[ "$HAS_FRONTEND" == 1 ]]; then step "frontend typecheck" npm --prefix frontend run typecheck; fi
step "lint" npm run lint
if [[ "$HAS_FRONTEND" == 1 ]]; then step "frontend lint" npm --prefix frontend run lint; fi
step "unit tests" npm run test
if [[ "$HAS_FRONTEND" == 1 ]]; then step "frontend tests" npm --prefix frontend run test; fi

PGPASS="$POSTGRES_PASSWORD"
docker exec vari8-db-1 dropdb -U app --if-exists "$LANE_DB" >/dev/null
docker exec vari8-db-1 createdb -U app "$LANE_DB"
cleanup() { [[ "${KEEP_DB:-0}" == 1 ]] || docker exec vari8-db-1 dropdb -U app --if-exists "$LANE_DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT
export DATABASE_URL="postgresql://app:${PGPASS}@127.0.0.1:5433/${LANE_DB}?schema=public"
export INTEGRATION_DATABASE_URL="$DATABASE_URL"
export AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -base64 32)}"
export AUTH_URL="${AUTH_URL:-http://127.0.0.1:${LANE_PORT}}"

if [[ -n "$(git diff --name-only "$BASE_SHA" HEAD -- db/ lib/ app/api/)" ]]; then
  step "integration tests" npm run test:integration
else
  skip "integration tests" "no change under db/, lib/ or app/api/"
fi
step "migrate deploy" npx prisma migrate deploy

step "build" npm run build
if [[ "$HAS_FRONTEND" == 1 ]]; then step "frontend build" npm --prefix frontend run build; fi

if [[ "${SKIP_E2E:-0}" == 1 ]]; then
  skip "e2e flow specs" "SKIP_E2E=1"
else
  SPECS=()
  for s in tests/e2e/invite-acceptance.spec.ts tests/e2e/password-reset.spec.ts tests/e2e/auth.spec.ts; do
    [[ -f "$s" ]] && SPECS+=("$s")
  done
  if [[ ${#SPECS[@]} -eq 0 ]]; then
    skip "e2e flow specs" "none present"
  elif grep -q PLAYWRIGHT_PORT_BASE playwright.config.ts; then
    step "e2e flow specs" env CI=1 PLAYWRIGHT_PORT_BASE="$LANE_PORT" npx playwright test "${SPECS[@]}" --workers=1
  else
    # Ports 3000, 3101, 3102 are fixed until PR-03: serialize browser runs across lanes.
    step "e2e flow specs (serialized)" flock "$LOCKS/e2e.lock" env CI=1 npx playwright test "${SPECS[@]}" --workers=1
  fi
fi

if [[ -f tools/parity/run.mjs ]]; then
  # PR-P1 harness: starts the canvas on PARITY_PORT, captures 1440x900 and 390x844, compares with the baseline.
  # After PR-01 the harness serves the root app (PR-01 points it there); PARITY_URL reuses a running lane server.
  step "parity regression (D32)" env PARITY_PORT="$((LANE_PORT + 1))" npm run parity
else
  skip "parity regression (D32)" "harness (PR-P1) not on this branch yet"
fi

finish 0
