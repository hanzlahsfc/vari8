#!/usr/bin/env python3
"""Create and maintain the kanban board `vari8` from icm/05-build/graph.json (one card per graph node).

Idempotent: every card carries the idempotency key `vari8:<card key>`, so a re-run returns the
existing ids. Every card is created with `--initial-status blocked` so nothing dispatches before
the orchestrator has checked the graph. External cards that already shipped are completed right
after creation.

Release does not rely on how `hermes kanban unblock` treats a card with open parents (measured on a
throwaway board: it lands in todo, not ready; see icm/05-build/reports/W0-fix-1.md). It checks the
parents itself: only a blocked card whose every parent is done is unblocked, and the card's status
is read back afterwards; a card that did not land in ready or todo is reported and the run fails.
Cards with open parents stay blocked; run `--release --watch` to keep releasing as parents finish.

Usage:
  board.py                     create the board and every missing card, ids in icm/05-build/cards/board-ids.tsv
  board.py --dry-run           print the create commands only
  board.py --sync              make existing cards match graph.json: body, model and provider, parent links
  board.py --release           unblock blocked cards whose parents are all done (orchestrator only)
  board.py --release --dry-run list what --release would unblock, change nothing
  board.py --release --watch   repeat --release every 60 s until no releasable card is left
Environment: BOARD_SLUG overrides the board (default vari8), BOARD_IDS the id map file.
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
BETA = os.path.dirname(os.path.dirname(OUT))
BOARD = os.environ.get("BOARD_SLUG", "vari8")
GRAPH = json.load(open(os.environ.get("BOARD_GRAPH", f"{OUT}/graph.json")))
IDS = os.environ.get("BOARD_IDS", f"{OUT}/cards/board-ids.tsv")
DRY = "--dry-run" in sys.argv
PROVIDER = {
    "deepseek-v4.1-flash": "opencode-go",
    "claude-haiku-5-5": "anthropic",
    "claude-opus-5-5": "anthropic",
    "gpt-6.1-sol": "openai-codex",
}
BY_KEY = {c["key"]: c for c in GRAPH["cards"]}


def run(args, dry_ok=False):
    if DRY and not dry_ok:
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
    return any(BOARD in line.split()[:2] for line in r.stdout.splitlines() if line.strip())


def load_ids():
    ids = {}
    if os.path.exists(IDS):
        for line in open(IDS):
            k, _, v = line.rstrip("\n").partition("\t")
            if k and v and k != "key":
                ids[k] = v.split("\t")[0]
    return ids


def topo_order():
    order, seen = [], set()

    def visit(k):
        if k in seen:
            return
        seen.add(k)
        for p in BY_KEY[k]["parents"]:
            visit(p)
        order.append(k)

    for c in GRAPH["cards"]:
        visit(c["key"])
    return order


def needs_workspace(c):
    return c["kind"] != "decision" or (c["assignee"] and c.get("external") != "done")


def show(tid):
    return json.loads(run(kb("show", tid, "--json"), dry_ok=True))


def statuses():
    return {t["id"]: t["status"] for t in json.loads(run(kb("list", "--json"), dry_ok=True))}


EVIDENCE = {
    "DEC-AUTH": "icm/05-build/AUTH-DECISION.md: verdict Better Auth, with sources [A] to [M].",
    "DEC-AUTH-REVIEW": "Orchestrator ruling 02:12 accepted the verdict; D16a recorded in icm/03-plan/DECISIONS.md.",
    "AUD-REDUCTION": "icm/05-build/BACKEND-REDUCTION.md (claude-haiku-5-5, kakuzu gear); folded into PR-04, PR-R0 to PR-R3.",
    "AUD-PRR-BASELINE": "icm/05-build/audits/PRODREADY-BASELINE.md at 55a0f08: 160 entries, 38 P0 rows.",
    "PR-02": "PR #57 merged into Vari8-Beta at 55a0f08; verifier report icm/05-build/reports/PR-02-verify.md says SHIP; branch and worktree removed.",
}


def create():
    if not DRY and not board_exists():
        run(["hermes", "kanban", "boards", "create", BOARD])
    run(kb("init"))
    ids = load_ids()
    order = topo_order()
    for k in order:
        c = BY_KEY[k]
        if k in ids:
            continue
        args = kb("create", f'[{c["pr"]}] {c["title"]}', "--body-file", f'{BETA}/{c["body_file"]}',
                  "--idempotency-key", f"{BOARD}:{k}", "--initial-status", "blocked", "--created-by", "meliodas",
                  "--max-runtime", c["max_runtime"], "--json")
        if c["assignee"]:
            args += ["--assignee", c["assignee"]]
        if c["model"]:
            args += ["--model", c["model"], "--provider", c["provider"] or PROVIDER[c["model"]]]
        if needs_workspace(c) and c.get("worktree"):
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
    if DRY:
        return
    st = statuses()
    for k in order:
        c = BY_KEY[k]
        if c.get("external") == "done" and st.get(ids[k]) != "done":
            run(kb("complete", ids[k], "--result", EVIDENCE.get(c["pr"], "Shipped outside the graph."), "--force"))
    print(f"board {BOARD}: {len(ids)} cards; ids in {IDS}")


def sync():
    """Make existing cards match graph.json: body, model and provider, parent links."""
    ids = load_ids()
    changed = dict(body=0, model=0, link=0, unlink=0)
    for k in topo_order():
        c = BY_KEY[k]
        if k not in ids:
            continue
        tid = ids[k]
        d = show(tid)
        t = d["task"]
        body = open(f'{BETA}/{c["body_file"]}').read()
        if t.get("body") != body:
            run(kb("edit", tid, "--body", body))
            changed["body"] += 1
        if (t.get("model_override") or None) != c["model"]:
            if c["model"]:
                run(kb("set-model", tid, c["model"], "--provider", c["provider"] or PROVIDER[c["model"]]))
            else:
                run(kb("set-model", tid, "none"))
            changed["model"] += 1
        want = {ids[p] for p in c["parents"] if p in ids}
        have = set(d.get("parents") or [])
        for p in sorted(want - have):
            run(kb("link", p, tid))
            changed["link"] += 1
        for p in sorted(have - want):
            run(kb("unlink", p, tid))
            changed["unlink"] += 1
    print(f"sync {BOARD}: {changed}")


def release_once():
    ids = load_ids()
    st = statuses()
    eligible, waiting = [], 0
    for c in GRAPH["cards"]:
        tid = ids.get(c["key"])
        if not tid or st.get(tid) != "blocked" or c.get("external") in ("running", "done") or not c["assignee"]:
            continue
        parents = show(tid).get("parents") or []
        if all(st.get(p) == "done" for p in parents):
            eligible.append((c["key"], tid))
        else:
            waiting += 1
    if DRY:
        for k, tid in eligible:
            print(f"would release {k} {tid}")
        print(f"dry run: {len(eligible)} releasable, {waiting} blocked on open parents")
        return len(eligible)
    if eligible:
        run(kb("unblock", *[tid for _, tid in eligible], "--reason", "board.py --release: every parent done"))
        st = statuses()
        bad = [(k, tid, st.get(tid)) for k, tid in eligible if st.get(tid) not in ("ready", "todo", "running")]
        if bad:
            sys.stderr.write(f"release: unexpected status after unblock: {bad}\n")
            sys.exit(1)
    print(f"released {len(eligible)} cards with every parent done; {waiting} stay blocked on open parents")
    return len(eligible)


def release():
    if "--watch" not in sys.argv:
        release_once()
        return
    while True:
        release_once()
        st = statuses()
        ids = load_ids()
        open_cards = [c for c in GRAPH["cards"] if st.get(ids.get(c["key"])) not in ("done", None)]
        if not open_cards:
            print("all cards done")
            return
        time.sleep(60)


if __name__ == "__main__":
    if not DRY and not os.path.exists(IDS):
        open(IDS, "w").close()
    if "--release" in sys.argv:
        release()
    elif "--sync" in sys.argv or "--sync-bodies" in sys.argv:
        sync()
    else:
        create()
