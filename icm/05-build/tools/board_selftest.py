#!/usr/bin/env python3
"""Self-test for board.py --release. Runs against a stub `hermes` on PATH; no real board is touched.

Each case runs board.py on a two-card graph: parent P, child C (blocked). The stub board has a random
throwaway slug (BOARD_SLUG vari8-test-<hex>); its statuses and `show` results come from env vars.
Worktree cases run `git worktree add` for real, in a throwaway clone of a throwaway origin.

Parent-fail-closed cases (parents field, unchanged behaviour):
  ok              show --json returns the right parents        -> exit 0, C unblocked
  missing         show --json has no `parents` key             -> exit 3, nothing unblocked
  null            `parents` is null                            -> exit 3, nothing unblocked
  malformed       `parents` is a string                        -> exit 3, nothing unblocked
  drift           `parents` differs from graph.json            -> exit 3, nothing unblocked
  open-parent     P still running                              -> exit 0, nothing unblocked
Worktree and verdict cases:
  wt-create       C has a worktree path, none exists           -> exit 0, worktree on beta/c, C unblocked
  wt-fail         worktree path is a non-empty dir, no .git    -> exit 1, C stays blocked, C named
  wt-branch       beta/c already exists                        -> exit 0, worktree on beta/c, C unblocked
  wt-dotgit       path is a worktree already on beta/c         -> exit 0, reused, C unblocked
  wt-orphan-ref   worktree add fails after creating beta/c     -> exit 1, the new ref is deleted
  wt-wrong-branch path is a worktree on another branch         -> exit 1, C blocked, names branch
  open-parent-wt  P running, C has a worktree path             -> exit 0, no worktree, C blocked
  verify-fix      verify parent done, result FIX               -> exit 0, C blocked, no worktree
  verify-ship     verify parent done, result SHIP              -> exit 0, C unblocked, worktree made
  verify-none     verify parent done, no result                -> exit 0, C blocked
  decision-fix    decision parent done, result FIX             -> exit 0, C blocked
  decision-ok     decision parent done, recorded outcome       -> exit 0, C unblocked
  dry-wt          --dry-run on an eligible card                -> exit 0, no worktree, no unblock, prints it
  dry-fix         --dry-run with a FIX verify parent           -> exit 0, no unblock, prints the rejection
Exit 0 only when every case behaves as listed.
"""
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
BOARD_PY = os.environ.get("BOARD_PY", os.path.join(HERE, "board.py"))

STUB = r'''#!/usr/bin/env python3
import json, os, sys
mode = os.environ["STUB_MODE"]
log = os.environ["STUB_LOG"]
args = sys.argv[1:]
if args[:2] == ["kanban", "--board"]:
    args = args[3:]
with open(log, "a") as f:
    f.write(" ".join(args) + "\n")
p_status = "running" if mode == "open-parent" else os.environ.get("STUB_P_STATUS", "done")
status = {"t_p": p_status, "t_c": "blocked"}
if any(l.startswith("unblock") for l in open(log).read().splitlines()):
    status["t_c"] = "ready"
p_result = os.environ.get("STUB_P_RESULT") or None
if args[0] == "list":
    print(json.dumps([{"id": k, "status": v} for k, v in status.items()]))
elif args[0] == "show":
    tid = args[1]
    d = {"task": {"id": tid, "status": status[tid], "result": p_result if tid == "t_p" else None}}
    parents = [] if tid == "t_p" else ["t_p"]
    if tid == "t_c":
        if mode == "missing":
            pass
        elif mode == "null":
            d["parents"] = None
        elif mode == "malformed":
            d["parents"] = "t_p"
        elif mode == "drift":
            d["parents"] = ["t_other"]
        else:
            d["parents"] = parents
    else:
        d["parents"] = parents
    print(json.dumps(d))
elif args[0] == "unblock":
    pass
else:
    print("{}")
'''


def graph(pkind, wt):
    p = {"key": f"P:{pkind}", "slug": "p", "kind": pkind, "pr": "P", "title": "parent", "assignee": "nobody",
         "model": None, "provider": None, "parents": [], "max_runtime": "5m", "skills": [], "external": False,
         "body_file": "x", "worktree": None, "branch": None}
    c = {"key": "C:build", "slug": "c", "kind": "build", "pr": "C", "title": "child", "assignee": "nobody",
         "model": None, "provider": None, "parents": [p["key"]], "max_runtime": "5m", "skills": [], "external": False,
         "body_file": "x", "worktree": wt, "branch": "beta/c" if wt else None}
    return {"cards": [p, c]}


# name: dict(mode, pkind, pstatus, presult, wt, pre, args, rc, unblocked, wt_exists, branch_ok, ref_gone, out, err)
CASES = {
    "ok": dict(rc=0, unblocked=True),
    "missing": dict(mode="missing", rc=3, unblocked=False),
    "null": dict(mode="null", rc=3, unblocked=False),
    "malformed": dict(mode="malformed", rc=3, unblocked=False),
    "drift": dict(mode="drift", rc=3, unblocked=False),
    "open-parent": dict(mode="open-parent", rc=0, unblocked=False),
    "wt-create": dict(wt=True, rc=0, unblocked=True, wt_exists=True, branch_ok=True),
    "wt-fail": dict(wt=True, pre="block", rc=1, unblocked=False, wt_exists=False, err=["C:build t_c", "worktree creation failed"]),
    "wt-branch": dict(wt=True, pre="branch", rc=0, unblocked=True, wt_exists=True, branch_ok=True),
    "wt-dotgit": dict(wt=True, pre="dotgit", rc=0, unblocked=True, wt_exists=True, branch_ok=True),
    "wt-orphan-ref": dict(wt=True, pre="block", rc=1, unblocked=False, wt_exists=False, ref_gone=True,
                          err=["C:build t_c", "worktree creation failed"]),
    "wt-wrong-branch": dict(wt=True, pre="otherbranch", rc=1, unblocked=False, wt_exists=True,
                            err=["C:build t_c", "/wt/c", "beta/other"]),
    "open-parent-wt": dict(mode="open-parent", wt=True, rc=0, unblocked=False, wt_exists=False),
    "verify-fix": dict(pkind="verify", presult="FIX AUD-REDUCTION", wt=True, rc=0, unblocked=False, wt_exists=False,
                       out=["FIX AUD-REDUCTION"]),
    "verify-ship": dict(pkind="verify", presult="SHIP PR-02 abc1234", wt=True, rc=0, unblocked=True, wt_exists=True),
    "verify-none": dict(pkind="verify", presult=None, wt=True, rc=0, unblocked=False, wt_exists=False),
    "decision-fix": dict(pkind="decision", presult="FIX AUD-REDUCTION", wt=True, rc=0, unblocked=False, wt_exists=False),
    "decision-ok": dict(pkind="decision", presult="icm/05-build/AUTH-DECISION.md: verdict Better Auth", wt=True,
                        rc=0, unblocked=True, wt_exists=True),
    "dry-wt": dict(wt=True, args=["--release", "--dry-run"], rc=0, unblocked=False, wt_exists=False,
                   out=["would create worktree", "/wt/c on beta/c from origin/Vari8-Beta"]),
    "dry-fix": dict(pkind="verify", presult="FIX AUD-REDUCTION", wt=True, args=["--release", "--dry-run"], rc=0,
                    unblocked=False, wt_exists=False, out=["rejected parent", "FIX AUD-REDUCTION"]),
}


def git(*a, cwd=None):
    return subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def make_origin(tmp):
    seed, origin = os.path.join(tmp, "seed"), os.path.join(tmp, "origin.git")
    git("init", "-q", "-b", "Vari8-Beta", seed)
    git("-c", "user.name=selftest", "-c", "user.email=selftest@example.invalid", "commit", "-q",
        "--allow-empty", "-m", "seed", cwd=seed)
    git("init", "-q", "--bare", origin)
    git("symbolic-ref", "HEAD", "refs/heads/Vari8-Beta", cwd=origin)
    git("push", "-q", origin, "Vari8-Beta", cwd=seed)
    return origin


def main():
    tmp = tempfile.mkdtemp(prefix="board-selftest-", dir=os.environ.get("TMPDIR"))
    slug = f"vari8-test-{secrets.token_hex(3)}"
    bindir = os.path.join(tmp, "bin")
    os.makedirs(bindir)
    stub = os.path.join(bindir, "hermes")
    open(stub, "w").write(STUB)
    os.chmod(stub, 0o755)
    origin = make_origin(tmp)
    failed = 0
    try:
        for name, case in CASES.items():
            d = os.path.join(tmp, name)
            os.makedirs(d)
            work = os.path.join(d, "work")
            git("clone", "-q", origin, work)
            wt = os.path.join(d, "wt", "c") if case.get("wt") else None
            pkind = case.get("pkind", "build")
            g = graph(pkind, wt)
            graph_file, ids_file, log = (os.path.join(d, n) for n in ("graph.json", "ids.tsv", "calls.log"))
            json.dump(g, open(graph_file, "w"))
            open(ids_file, "w").write(f"key\ttask_id\tslug\nP:{pkind}\tt_p\tp\nC:build\tt_c\tc\n")
            pre = case.get("pre")
            if pre == "block":
                os.makedirs(wt)
                open(os.path.join(wt, "junk.txt"), "w").write("not a worktree\n")
            elif pre == "branch":
                git("branch", "beta/c", "origin/Vari8-Beta", cwd=work)
            elif pre == "dotgit":
                os.makedirs(os.path.dirname(wt), exist_ok=True)
                git("worktree", "add", "-q", "-b", "beta/c", wt, "origin/Vari8-Beta", cwd=work)
            elif pre == "otherbranch":
                os.makedirs(os.path.dirname(wt), exist_ok=True)
                git("worktree", "add", "-q", "-b", "beta/other", wt, "origin/Vari8-Beta", cwd=work)
            env = dict(os.environ, PATH=bindir + os.pathsep + os.environ["PATH"], STUB_MODE=case.get("mode", "ok"),
                       STUB_LOG=log, STUB_P_STATUS="done", STUB_P_RESULT=case.get("presult") or "",
                       BOARD_SLUG=slug, BOARD_GRAPH=graph_file, BOARD_IDS=ids_file, BOARD_REPO=work,
                       BOARD_BASE="origin/Vari8-Beta")
            r = subprocess.run([sys.executable, BOARD_PY, *case.get("args", ["--release"])], env=env,
                               capture_output=True, text=True)
            calls = open(log).read().splitlines() if os.path.exists(log) else []
            unblocked = any(c.startswith("unblock") for c in calls)
            problems = []
            if r.returncode != case["rc"]:
                problems.append(f"exit {r.returncode}, want {case['rc']}")
            if unblocked != case["unblocked"]:
                problems.append(f"unblock called {unblocked}, want {case['unblocked']}")
            if "wt_exists" in case and os.path.exists(os.path.join(wt, ".git")) != case["wt_exists"]:
                problems.append(f"worktree .git present {not case['wt_exists']}, want {case['wt_exists']}")
            if case.get("branch_ok") and os.path.exists(os.path.join(wt, ".git")):
                head = git("rev-parse", "--abbrev-ref", "HEAD", cwd=wt)
                if head != "beta/c":
                    problems.append(f"worktree HEAD {head!r}, want 'beta/c'")
            elif case.get("branch_ok"):
                problems.append("no worktree created")
            if case.get("ref_gone"):
                rc = subprocess.run(["git", "-C", work, "show-ref", "--verify", "--quiet",
                                     "refs/heads/beta/c"]).returncode
                if rc == 0:
                    problems.append("orphan ref refs/heads/beta/c left behind")
            text = r.stdout + r.stderr
            for want in case.get("out", []):
                if want not in text:
                    problems.append(f"output lacks {want!r}")
            for want in case.get("err", []):
                if want not in r.stderr:
                    problems.append(f"stderr lacks {want!r}")
            ok = not problems
            failed += not ok
            print(f"{'PASS' if ok else 'FAIL'} {name}: exit {r.returncode}, unblock {unblocked}"
                  + ("" if ok else f" | {'; '.join(problems)}\n  stdout: {r.stdout.strip()}\n  stderr: {r.stderr.strip()}"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"board_selftest: {len(CASES) - failed}/{len(CASES)} cases pass (stub board {slug}, hermes stubbed)")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
