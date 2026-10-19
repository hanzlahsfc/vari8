#!/usr/bin/env python3
"""Create the kanban board `vari8` from icm/05-build/graph.json (one card per graph node).

Idempotent: every card carries the idempotency key `vari8:<card key>`, so a re-run returns the
existing ids. Every card is created with `--initial-status blocked` so nothing dispatches before
the orchestrator has checked the graph; the go step is `board.py --release` (unblocks the cards
whose parents are done; the rest return to todo and promote as parents complete).
External cards that already shipped are completed right after creation.

Usage:
  board.py              create the board and every card, write icm/05-build/cards/board-ids.tsv
  board.py --dry-run    print the commands only
  board.py --release    unblock every card that is not external-running (orchestrator only)
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
BETA = os.path.dirname(os.path.dirname(OUT))
BOARD = "vari8"
GRAPH = json.load(open(f"{OUT}/graph.json"))
IDS = f"{OUT}/cards/board-ids.tsv"
DRY = "--dry-run" in sys.argv
PROVIDER = {
    "deepseek-v4.1-flash": "opencode-go",
    "claude-haiku-5-5": "anthropic",
    "claude-sonnet-5-5": "anthropic",
    "claude-opus-5-5": "anthropic",
    "gpt-6.1-sol": "openai-codex",
}


def run(args):
    if DRY:
        print(" ".join(args))
        return ""
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(f"FAILED {' '.join(args[:6])}...\n{r.stdout}\n{r.stderr}\n")
        sys.exit(1)
    return r.stdout.strip()


def kb(*a):
    return ["hermes", "kanban", "--board", BOARD, *a]


def board_exists():
    r = subprocess.run(["hermes", "kanban", "boards", "list"], capture_output=True, text=True)
    return any(line.split()[1:2] == [BOARD] or line.split()[:1] == [BOARD] for line in r.stdout.splitlines() if line.strip())


def load_ids():
    ids = {}
    if os.path.exists(IDS):
        for line in open(IDS):
            k, _, v = line.rstrip("\n").partition("\t")
            if k and v and k != "key":
                ids[k] = v.split("\t")[0]
    return ids


def create():
    if not DRY and not board_exists():
        run(["hermes", "kanban", "boards", "create", BOARD])
    run(kb("init"))
    ids = load_ids()
    order = []
    seen = set()
    by_key = {c["key"]: c for c in GRAPH["cards"]}

    def visit(k):
        if k in seen:
            return
        seen.add(k)
        for p in by_key[k]["parents"]:
            visit(p)
        order.append(k)

    for c in GRAPH["cards"]:
        visit(c["key"])
    for k in order:
        c = by_key[k]
        if k in ids:
            continue
        args = kb("create", f'[{c["pr"]}] {c["title"]}', "--body-file", f'{BETA}/{c["body_file"]}',
                  "--idempotency-key", f"vari8:{k}", "--initial-status", "blocked", "--created-by", "meliodas",
                  "--max-runtime", c["max_runtime"], "--json")
        if c["assignee"]:
            args += ["--assignee", c["assignee"]]
        if c["model"]:
            args += ["--model", c["model"], "--provider", c["provider"] or PROVIDER[c["model"]]]
        if c["kind"] != "decision":
            args += ["--workspace", f'worktree:{c["worktree"]}', "--branch", c["branch"]]
        for p in c["parents"]:
            args += ["--parent", ids.get(p, f"<{p}>")]
        for s in c["skills"]:
            args += ["--skill", s]
        out = run(args)
        tid = f"<{k}>" if DRY else json.loads(out).get("id") or json.loads(out).get("task", {}).get("id")
        ids[k] = str(tid)
        if not DRY:
            with open(IDS, "a") as f:
                if os.path.getsize(IDS) == 0:
                    f.write("key\ttask_id\tslug\n")
                f.write(f'{k}\t{tid}\t{c["slug"]}\n')
    evidence = {
        "DEC-AUTH": "icm/05-build/AUTH-DECISION.md: verdict Better Auth, with sources [A] to [M].",
        "DEC-AUTH-REVIEW": "Orchestrator ruling 02:12 accepted the verdict; D16a recorded in icm/03-plan/DECISIONS.md.",
        "AUD-REDUCTION": "icm/05-build/BACKEND-REDUCTION.md (Haiku, kakuzu gear); folded into PR-04, PR-R0 to PR-R3.",
        "AUD-PRR-BASELINE": "icm/05-build/audits/PRODREADY-BASELINE.md at 55a0f08: 160 entries, 31 P0 gaps.",
        "PR-02": "PR #57 merged into Vari8-Beta at 55a0f08; verifier report icm/05-build/reports/PR-02-verify.md says SHIP; branch and worktree removed.",
    }
    for k in order:
        c = by_key[k]
        if c.get("external") != "done":
            continue
        tid = ids[k]
        r = subprocess.run(kb("show", tid, "--json"), capture_output=True, text=True)
        if '"status": "done"' in r.stdout or "'status': 'done'" in r.stdout:
            continue
        run(kb("complete", tid, "--result", evidence.get(c["pr"], "Shipped outside the graph."), "--force"))
    done = [k for k in order if by_key[k].get("external") == "done"]
    print(f"board {BOARD}: {len(ids)} cards, {len(done)} completed as shipped outside the graph; ids in {IDS}")


def release():
    ids = load_ids()
    held = [ids[c["key"]] for c in GRAPH["cards"] if c.get("external") not in ("running", "done")]
    run(kb("unblock", *held))
    print(f"released {len(held)} cards; external running cards stay blocked until their builders finish")


def sync_bodies():
    ids = load_ids()
    n = 0
    for c in GRAPH["cards"]:
        if c["key"] in ids:
            run(kb("edit", ids[c["key"]], "--body", open(f'{BETA}/{c["body_file"]}').read()))
            n += 1
    print(f"synced {n} card bodies from icm/05-build/cards/")


if __name__ == "__main__":
    if not DRY and not os.path.exists(IDS):
        open(IDS, "w").close()
    if "--release" in sys.argv:
        release()
    elif "--sync-bodies" in sys.argv:
        sync_bodies()
    else:
        create()
