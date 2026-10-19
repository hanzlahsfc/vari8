#!/usr/bin/env bash
# Pre-create every card worktree under /home/nexuslink/vari8-worktrees on branch beta/<slug> at the
# current Vari8-Beta tip. The kanban dispatcher only reuses an existing linked worktree at a path
# outside a git repo; it cannot create one there (hermes_cli/kanban_db_workspace.py). Idempotent.
set -euo pipefail
BETA="/home/nexuslink/vari8-worktrees/beta"
WT="/home/nexuslink/vari8-worktrees"
cd "$BETA"
created=0
reused=0
for slug in $(python3 -c 'import json,sys; [print(c["slug"]) for c in json.load(open(sys.argv[1]))["cards"]]' icm/05-build/graph.json); do
  path="$WT/$slug"
  if [[ -e "$path/.git" ]]; then
    reused=$((reused + 1))
    continue
  fi
  if git show-ref --verify --quiet "refs/heads/beta/$slug"; then
    git worktree add -q "$path" "beta/$slug"
  else
    git worktree add -q -b "beta/$slug" "$path" Vari8-Beta
  fi
  created=$((created + 1))
done
echo "worktrees created=$created reused=$reused"
