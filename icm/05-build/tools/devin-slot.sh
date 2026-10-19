#!/usr/bin/env bash
# Run a Devin builder only when one of DEVIN_SLOTS (default 5) is free (PROGRAM-BRIEF: max 5 at once, RAM).
# Usage: devin-slot.sh -- <launch line...>
# The slot lock fd stays open in the exec'd process, so the slot frees when Devin exits.
# Devin processes started outside the graph (no slot) count against the cap through pgrep.
set -euo pipefail
[[ "${1:-}" == "--" ]] && shift
SLOTS="${DEVIN_SLOTS:-5}"
LOCKS="/home/nexuslink/vari8-worktrees/.locks"
mkdir -p "$LOCKS"
while true; do
  # Count the devin binary itself only: the bash and jobcap wrappers carry the same arguments and
  # would double-count (measured 02:55: 3 builders gave pgrep -fc 7, pgrep -x 6).
  running="$(pgrep -fc '^(/home/nexuslink/\.local/bin/)?devin -p --model swe-2-max' || true)"
  if (( running < SLOTS )); then
    for i in $(seq 1 "$SLOTS"); do
      exec 8>"$LOCKS/devin-slot-$i.lock"
      if flock -n 8; then
        echo "devin slot $i acquired ($running running)"
        exec "$@"
      fi
      exec 8>&-
    done
  fi
  sleep 20
done
