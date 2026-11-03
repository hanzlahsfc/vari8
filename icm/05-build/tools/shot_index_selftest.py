#!/usr/bin/env python3
"""Self-test for the program generator's shot-index boundary (P736).

Runs the real `program.py` (and, for the check case, `generate.py --check`) — no stubs, no
re-implementation. Mutation cases copy program.py's real inputs into a throwaway PROGRAM_ROOT
and rewrite `icm/04-briefing/shots/index.json` there; the repo tree is never touched.

Cases:
  ok                 committed index -> program.py exit 0, ledger has exactly 35 screen rows,
                     both supplemental parity shots classified (never ledger rows)
  check              `generate.py --check` on the repo -> exit 0, generated files match the tree
                     (needs the pinned prettier: $PRETTIER or node_modules/.bin/prettier)
  missing-surface    a briefing screen loses all briefing metadata -> exit 1, names the file
                     and says it is not a registered supplemental parity shot
  unclassified-extra a new recipe-only shot is appended -> exit 1, names the file (cannot
                     silently disappear from briefing coverage)
  partial-metadata   a briefing entry loses one briefing field -> exit 1, "partial briefing metadata"
  malformed-metadata a briefing entry carries a bad surface id -> exit 1, "malformed briefing metadata"
  malformed-recipe   an entry loses its clicks list -> exit 1, "malformed capture recipe"
  duplicate          a briefing file appears twice -> exit 1, "duplicate entry"
  nonobject          a non-dict is appended -> exit 1, "not an object"
  supplemental-grows a supplemental shot gains briefing metadata -> exit 1 via the
                     "screens N != 35" hard gate (membership cannot grow silently)
Exit 0 only when every case behaves as listed.
"""
import csv
import json
import os
import shutil
import subprocess
import sys
import tempfile

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(TOOLS, "..", "..", ".."))
PROGRAM = os.path.join(TOOLS, "program.py")
GENERATE = os.path.join(TOOLS, "generate.py")

# program.py's read inputs, relative to PROGRAM_ROOT.
INPUTS = ["icm/05-build/program-config.json",
          "icm/04-briefing/shots/index.json",
          "icm/02-gap-matrix/output/GAP-MATRIX.md",
          "icm/05-build/audits/PRODREADY-BASELINE.md",
          "icm/03-plan/output/TEST-AUDIT.md"]

INDEX = "icm/04-briefing/shots/index.json"
SUPPLEMENTAL = {"s12-activity-targets.png", "s13-supplements.png"}
failures = []


def check(name, cond, detail):
    print(f"{'ok  ' if cond else 'FAIL'} {name}: {detail}")
    if not cond:
        failures.append(f"{name} ({detail})")


def make_root(mutate=None):
    """Copy program.py's real inputs into a temp root; mutate the copied index per case."""
    root = tempfile.mkdtemp(prefix="shot-index-selftest-")
    for rel in INPUTS:
        dst = os.path.join(root, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(os.path.join(ROOT, rel), dst)
    if mutate:
        idx_path = os.path.join(root, INDEX)
        shots = json.load(open(idx_path))["shots"]
        json.dump({"shots": mutate(shots)}, open(idx_path, "w"))
    return root


def run_program(root):
    out = os.path.join(root, "_out")
    env = dict(os.environ, PROGRAM_ROOT=root, PROGRAM_OUT=out)
    r = subprocess.run([sys.executable, PROGRAM], env=env, capture_output=True, text=True)
    return r, out


def expect_fail(name, root, *needles):
    r, _ = run_program(root)
    blob = r.stdout + r.stderr
    check(name, r.returncode != 0, f"exit {r.returncode} (want non-zero)")
    for n in needles:
        check(name, n in blob, f"output names {n!r}")


def case_ok():
    root = make_root()
    r, out = run_program(root)
    check("ok", r.returncode == 0, f"exit {r.returncode}; {r.stderr.strip()[-200:]}")
    rows = [row for row in csv.reader(open(os.path.join(out, "icm/05-build/coverage-ledger.csv")))
            if row and row[0] == "screen"]
    files = {row[1] for row in rows}
    check("ok", len(rows) == 35, f"{len(rows)} screen ledger rows (want 35)")
    check("ok", not files & SUPPLEMENTAL, "no supplemental parity shot is a briefing ledger row")
    check("ok", '"briefing_screens": 35' in r.stdout and '"supplemental_parity_shots": 2' in r.stdout,
          "summary reports 35 briefing + 2 supplemental parity shots")


def case_check():
    r = subprocess.run([sys.executable, GENERATE, "--root", ROOT, "--check"], capture_output=True, text=True)
    check("check", r.returncode == 0, f"generate.py --check exit {r.returncode}; {(r.stdout + r.stderr).strip()[-200:]}")


def case_missing_surface():
    def m(shots):
        for s in shots:
            if s["file"] == "s01-roster.png":
                for k in ("annotated", "surface", "surfaceName", "rowsTotal", "rowsMatched", "matchedRows"):
                    s.pop(k, None)
        return shots
    expect_fail("missing-surface", make_root(m), "s01-roster.png", "not a registered supplemental parity shot")


def case_unclassified_extra():
    def m(shots):
        return shots + [{"file": "s99-extra.png", "screen": "Extra", "route": "/extra", "clicks": ["x"]}]
    expect_fail("unclassified-extra", make_root(m), "s99-extra.png", "not a registered supplemental parity shot")


def case_partial_metadata():
    def m(shots):
        for s in shots:
            if s["file"] == "s02-thread.png":
                s.pop("matchedRows", None)
        return shots
    expect_fail("partial-metadata", make_root(m), "s02-thread.png", "partial briefing metadata")


def case_malformed_metadata():
    def m(shots):
        for s in shots:
            if s["file"] == "s03-add-extra.png":
                s["surface"] = "bogus"
        return shots
    expect_fail("malformed-metadata", make_root(m), "s03-add-extra.png", "malformed briefing metadata")


def case_malformed_recipe():
    def m(shots):
        for s in shots:
            if s["file"] == "s13-supplements.png":
                s.pop("clicks", None)
        return shots
    expect_fail("malformed-recipe", make_root(m), "s13-supplements.png", "malformed capture recipe")


def case_duplicate():
    def m(shots):
        twin = dict(shots[0])
        return shots + [twin]
    expect_fail("duplicate", make_root(m), "duplicate entry", "s01-roster.png")


def case_nonobject():
    expect_fail("nonobject", make_root(lambda shots: shots + ["not-a-dict"]), "not an object")


def case_supplemental_grows():
    def m(shots):
        for s in shots:
            if s["file"] == "s12-activity-targets.png":
                s.update(annotated="s12-activity-targets-annotated.png", surface="S12",
                         surfaceName="Activity targets", rowsTotal=0, rowsMatched=0, matchedRows=[])
        return shots
    r, _ = run_program(make_root(m))
    check("supplemental-grows", r.returncode != 0, f"exit {r.returncode} (want non-zero)")
    check("supplemental-grows", "screens 36 != 35" in r.stdout, "hard gate 'screens 36 != 35' reported")


if __name__ == "__main__":
    for case in (case_ok, case_check, case_missing_surface, case_unclassified_extra, case_partial_metadata,
                 case_malformed_metadata, case_malformed_recipe, case_duplicate, case_nonobject,
                 case_supplemental_grows):
        case()
    sys.exit(1 if failures else print(f"shot index selftest: all cases pass"))
