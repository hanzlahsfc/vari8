#!/usr/bin/env python3
"""VZ-DATA: parse GAP-MATRIX.md into viz/matrix.json. Stdlib only, no hand edits."""
import json
import re
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent  # icm/02-gap-matrix
SRC = ROOT / "output" / "GAP-MATRIX.md"
F1 = ROOT / "F1-card.md"
OUT = ROOT / "output" / "viz" / "matrix.json"
SOURCE_REL = "icm/02-gap-matrix/output/GAP-MATRIX.md"
STATUS_ORDER = ["UNWIRED", "UNCONFIGURED", "PARTIAL", "MISSING", "CONFLICT", "ROLES"]


def cells_of(line):
    s = line.strip()
    if not s.startswith("|") or not s.endswith("|"):
        return None
    parts = [c.strip() for c in s[1:-1].split(" | ")]
    if len(parts) == 1 and re.fullmatch(r"[-: |]+", parts[0]):
        return None
    return parts


def section(lines, header):
    """Lines after the line starting with `header`, up to the next '## '."""
    out, on = [], False
    for ln in lines:
        if on and (ln.startswith("## ") or ln.startswith("### ")):
            break
        if ln.startswith(header):
            on = True
            continue
        if on:
            out.append(ln)
    return out


def surface_names():
    names = {}
    for ln in F1.read_text(encoding="utf-8").splitlines():
        c = cells_of(ln)
        if c and re.fullmatch(r"S\d\d", c[0]) and len(c) >= 2:
            names[c[0]] = c[1]
    return names


def parse_rows(lines):
    rows, na = [], 0
    surface_ids = [f"S{i:02d}" for i in range(1, 12)]
    for sid in surface_ids:
        for ln in section(lines, f"### {sid} surface"):
            c = cells_of(ln)
            if not c or len(c) < 4 or c[0] == "Row":
                continue
            rid, status, element, detail = c[0], c[1], c[2], c[3]
            if status == "N/A":
                na += 1
                continue
            rows.append({
                "id": rid,
                "surface": sid,
                "status": status,
                "element": element,
                "detail": detail.strip("`"),
                "round3": rid.startswith("R3-"),
                "decision": None,
            })
    return rows, na, surface_ids


def parse_conflicts(lines):
    out = []
    for ln in section(lines, "## CONFLICT rows"):
        c = cells_of(ln)
        if not c or c[0] == "Row":
            continue
        out.append({"id": c[0], "decision": c[2], "note": c[3]})
    return out


def parse_roles(lines, rows):
    out = []
    for ln in section(lines, "## ROLES decision rows"):
        c = cells_of(ln)
        if not c or c[0] == "Row":
            continue
        rid, surface, old_status, basis, cell = c[0], c[1], c[2], c[3], c[4]
        basis_cites = re.findall(r"`([^`]+)`", basis)
        code = [x for x in basis_cites if "authorization-model.md" not in x]
        if not code:
            code = [x for x in re.findall(r"`([^`]+)`", cell)
                    if "authorization-model.md" not in x]
        m = re.search(r"docs/security/authorization-model\.md[^`]*`?\s*(\([^)]*\))?", basis)
        doc_rule = m.group(0).replace("`", "").strip() if m else ""
        out.append({"id": rid, "doc_rule": doc_rule, "code_rule": "; ".join(code)})
        if surface == "ROLES decision (round 3)":
            rows.append({
                "id": rid, "surface": "ROLES", "status": "ROLES",
                "element": cell, "detail": old_status,
                "round3": rid.startswith("R3-"), "decision": "D10",
            })
    return out


def parse_parked(lines):
    out = []
    for ln in section(lines, "## Parked:"):
        c = cells_of(ln)
        if not c or c[0] == "Id":
            continue
        out.append({"id": c[0], "old_status": c[1], "note": c[2]})
    return out


def parse_orphans(lines):
    items = []
    for ln in section(lines, "## ORPHANS"):
        ln = ln.strip()
        if not ln.startswith("- "):
            continue
        m = re.match(r"([A-Za-z0-9\-]+)\s+(.*)$", ln[2:])
        if m:
            items.append({"id": m.group(1), "note": m.group(2)})
    return items


def build():
    lines = SRC.read_text(encoding="utf-8").splitlines()
    rows, na, surface_ids = parse_rows(lines)
    conflicts = parse_conflicts(lines)
    roles = parse_roles(lines, rows)
    parked = parse_parked(lines)
    orphan_items = parse_orphans(lines)

    by_id = {c["id"]: c for c in conflicts}
    for r in rows:
        if r["status"] == "CONFLICT":
            r["decision"] = by_id.get(r["id"], {}).get("decision")
        elif r["status"] == "ROLES" and not r["decision"]:
            r["decision"] = "D10"

    names = surface_names()
    surfaces = [{"id": s, "name": names.get(s, s)} for s in surface_ids]
    surfaces.append({"id": "ROLES", "name": "ROLES decision (round 3)"})

    summary = {}
    for s in surfaces:
        d = {st: 0 for st in STATUS_ORDER}
        for r in rows:
            if r["surface"] == s["id"]:
                d[r["status"]] += 1
        d["total"] = sum(d[st] for st in STATUS_ORDER)
        summary[s["id"]] = d

    totals = {st: sum(summary[s["id"]][st] for s in surfaces) for st in STATUS_ORDER}
    totals["total"] = len(rows)

    return {
        "source": SOURCE_REL,
        "generated": date.today().isoformat(),
        "statuses": STATUS_ORDER,
        "surfaces": surfaces,
        "summary": summary,
        "totals": totals,
        "rows": rows,
        "conflicts": conflicts,
        "roles": roles,
        "parked": parked,
        "orphans": {"count": len(orphan_items), "items": orphan_items},
        "delta": {"before": 323, "round3_added": 19, "parked": 4, "after": len(rows)},
    }, na


def main():
    data, na = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")
    print(f"rows={len(data['rows'])} na_excluded={na} conflicts={len(data['conflicts'])} "
          f"roles={len(data['roles'])} parked={len(data['parked'])} orphans={data['orphans']['count']}")
    print("totals=" + json.dumps(data["totals"]))
    for s in data["surfaces"]:
        d = data["summary"][s["id"]]
        print(f"  {s['id']}: " + " ".join(f"{k}={d[k]}" for k in STATUS_ORDER + ["total"]))


if __name__ == "__main__":
    sys.exit(main())



