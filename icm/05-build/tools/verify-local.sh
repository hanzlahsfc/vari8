#!/usr/bin/env bash
# Local gate per D13. Contract: icm/03-plan/output/TEST-AUDIT.md, section "Local gate per PR, D13".
# PR-03 promotes this file to scripts/verify-local.sh; until then every lane runs this copy.
#
# Required: BASE_SHA (the Vari8-Beta commit the change is measured against), LANE_DB (app_<lane>).
# Optional: LANE_PORT (default 3999), CARD (plan id, for the schema guard), KEEP_DB=1,
#           SKIP_E2E=1, SKIP_PARITY=1, PARITY_SCREENS (default ALL), REQUIRE_NODE26=1.
set -euo pipefail

: "${BASE_SHA:?Set BASE_SHA to the Vari8-Beta commit this change is measured against}"
: "${LANE_DB:?Set LANE_DB to this lane database, app_<lane>}"
LANE_PORT="${LANE_PORT:-3999}"
CARD="${CARD:-}"
. "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
SCHEMA_WRITERS="PR-05 PR-M0 PR-R2 PR-SUPP"

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

if [[ -n "${REQUIRE_NODE24:-0}" && "${REQUIRE_NODE24:-0}" != "0" ]]; then
  SUMMARY+=("FAIL node: REQUIRE_NODE24 is retired; use REQUIRE_NODE26=1 for the .nvmrc floor (O18)")
  finish 1
fi

# The O18 floor is single-sourced from the root .nvmrc; a missing or malformed
# floor is a hard failure, never a silent fallback.
NVMRC="$TOP/.nvmrc"
if [[ ! -r "$NVMRC" ]]; then
  SUMMARY+=("FAIL node: $NVMRC is missing or unreadable; the Node floor is read from the root .nvmrc (O18)")
  finish 1
fi
# Validate the file, never reinterpret it: trim surrounding whitespace only and
# require the remaining content to be exactly one stable v?X.Y.Z version, so
# internal spaces, tabs, newlines and multiple entries fail instead of
# concatenating into a different floor.
NODE_FLOOR_RAW="$(<"$NVMRC")"
NODE_FLOOR_RAW="${NODE_FLOOR_RAW#"${NODE_FLOOR_RAW%%[![:space:]]*}"}"
NODE_FLOOR_RAW="${NODE_FLOOR_RAW%"${NODE_FLOOR_RAW##*[![:space:]]}"}"
if [[ ! "$NODE_FLOOR_RAW" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  SUMMARY+=("FAIL node: $NVMRC must contain a complete stable X.Y.Z floor; got '${NODE_FLOOR_RAW:-<empty>}' (O18)")
  finish 1
fi
NODE_TARGET="${NODE_FLOOR_RAW#v}"
NODE_RAW="$(node --version 2>/dev/null || true)"

node_ge_floor() {
  local cur="$1" want="$2"
  local c1 c2 c3 w1 w2 w3
  IFS=. read -r c1 c2 c3 <<<"$cur"
  IFS=. read -r w1 w2 w3 <<<"$want"
  (( 10#$c1 > 10#$w1 )) && return 0
  (( 10#$c1 == 10#$w1 && 10#$c2 > 10#$w2 )) && return 0
  (( 10#$c1 == 10#$w1 && 10#$c2 == 10#$w2 && 10#$c3 >= 10#$w3 )) && return 0
  return 1
}

if [[ ! "$NODE_RAW" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  if [[ "${REQUIRE_NODE26:-0}" == "1" ]]; then
    SUMMARY+=("FAIL node: malformed Node version '${NODE_RAW:-<none>}'; expected v<major>.<minor>.<patch> at floor $NODE_TARGET (O18)")
    finish 1
  fi
  SUMMARY+=("WARN node: target $NODE_TARGET (D5, O18), running '${NODE_RAW:-<none>}' — not a stable v<major>.<minor>.<patch> version; recorded, not certified")
elif ! node_ge_floor "${NODE_RAW#v}" "$NODE_TARGET"; then
  if [[ "${REQUIRE_NODE26:-0}" == "1" ]]; then
    SUMMARY+=("FAIL node: target $NODE_TARGET or newer (O18), running $(node --version)")
    finish 1
  fi
  SUMMARY+=("WARN node: target $NODE_TARGET (D5, O18), running $(node --version); recorded, not certified")
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
# W0-fix-3: the committed program files must be the generator's output (generate.py --check).
if [[ -f icm/05-build/tools/generate.py ]]; then
  step "program generator check" python3 icm/05-build/tools/generate.py --root "$TOP" --check
fi

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

if [[ "${SKIP_PARITY:-0}" == 1 ]]; then
  # Only for cards whose contract reads "Parity (D32) on: none" (data-model PRs wire no screens).
  # The parity baseline is host-specific: it is captured on the Linux reference host and cannot
  # match on another host, so a card that owns no screens must not be failed on it.
  skip "parity regression (D32)" "SKIP_PARITY=1, card contract gates no screens"
elif [[ -f tools/parity/run.mjs ]]; then
  # PR-P1 harness: starts the canvas on PARITY_PORT, captures 1440x900 and 390x844, compares with the baseline.
  # After PR-01 the harness serves the root app (PR-01 points it there); PARITY_URL reuses a running lane server.
  step "parity regression (D32)" env PARITY_PORT="$((LANE_PORT + 1))" npm run parity
else
  skip "parity regression (D32)" "harness (PR-P1) not on this branch yet"
fi

finish 0
