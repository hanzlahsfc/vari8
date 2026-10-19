#!/usr/bin/env bash
# AUD-REDUCTION-FIX: shell-level census for BACKEND-REDUCTION.md. Run from the repo root:
#   bash icm/05-build/evidence/AUD-REDUCTION-FIX/census.sh
set -u
echo "## F1 census"
echo "app/workspace tsx: $(git ls-files 'app/workspace/*.tsx' | wc -l); app/(tracker) tsx: $(git ls-files 'app/(tracker)/*.tsx' | wc -l)"
echo "## F2 components"
echo "components ts/tsx files: $(git ls-files components | grep -cE '\.(ts|tsx)$')"
echo "sign-out-button importers:"; git grep -ln 'sign-out-button' -- app lib components | sed 's/^/  /'
echo "## F4 transition modules, importers outside the subsystem"
echo "frontend/src rollback hits (files): $(git grep -liE 'rollback' -- frontend/src | wc -l)"
echo "frontend/src impact hits (files): $(git grep -liE 'impact' -- frontend/src | wc -l)"
echo "frontend/src upgrade hits (files, lines): $(git grep -liE 'upgrade' -- frontend/src | wc -l), $(git grep -ciE 'upgrade' -- frontend/src | awk -F: '{s+=$2} END {print s}')"
echo "## F5 importers of extraction modules"
git grep -nE 'extraction/(databases|css)' -- app lib scripts components tests | sed 's/^/  /'
echo "extract:sheets in package.json:"; grep -n 'extract:sheets' package.json | sed 's/^/  /'
echo "## F10 flags"
echo ".env.example commented or set flags: $(grep -cE '^#?\s*ENABLE_[A-Z_]+=' .env.example)"
echo "distinct ENABLE_ names in code (app lib components auth.ts):"
git grep -ohE 'ENABLE_[A-Z_]+' -- app lib components auth.ts | sort -u | sed 's/^/  /'
echo "flag mention lines, app lib components auth.ts: $(git grep -nE 'ENABLE_[A-Z_]+' -- app lib components auth.ts | wc -l)"
echo "process.env.ENABLE_ lines: $(git grep -nE 'process\.env\.ENABLE_' -- app lib components auth.ts | wc -l)"
echo "flag mention + is*Enabled( + classify*Runtime( call lines: $(git grep -nE 'ENABLE_[A-Z_]+|is[A-Za-z]+Enabled\(|classify[A-Za-z]*Runtime\(' -- app lib components auth.ts | wc -l)"
echo "classifyXRuntime definitions:"; git grep -nE 'function classify[A-Za-z]*Runtime' -- app lib components auth.ts | sed 's/^/  /'
echo "## Tests and e2e"
echo "tests tracked files (incl. AGENTS.md): $(git ls-files tests | wc -l)"
for d in unit integration e2e; do echo "tests/$d files: $(git ls-files tests/$d | wc -l)"; done
echo "e2e files hitting /workspace, /daily, /login:"
for f in $(git ls-files tests/e2e); do echo "  $f ws=$(grep -c '/workspace' "$f") daily=$(grep -c '/daily' "$f") login=$(grep -c '/login' "$f")"; done
echo "## PLAN references (current line numbers)"
grep -nE 'S12-4[3-9]|S12-5[0-3]' icm/03-plan/output/PLAN.md | cut -c1-200 | sed 's/^/  /'
echo "## Cards and state files that cite BACKEND-REDUCTION"
grep -rln 'BACKEND-REDUCTION' icm/05-build/cards icm/03-plan icm/05-build/ORCHESTRATOR-STATE.md | sort | sed 's/^/  /'
