#!/usr/bin/env python3
"""Run the whole program generator: program.py, plan_v2.py, program_md.py, then prettier.

Usage:
  generate.py [--root DIR]            regenerate in place below DIR (default: the repo this file is in)
  generate.py [--root DIR] --check    generate into a temp dir, compare with the committed files below DIR,
                                      exit 1 and name every file that differs, is missing or is stale
  generate.py --raw-out DIR           generate without prettier into DIR (reconciliation aid)

The repo root comes from this file's location (`Path(__file__).resolve()`) unless --root is given.
Prettier must be the version pinned in package-lock.json; the binary is $PRETTIER, else
`<root>/node_modules/.bin/prettier`, else `prettier` from icm/05-build/program-config.json.
Exit codes: 0 ok, 1 check found differences or a generator gate failed, 2 setup error.
"""
import argparse
import filecmp
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
SCRIPTS = ["program.py", "plan_v2.py", "program_md.py"]
# Generated files outside cards/ (paths relative to the root). Cards come from cards/.generated.
FIXED = ["icm/05-build/graph.json", "icm/05-build/graph-summary.json", "icm/05-build/coverage-ledger.csv",
         "icm/05-build/timeline.md", "icm/05-build/POST-BETA-INFRA.md", "icm/05-build/PROGRAM.md",
         "icm/03-plan/output/PLAN.md", "icm/05-build/cards/.generated"]


def die(msg, code=2):
    sys.stderr.write(f"generate.py: {msg}\n")
    sys.exit(code)


def prettier_bin(root):
    cfg = json.load(open(root / "icm/05-build/program-config.json"))
    for cand in (os.environ.get("PRETTIER"), str(root / "node_modules/.bin/prettier"), cfg.get("prettier")):
        if cand and os.path.exists(cand):
            return cand
    die("no prettier found ($PRETTIER, node_modules/.bin/prettier or program-config.json `prettier`)")


def pinned_prettier(root):
    lock = json.load(open(root / "package-lock.json"))
    return lock["packages"]["node_modules/prettier"]["version"]


def generated_files(out):
    cards = (out / "icm/05-build/cards/.generated").read_text().split()
    return FIXED + [f"icm/05-build/cards/{c}" for c in cards]


def run_generator(root, out, fmt=True):
    env = dict(os.environ, PROGRAM_ROOT=str(root), PROGRAM_OUT=str(out))
    (out / "icm/05-build/cards").mkdir(parents=True, exist_ok=True)
    (out / "icm/03-plan/output").mkdir(parents=True, exist_ok=True)
    logs = []
    for s in SCRIPTS:
        r = subprocess.run([sys.executable, str(TOOLS / s)], env=env, capture_output=True, text=True)
        logs.append(f"== {s} exit {r.returncode}\n{r.stdout[-3000:]}{r.stderr[-3000:]}")
        if r.returncode != 0:
            print("\n".join(logs))
            die(f"{s} exited {r.returncode}", 1)
    if fmt:
        pb = prettier_bin(root)
        ver = subprocess.run([pb, "--version"], capture_output=True, text=True).stdout.strip()
        want = pinned_prettier(root)
        if ver != want:
            die(f"prettier {ver} at {pb}, but package-lock.json pins {want}")
        md = [str(out / f) for f in generated_files(out) if f.endswith(".md")]
        r = subprocess.run([pb, "--config", str(root / ".prettierrc.json"), "--write", "--log-level", "warn", *md],
                           capture_output=True, text=True)
        if r.returncode != 0:
            die(f"prettier failed: {r.stderr[-2000:]}", 1)
    return logs


def check(root):
    tmp = Path(tempfile.mkdtemp(prefix="program-check-", dir=os.environ.get("TMPDIR")))
    try:
        run_generator(root, tmp)
        new = set(generated_files(tmp))
        old_manifest = root / "icm/05-build/cards/.generated"
        old = set(generated_files(root)) if old_manifest.exists() else set()
        bad = []
        for f in sorted(new):
            if not (root / f).exists():
                bad.append(f"missing  {f}")
            elif not filecmp.cmp(tmp / f, root / f, shallow=False):
                bad.append(f"differs  {f}")
        for f in sorted(old - new):
            if (root / f).exists():
                bad.append(f"stale    {f} (committed, no longer generated)")
        if bad:
            print(f"generate.py --check: {len(bad)} file(s) are not the generator's output:")
            print("\n".join(f"  {b}" for b in bad))
            print("Fix: edit program_data.py or the generator, then run icm/05-build/tools/generate.py and commit.")
            return 1
        print(f"generate.py --check: {len(new)} generated files match the committed tree")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(TOOLS.parents[2]))
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--raw-out")
    a = ap.parse_args()
    root = Path(a.root).resolve()
    if not (root / "icm/05-build/program-config.json").exists():
        die(f"{root} has no icm/05-build/program-config.json")
    if a.check:
        sys.exit(check(root))
    if a.raw_out:
        run_generator(root, Path(a.raw_out).resolve(), fmt=False)
        print(f"raw output in {a.raw_out}")
        return
    logs = run_generator(root, root)
    print(logs[0][-1500:])
    print(f"generated in place below {root}")


if __name__ == "__main__":
    main()
