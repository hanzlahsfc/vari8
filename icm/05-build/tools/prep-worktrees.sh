#!/usr/bin/env bash
# Pre-create every card worktree under the worktrees root (program-config.json) on branch beta/<slug> at the
# current Vari8-Beta tip. The kanban dispatcher only reuses an existing linked worktree at a path
# outside a git repo; it cannot create one there (hermes_cli/kanban_db_workspace.py). Idempotent.
# Usage: prep-worktrees.sh [slug ...]   no arguments: every card that needs a worktree;
#                                       slugs: only those cards (each must need a worktree).
# board.py --release creates the worktree of each card it releases, so this is for bulk prep only.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
cd "$BETA"
git fetch -q origin
BASE="${PREP_BASE:-origin/Vari8-Beta}"
created=0
reused=0
# Cards that shipped outside the graph (external "done") need no worktree.
SLUGS=$(python3 -c 'import json,sys; [print(c["slug"]) for c in json.load(open(sys.argv[1]))["cards"] if c.get("external") != "done" and (c["kind"] != "decision" or c["assignee"])]' icm/05-build/graph.json)
if (($#)); then
  for s in "$@"; do
    grep -qx -- "$s" <<<"$SLUGS" || { echo "FAIL: $s is not a card that needs a worktree" >&2; exit 2; }
  done
  SLUGS=$(printf '%s\n' "$@")
fi
for slug in $SLUGS; do
  path="$WT/$slug"
  if [[ -e "$path/.git" ]]; then
    reused=$((reused + 1))
    continue
  fi
  if git show-ref --verify --quiet "refs/heads/beta/$slug"; then
    git worktree add -q "$path" "beta/$slug"
  else
    git worktree add -q -b "beta/$slug" "$path" "$BASE"
  fi
  created=$((created + 1))
done
echo "worktrees created=$created reused=$reused base=$BASE"
