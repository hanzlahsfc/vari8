#!/usr/bin/env python3
"""Self-test for the program generator's shot-index boundary (P736/P738).

Runs the real `program.py` (and, for the check case, `generate.py --check`) — no stubs, no
re-implementation. Mutation cases copy program.py's real inputs into a TemporaryDirectory
PROGRAM_ROOT and rewrite `icm/04-briefing/shots/index.json` there; the repo tree is never
touched. Every scratch path this invocation creates — shot roots and the sentinel
fixture alike — is recorded as OWNED, removed in finally blocks on success, failure and
exception paths, and accounted by `no-leftovers`. Paths already in TMPDIR before the run
(`PREEXISTING`, e.g. sentinels left by other runs) are asserted still present, never
inspected for removal and never deleted.

Cases:
  ok                 committed index -> program.py exit 0, ledger rows are exactly the
                     established 35-file briefing set, both supplemental parity shots
                     classified (never ledger rows), index still holds all 37 recipes
  check              `generate.py --check` on the repo -> exit 0, generated files match the tree
                     (needs the pinned prettier: $PRETTIER or node_modules/.bin/prettier)
  missing-surface    a briefing screen loses all briefing metadata -> exit 1, names the file
                     and says it is not a registered supplemental parity shot
  unclassified-extra a new recipe-only shot is appended -> exit 1, names the file (cannot
                     silently disappear from briefing coverage)
  swap               a briefing file is renamed (remove-one/add-one) -> exit 1 via the
                     unmapped-ledger gate (exact membership cannot drift)
  partial-metadata   a briefing entry loses one briefing field -> exit 1, "partial briefing metadata"
  malformed-metadata a briefing entry carries a bad surface string -> exit 1
  surface-range      surface "S99" -> exit 1, surface must be S01-S11
  annotated-type     annotated=123 -> exit 1, annotated must be a string or null
  rows-bool          rowsTotal=True -> exit 1, row counts are non-negative ints (bool rejected)
  rows-negative      rowsMatched=-1 -> exit 1
  malformed-recipe   an entry loses its clicks list -> exit 1, "malformed capture recipe"
  duplicate          a briefing file appears twice -> exit 1, "duplicate entry"
  nonobject          a non-dict is appended -> exit 1, "not an object"
  supplemental-grows a supplemental shot gains valid briefing metadata -> exit 1 via the
                     "screens 36 != 35" hard gate (membership cannot grow silently)
  unrelated-survives a unique self-created sentinel fixture (shot-index-selftest-unrelated-*)
                     survives while other owned roots run and clean, then is removed in
                     finally and accounted
  sentinel-error     an exception while a sentinel fixture exists still removes it
  external-survives  shot-index-selftest-* dirs pre-existing this invocation remain untouched
  cleanup-on-error   an exception inside a scratch root still removes it
  retained-owned     an intentionally retained OWNED root is detected by the leftover scan,
                     then cleaned and accounted
  no-leftovers       last: every scratch path OWNED by this invocation is gone
Exit 0 only when every case behaves as listed.
"""
import contextlib
import csv
import glob
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
# The established briefing membership (program contract: 35 screens). Exact set, not a count.
EXPECTED_BRIEFING = frozenset((
    "s01-roster.png", "s01-profile-overview.png", "s01-profile-plans.png", "s01-profile-checkins.png",
    "s01-profile-notes.png", "s01-profile-onboarding.png", "s02-messages.png", "s02-thread.png",
    "s02-thread-attachments.png", "s02-notes-todos.png", "s03-checkins-board.png", "s03-add-extra.png",
    "s03-checkin-review.png", "s04-habit-editor.png", "s04-template-habits.png", "s05-templates.png",
    "s05-template-editor.png", "s05-tracker-setup.png", "s05-client-setup.png", "s06-mealplan-editor.png",
    "s06-template-nutrition.png", "s07-training-editor.png", "s07-exercise-library.png", "s08-builder.webp",
    "s08-widget-gallery.png", "s08-template-dashboard.png", "s09-tracker-today.png", "s09-tracker-week.png",
    "s09-tracker-trends.png", "s09-tracker-config.png", "s10-appearance.png", "s10-clients-studio.png",
    "s10-mealplan-studio.png", "s11-preferences.png", "s11-client-preview.png"))
failures = []
OWNED = []  # every scratch path created by this invocation; no-leftovers asserts all are gone
PREEXISTING = []  # shot-index-selftest-* dirs present before this invocation created anything


def leftover_owned():
    return [p for p in OWNED if os.path.exists(p)]


def check(name, cond, detail):
    print(f"{'ok  ' if cond else 'FAIL'} {name}: {detail}")
    if not cond:
        failures.append(f"{name} ({detail})")


@contextlib.contextmanager
def shot_root(mutate=None):
    """Copy program.py's real inputs into a TemporaryDirectory root; mutate the copied index
    per case. The scratch root is removed when the block exits on any path."""
    with tempfile.TemporaryDirectory(prefix="shot-index-selftest-") as root:
        OWNED.append(root)
        for rel in INPUTS:
            dst = os.path.join(root, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(os.path.join(ROOT, rel), dst)
        if mutate:
            idx_path = os.path.join(root, INDEX)
            shots = json.load(open(idx_path))["shots"]
            json.dump({"shots": mutate(shots)}, open(idx_path, "w"))
        yield root


def run_program(root):
    out = os.path.join(root, "_out")
    env = dict(os.environ, PROGRAM_ROOT=root, PROGRAM_OUT=out)
    r = subprocess.run([sys.executable, PROGRAM], env=env, capture_output=True, text=True)
    return r, out


def mutate_one(filename, **changes):
    def m(shots):
        for s in shots:
            if s["file"] == filename:
                for k, v in changes.items():
                    if v is ...:
                        s.pop(k, None)
                    else:
                        s[k] = v
        return shots
    return m


def expect_fail(name, mutate, *needles):
    with shot_root(mutate) as root:
        r, _ = run_program(root)
    blob = r.stdout + r.stderr
    check(name, r.returncode != 0, f"exit {r.returncode} (want non-zero)")
    for n in needles:
        check(name, n in blob, f"output names {n!r}")


def case_ok():
    with shot_root() as root:
        r, out = run_program(root)
        check("ok", r.returncode == 0, f"exit {r.returncode}; {r.stderr.strip()[-200:]}")
        rows = [row for row in csv.reader(open(os.path.join(out, "icm/05-build/coverage-ledger.csv")))
                if row and row[0] == "screen"]
        files = {row[1] for row in rows}
        index = json.load(open(os.path.join(root, INDEX)))["shots"]
    check("ok", files == EXPECTED_BRIEFING,
          f"exact 35-file briefing set ({len(files)} rows; extra {sorted(files - EXPECTED_BRIEFING)}, "
          f"missing {sorted(EXPECTED_BRIEFING - files)})")
    check("ok", '"briefing_screens": 35' in r.stdout and '"supplemental_parity_shots": 2' in r.stdout,
          "summary reports 35 briefing + 2 supplemental parity shots")
    check("ok", len(index) == 37 and SUPPLEMENTAL <= {s["file"] for s in index},
          "index preserves all 37 recipes including both supplemental shots")
    check("ok", all(all(isinstance(s.get(k), t) for k, t in (("screen", str), ("route", str), ("clicks", list)))
                    for s in index if s["file"] in SUPPLEMENTAL),
          "both supplemental recipes keep screen/route/clicks")


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
    expect_fail("missing-surface", m, "s01-roster.png", "not a registered supplemental parity shot")


def case_unclassified_extra():
    def m(shots):
        return shots + [{"file": "s99-extra.png", "screen": "Extra", "route": "/extra", "clicks": ["x"]}]
    expect_fail("unclassified-extra", m, "s99-extra.png", "not a registered supplemental parity shot")


def case_swap():
    def m(shots):
        for s in shots:
            if s["file"] == "s04-habit-editor.png":
                s["file"] = "s99-swapped.png"
        return shots
    expect_fail("swap", m, "s99-swapped.png", "ledger unmapped")


def case_partial_metadata():
    expect_fail("partial-metadata", mutate_one("s02-thread.png", matchedRows=...),
                "s02-thread.png", "partial briefing metadata")


def case_malformed_metadata():
    expect_fail("malformed-metadata", mutate_one("s03-add-extra.png", surface="bogus"),
                "s03-add-extra.png", "malformed briefing metadata")


def case_surface_range():
    expect_fail("surface-range", mutate_one("s04-template-habits.png", surface="S99"),
                "s04-template-habits.png", "surface not in S01-S11")


def case_annotated_type():
    expect_fail("annotated-type", mutate_one("s05-templates.png", annotated=123),
                "s05-templates.png", "annotated must be a string or null")


def case_rows_bool():
    expect_fail("rows-bool", mutate_one("s06-mealplan-editor.png", rowsTotal=True),
                "s06-mealplan-editor.png", "rowsTotal must be a non-negative integer")


def case_rows_negative():
    expect_fail("rows-negative", mutate_one("s07-training-editor.png", rowsMatched=-1),
                "s07-training-editor.png", "rowsMatched must be a non-negative integer")


def case_malformed_recipe():
    expect_fail("malformed-recipe", mutate_one("s13-supplements.png", clicks=...),
                "s13-supplements.png", "malformed capture recipe")


def case_duplicate():
    expect_fail("duplicate", lambda shots: shots + [dict(shots[0])], "duplicate entry", "s01-roster.png")


def case_nonobject():
    expect_fail("nonobject", lambda shots: shots + ["not-a-dict"], "not an object")


def case_supplemental_grows():
    def m(shots):
        for s in shots:
            if s["file"] == "s12-activity-targets.png":
                s.update(annotated="s12-activity-targets-annotated.png", surface="S05",
                         surfaceName="Activity targets", rowsTotal=0, rowsMatched=0, matchedRows=[])
        return shots
    expect_fail("supplemental-grows", m, "screens 36 != 35")


@contextlib.contextmanager
def unrelated_sentinel():
    """Unique test-owned fixture standing in for an external shot-index-selftest-* dir:
    created fresh per use, tracked as OWNED, preserved while the block runs and always
    removed in finally."""
    path = tempfile.mkdtemp(prefix="shot-index-selftest-unrelated-")
    OWNED.append(path)
    try:
        yield path
    finally:
        os.rmdir(path)


def case_unrelated_survives():
    with unrelated_sentinel() as sentinel:
        with shot_root() as root:
            r, _ = run_program(root)
        check("unrelated-survives", os.path.isdir(sentinel) and r.returncode == 0,
              f"sentinel fixture intact while owned root ran (program exit {r.returncode})")
    check("unrelated-survives", not os.path.exists(sentinel),
          "sentinel fixture removed in finally and accounted")


def case_sentinel_error():
    path = None
    try:
        with unrelated_sentinel() as s:
            path = s
            raise RuntimeError("sentinel")
    except RuntimeError:
        pass
    check("sentinel-error", path is not None and not os.path.exists(path),
          f"sentinel fixture removed on the exception path ({path})")


def case_external_survives():
    gone = [p for p in PREEXISTING if not os.path.isdir(p)]
    check("external-survives", gone == [],
          f"{len(PREEXISTING)} pre-existing dirs untouched; removed: {gone[:3]}")


def case_cleanup_on_error():
    path = None
    try:
        with shot_root() as root:
            path = root
            raise RuntimeError("sentinel")
    except RuntimeError:
        pass
    check("cleanup-on-error", path is not None and not os.path.exists(path),
          f"scratch root removed after an exception path ({path})")


def case_retained_owned_detected():
    kept = tempfile.mkdtemp(prefix="shot-index-selftest-kept-")
    OWNED.append(kept)
    try:
        check("retained-owned", kept in leftover_owned(),
              f"intentionally retained owned root {kept} is detected")
    finally:
        os.rmdir(kept)  # stays in OWNED: no-leftovers accounts for it like every owned path


def case_no_leftovers():
    left = leftover_owned()
    check("no-leftovers", left == [], f"{len(left)} owned scratch dirs remain: {left[:3]}")


if __name__ == "__main__":
    PREEXISTING.extend(glob.glob(os.path.join(tempfile.gettempdir(), "shot-index-selftest-*")))
    for case in (case_ok, case_check, case_missing_surface, case_unclassified_extra, case_swap,
                 case_partial_metadata, case_malformed_metadata, case_surface_range, case_annotated_type,
                 case_rows_bool, case_rows_negative, case_malformed_recipe, case_duplicate, case_nonobject,
                 case_supplemental_grows, case_unrelated_survives, case_sentinel_error,
                 case_external_survives, case_cleanup_on_error, case_retained_owned_detected,
                 case_no_leftovers):
        case()
    sys.exit(1 if failures else print("shot index selftest: all cases pass"))
