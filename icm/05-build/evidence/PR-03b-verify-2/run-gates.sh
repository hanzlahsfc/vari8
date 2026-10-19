#!/usr/bin/env bash
cd /home/nexuslink/vari8-worktrees/pr-03-react-hooks
E=icm/05-build/evidence/PR-03b-verify-2
run(){ name="$1"; shift; echo "### $name: $*" > $E/$name.log; "$@" >> $E/$name.log 2>&1; rc=$?; echo "$name exit=$rc" >> $E/summary.txt; }
: > $E/summary.txt
run typecheck npm run typecheck
run lint npm run lint
run lint-hooks-grep sh -c "npx eslint . 2>&1 | grep -c 'react-hooks/' ; true"
run test npm run test
run build npm run build
run frontend-build sh -c "cd frontend && npm run build"
run lint-rules-config sh -c "grep -n 'react-hooks' eslint.config.mjs"
echo ALLDONE >> $E/summary.txt
