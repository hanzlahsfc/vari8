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
Release creates each released card's linked worktree (path from graph.json, branch beta/<slug>, from
origin/Vari8-Beta) before unblocking it; a card whose worktree cannot be created stays blocked and the run
exits 1. A verify parent releases its children only with a result starting SHIP; a decision parent
releases them unless its result starts FIX; a parent with a rejected verdict is listed and holds its children.
Release fails closed (exit 3, nothing unblocked) when any candidate's `parents` field is missing,
malformed or different from graph.json. Self-test: `python3 icm/05-build/tools/board_selftest.py`.
Environment: BOARD_SLUG overrides the board (default vari8), BOARD_IDS the id map file, BOARD_REPO the repo
that holds the worktrees (default this checkout), BOARD_BASE the base ref (default origin/Vari8-Beta).
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
REPO = os.environ.get("BOARD_REPO", BETA)  # repo that owns the card worktrees
BASE = os.environ.get("BOARD_BASE", "origin/Vari8-Beta")  # base for new card branches
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


def board_parents(tid, key, ids):
    """Parent ids from `hermes kanban show --json`, failing closed.

    A missing, null or malformed `parents` field, or parents that differ from graph.json, is an
    error: the caller must not treat it as "no parents" and release the card.
    """
    d = show(tid)
    parents = d.get("parents") if isinstance(d, dict) else None
    if not isinstance(parents, list) or not all(isinstance(p, str) and p for p in parents):
        return None, f"{key} {tid}: `parents` missing or malformed in `hermes kanban show --json` ({type(parents).__name__})"
    want = sorted(ids[p] for p in BY_KEY[key]["parents"] if p in ids)
    if sorted(parents) != want or len(want) != len(BY_KEY[key]["parents"]):
        return None, f"{key} {tid}: board parents {sorted(parents)} differ from graph.json {want}; run --sync first"
    return parents, None


def verdict_problem(tid, key, cache):
    """None when this done parent lets its children go; otherwise the reason it does not.

    verify: the result must start with SHIP. decision: the result must be recorded and must not start
    with FIX (decisions record free text, no SHIP token). Other kinds: done is enough.
    """
    kind = BY_KEY[key]["kind"]
    if kind not in ("verify", "decision"):
        return None
    if tid not in cache:
        cache[tid] = str(((show(tid).get("task") or {}).get("result")) or "").strip()
    result = cache[tid]
    if kind == "verify" and result.startswith("SHIP"):
        return None
    if kind == "decision" and result and not result.startswith("FIX"):
        return None
    return f"{key} {tid} ({kind}) result {result[:60]!r} does not release its children"


def ensure_worktree(path, branch):
    """Create the linked worktree at `path` on `branch` from BASE, reusing an existing branch.

    Reuses path only when its worktree is checked out on `branch`; a worktree on any other branch,
    a detached HEAD or an unreadable .git raises RuntimeError. A failed `worktree add -b` deletes
    the branch ref it created (never a pre-existing one). Raises RuntimeError when git refuses.
    """
    if os.path.exists(os.path.join(path, ".git")):
        r = subprocess.run(["git", "-C", path, "symbolic-ref", "--short", "-q", "HEAD"],
                           capture_output=True, text=True)
        actual = r.stdout.strip() if r.returncode == 0 else ""
        if actual == branch:
            return
        raise RuntimeError(f"{path}: existing worktree is on {actual or 'no branch'}, not {branch}")
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
    except OSError as e:
        raise RuntimeError(str(e))
    has_branch = subprocess.run(["git", "-C", REPO, "show-ref", "--verify", "--quiet", f"refs/heads/{branch}"]).returncode == 0
    args = ["worktree", "add", "-q", path, branch] if has_branch else ["worktree", "add", "-q", "-b", branch, path, BASE]
    r = subprocess.run(["git", "-C", REPO, *args], capture_output=True, text=True)
    if r.returncode:
        if not has_branch:
            subprocess.run(["git", "-C", REPO, "branch", "-D", branch], capture_output=True)
        raise RuntimeError(f"git worktree add failed: {(r.stderr or r.stdout).strip()}")


def release_once():
    ids = load_ids()
    key_of = {tid: key for key, tid in ids.items()}
    st = statuses()
    cache = {}
    eligible, held, waiting, errors = [], [], 0, []
    for c in GRAPH["cards"]:
        tid = ids.get(c["key"])
        if not tid or st.get(tid) != "blocked" or c.get("external") in ("running", "done") or not c["assignee"]:
            continue
        parents, err = board_parents(tid, c["key"], ids)
        if err or parents is None:
            errors.append(err or f"{c['key']} {tid}: no parents list")
            continue
        if not all(st.get(p) == "done" for p in parents):
            waiting += 1
            continue
        why = next((w for w in (verdict_problem(p, key_of[p], cache) for p in parents) if w), None)
        if why:
            held.append(why)
        else:
            eligible.append((c["key"], tid))
    if errors:
        sys.stderr.write("release refused, nothing unblocked:\n" + "\n".join(f"  {e}" for e in errors) + "\n")
        sys.exit(3)
    todo = [(k, tid) for k, tid in eligible if needs_workspace(BY_KEY[k]) and BY_KEY[k].get("worktree")]
    if DRY:
        for k, tid in eligible:
            print(f"would release {k} {tid}")
        for k, _ in todo:
            c = BY_KEY[k]
            if os.path.exists(os.path.join(c["worktree"], ".git")):
                print(f"worktree exists, reused: {c['worktree']}")
            else:
                print(f"would create worktree {c['worktree']} on {c['branch'] or 'beta/' + c['slug']} from {BASE}")
        for h in held:
            print(f"rejected parent: {h}")
        print(f"dry run: {len(eligible)} releasable, {waiting} blocked on open parents, {len(held)} rejected parent verdicts")
        return len(eligible)
    if any(not os.path.exists(os.path.join(BY_KEY[k]["worktree"], ".git")) for k, _ in todo):
        fetched = subprocess.run(["git", "-C", REPO, "fetch", "-q", "origin"], capture_output=True, text=True)
        if fetched.returncode:
            sys.stderr.write(f"release refused, nothing unblocked: git fetch origin failed: {fetched.stderr.strip()}\n")
            sys.exit(1)
    failed, ready = [], []
    needs_wt = {k for k, _ in todo}
    for k, tid in eligible:
        c = BY_KEY[k]
        if k in needs_wt:
            try:
                ensure_worktree(c["worktree"], c["branch"] or f"beta/{c['slug']}")
            except RuntimeError as e:
                failed.append(f"{k} {tid}: worktree {c['worktree']}: {e}")
                continue
        ready.append((k, tid))
    if ready:
        run(kb("unblock", *[tid for _, tid in ready], "--reason", "board.py --release: every parent done"))
        st = statuses()
        bad = [(k, tid, st.get(tid)) for k, tid in ready if st.get(tid) not in ("ready", "todo", "running")]
        if bad:
            sys.stderr.write(f"release: unexpected status after unblock: {bad}\n")
            sys.exit(1)
    print(f"released {len(ready)} cards with every parent done; {waiting} stay blocked on open parents; {len(held)} held on a rejected parent verdict")
    for h in held:
        print(f"  held: {h}")
    if failed:
        sys.stderr.write("release: worktree creation failed, these stay blocked:\n" + "\n".join(f"  {f}" for f in failed) + "\n")
        sys.exit(1)
    return len(ready)


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
