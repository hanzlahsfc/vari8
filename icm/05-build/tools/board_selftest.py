#!/usr/bin/env python3
"""Self-test for board.py --release. Runs against a stub `hermes` on PATH; no real board is touched.

Cases (each runs board.py --release on a two-card graph: parent P done, child C blocked):
  ok              show --json returns the right parents        -> exit 0, C unblocked
  missing         show --json has no `parents` key             -> exit 3, nothing unblocked
  null            `parents` is null                            -> exit 3, nothing unblocked
  malformed       `parents` is a string                        -> exit 3, nothing unblocked
  drift           `parents` differs from graph.json            -> exit 3, nothing unblocked
  open-parent     P still running                              -> exit 0, nothing unblocked
Exit 0 only when every case behaves as listed.
"""
import json
import os
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
status = {"t_p": "running" if mode == "open-parent" else "done", "t_c": "blocked"}
if any(l.startswith("unblock") for l in open(log).read().splitlines()):
    status["t_c"] = "ready"
if args[0] == "list":
    print(json.dumps([{"id": k, "status": v} for k, v in status.items()]))
elif args[0] == "show":
    tid = args[1]
    d = {"task": {"id": tid, "status": status[tid]}}
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

GRAPH = {"cards": [
    {"key": "P:build", "slug": "p", "kind": "build", "pr": "P", "title": "parent", "assignee": "nobody", "model": None,
     "provider": None, "parents": [], "max_runtime": "5m", "skills": [], "external": False, "body_file": "x", "worktree": None, "branch": None},
    {"key": "C:build", "slug": "c", "kind": "build", "pr": "C", "title": "child", "assignee": "nobody", "model": None,
     "provider": None, "parents": ["P:build"], "max_runtime": "5m", "skills": [], "external": False, "body_file": "x", "worktree": None, "branch": None},
]}

CASES = {"ok": (0, True), "missing": (3, False), "null": (3, False), "malformed": (3, False), "drift": (3, False), "open-parent": (0, False)}


def main():
    tmp = tempfile.mkdtemp(prefix="board-selftest-", dir=os.environ.get("TMPDIR"))
    bindir = os.path.join(tmp, "bin")
    os.makedirs(bindir)
    stub = os.path.join(bindir, "hermes")
    open(stub, "w").write(STUB)
    os.chmod(stub, 0o755)
    graph = os.path.join(tmp, "graph.json")
    json.dump(GRAPH, open(graph, "w"))
    ids = os.path.join(tmp, "ids.tsv")
    open(ids, "w").write("key\ttask_id\tslug\nP:build\tt_p\tp\nC:build\tt_c\tc\n")
    failed = 0
    for mode, (want_rc, want_unblock) in CASES.items():
        log = os.path.join(tmp, f"{mode}.log")
        env = dict(os.environ, PATH=bindir + os.pathsep + os.environ["PATH"], STUB_MODE=mode, STUB_LOG=log,
                   BOARD_SLUG="selftest-stub", BOARD_GRAPH=graph, BOARD_IDS=ids)
        r = subprocess.run([sys.executable, BOARD_PY, "--release"], env=env, capture_output=True, text=True)
        calls = open(log).read().splitlines() if os.path.exists(log) else []
        unblocked = any(c.startswith("unblock") for c in calls)
        ok = r.returncode == want_rc and unblocked == want_unblock
        failed += not ok
        print(f"{'PASS' if ok else 'FAIL'} {mode}: exit {r.returncode} (want {want_rc}), unblock called {unblocked} (want {want_unblock})"
              + ("" if ok else f"\n  stdout: {r.stdout.strip()}\n  stderr: {r.stderr.strip()}"))
    print(f"board_selftest: {len(CASES) - failed}/{len(CASES)} cases pass")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
