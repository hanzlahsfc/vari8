# Sourced by the program shell tools. Derives the repo root from this file's location and reads the
# machine paths from icm/05-build/program-config.json, so no tool hard-codes a /home path.
# Exports: TOOLS_DIR, REPO_ROOT, PROGRAM_CFG, WT (worktrees root), BETA (integration worktree),
#          ROOT_CHECKOUT (the checkout no lane may build in), LOCKS.
TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TOOLS_DIR/../../.." && pwd)"
PROGRAM_CFG="$REPO_ROOT/icm/05-build/program-config.json"
[[ -f "$PROGRAM_CFG" ]] || { echo "FAIL setup: $PROGRAM_CFG missing" >&2; exit 2; }
command -v jq >/dev/null || { echo "FAIL setup: jq is required to read $PROGRAM_CFG" >&2; exit 2; }
program_cfg() { jq -er --arg k "$1" '.[$k]' "$PROGRAM_CFG"; }
WT="${VARI8_WORKTREES:-$(program_cfg worktrees_root)}"
BETA="${VARI8_BETA:-$(program_cfg integration_worktree)}"
ROOT_CHECKOUT="$(program_cfg root_checkout)"
LOCKS="$WT/.locks"
