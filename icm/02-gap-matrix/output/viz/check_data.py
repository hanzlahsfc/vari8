#!/usr/bin/env python3
"""Assert viz/matrix.json reconciles with GAP-MATRIX.md. Exit 0 on pass, 1 on fail."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent  # icm/02-gap-matrix
SRC = ROOT / "output" / "GAP-MATRIX.md"
DATA = ROOT / "output" / "viz" / "matrix.json"
ORDER = ["WIRED", "UNWIRED", "UNCONFIGURED", "PARTIAL", "MISSING", "CONFLICT", "ROLES"]

fails = []


def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        fails.append(msg)


def summary_table():
    """Re-parse the summary table independently of extract.py."""
    lines = SRC.read_text(encoding="utf-8").splitlines()
    on, out = False, {}
    for ln in lines:
        if on and ln.startswith("## "):
            break
        if ln.startswith("## Summary by surface"):
            on = True
            continue
        if not on or not ln.strip().startswith("|"):
            continue
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if len(cells) < 9:
            continue
        name = cells[0].replace("*", "")
        if name in ("Surface", ""):
            continue
        try:
            nums = [int(x) for x in cells[1:9]]
        except ValueError:
            continue
        out[name] = dict(zip(ORDER, nums[:7]), total=nums[7])
    return out


def main():
    d = json.loads(DATA.read_text(encoding="utf-8"))
    rows, tbl = d["rows"], summary_table()
    check(len(rows) == 338, f"338 rows (got {len(rows)})")
    check(len({r["id"] for r in rows}) == len(rows), "every row id unique")

    st = d["statuses"]  # 6 statuses; WIRED is 0 and not carried
    check(all(exp["WIRED"] == 0 for exp in tbl.values()), "WIRED is 0 in every summary row")

    for name, exp in tbl.items():
        if name == "Total":
            continue
        key = "ROLES" if name.startswith("ROLES decision") else name
        got = d["summary"].get(key)
        ok = got is not None and all(got[s] == exp[s] for s in st) and got["total"] == exp["total"]
        check(ok, f"surface {key} counts == summary table {dict(exp)} got {got}")

    tot = tbl["Total"]
    check(all(d["totals"][s] == tot[s] for s in st) and d["totals"]["total"] == tot["total"],
          f"totals == summary Total {tot}")

    for s in st:
        n = sum(1 for r in rows if r["status"] == s)
        check(n == d["totals"][s], f"status {s} recount {n} == total {d['totals'][s]}")

    bad = [r["id"] for r in rows if r["status"] in ("CONFLICT", "ROLES") and not r["decision"]]
    check(not bad, f"every CONFLICT and ROLES row has a decision (missing: {bad})")

    nconf = sum(1 for r in rows if r["status"] == "CONFLICT")
    nroles = sum(1 for r in rows if r["status"] == "ROLES")
    check(len(d["conflicts"]) == nconf, f"conflicts array {len(d['conflicts'])} == {nconf} CONFLICT rows")
    check(len(d["roles"]) == nroles, f"roles array {len(d['roles'])} == {nroles} ROLES rows")
    check({c["id"] for c in d["conflicts"]} == {r["id"] for r in rows if r["status"] == "CONFLICT"},
          "conflict ids match CONFLICT rows")
    check({c["id"] for c in d["roles"]} == {r["id"] for r in rows if r["status"] == "ROLES"},
          "role ids match ROLES rows")

    o = d["orphans"]
    check(o["count"] == len(o["items"]) == 82, f"orphans 82 (count={o['count']}, items={len(o['items'])})")

    dl = d["delta"]
    check(dl["before"] + dl["round3_added"] - dl["parked"] == dl["after"] == len(rows),
          f"delta {dl['before']}+{dl['round3_added']}-{dl['parked']} == after == rows")

    check({s["id"] for s in d["surfaces"]} == set(d["summary"]),
          "surfaces ids == summary keys")

    print(f"\n{len(fails)} failure(s)")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())

