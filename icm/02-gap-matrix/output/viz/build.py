#!/usr/bin/env python3
"""Build viz/gap-matrix.html from viz/matrix.json and viz/template.html.

Stdlib only. Sections are rendered here, at build time, so the page reads
without JavaScript. Every number in a headline, caption, cell and label is
computed from the data; nothing numeric is typed into the template. The same
JSON is inlined for the filter layer.

Usage:
  python3 build.py                    # matrix.json -> gap-matrix.html
  python3 build.py --data fixture.json --out /tmp/dev.html
"""
import argparse
import html
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATUS_ORDER = ["UNWIRED", "UNCONFIGURED", "PARTIAL", "MISSING", "CONFLICT", "ROLES"]
CODE = {"UNWIRED": "UNW", "UNCONFIGURED": "UNC", "PARTIAL": "PAR",
        "MISSING": "MIS", "CONFLICT": "CON", "ROLES": "ROL"}
# Status hue lives in headers, keys and bar segments only.
FILL = {"UNWIRED": "#2f64c8", "UNCONFIGURED": "#4c8dff", "PARTIAL": "#00c8f0",
        "MISSING": "#9df2ff", "CONFLICT": "#8299b5", "ROLES": "#536680"}
INK, VOID = "#eef6fd", "#0a1120"
BAR_TRACK = 868   # px of the widest track at 1440 (1040 - 104 - 44 - 24)

esc = lambda s: html.escape(str(s or ""), quote=True)


def lum(hex6):
    h = hex6.lstrip("#")
    c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    f = lambda v: (v / 255) / 12.92 if v / 255 <= 0.03928 else ((v / 255 + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def contrast(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def fg_for(bg):
    """Text colour for a filled mark: the readable one, never below 4.5:1."""
    ink, void = contrast(INK, bg), contrast(VOID, bg)
    pick = INK if ink >= void else VOID
    ratio = max(ink, void)
    if ratio < 4.5:  # a fill no text can sit on is a build error, not a style choice
        raise SystemExit(f"build: {bg} has no readable text colour ({ratio:.2f}:1)")
    return pick, ratio


def ramp(a, b, n=5):
    """Steps between two hexes, so the count scale is computed, not hand picked."""
    A = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    B = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    out = []
    for i in range(n):
        t = i / (n - 1)
        out.append("#%02x%02x%02x" % tuple(int(round(A[j] + (B[j] - A[j]) * t)) for j in range(3)))
    return out


# Cells carry magnitude only, in a neutral slate ramp that matches no status hue.
HEAT = ramp("#1a2740", "#dbe9f7")
for _c in HEAT:
    fg_for(_c)


def clean(s):
    """House rule: no em or en dashes. A quoted UI string keeps its words; an
    em dash becomes a colon, which reads as the label separator the source used."""
    return re.sub(r"\s*\u2014\s*", ": ", str(s).replace("`", "")).replace("\u2013", "-")


def words(s):
    return len(re.sub(r"<[^>]+>", " ", s).split())


SHORT = {"S01": "Coach shell", "S02": "Messages", "S03": "Check-ins", "S04": "Habits",
         "S05": "Templates", "S06": "Nutrition", "S07": "Training", "S08": "Dashboard builder",
         "S09": "Client tracker", "S10": "Appearance", "S11": "Identity", "S12": "Orphans",
         "ROLES": "Roles"}


def short_name(sid, name):
    """A two word handle for the dense rows; the full name sits in the explorer."""
    if sid in SHORT:
        return SHORT[sid]
    s = re.sub(r"\([^)]*\)", "", str(name or "")).strip()
    s = re.split(r"[,:]", s)[0].strip()
    return " ".join(s.split()[:3]) or "Surface"


def disp_id(s):
    """The ROLES block belongs to decision D10; showing D10 avoids a duplicate label."""
    sid = str(s.get("id") or "")
    return "D10" if sid.upper().startswith("ROLE") else sid


def cited(decision):
    return re.findall(r"#(\d+)", str(decision or ""))


def lead_label(decision):
    """The decision a row files under: the first number it cites, else its source."""
    nums = cited(decision)
    if nums:
        return "#" + nums[0]
    d = str(decision or "")
    if "CALORIES" in d:
        return "CALORIES exclusion"
    if "runtime" in d.lower():
        return "runtime-gate policy"
    return "decision"


def plural(n):
    return "row" if int(n) == 1 else "rows"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(HERE / "matrix.json"))
    ap.add_argument("--out", default=str(HERE / "gap-matrix.html"))
    args = ap.parse_args()

    src = Path(args.data)
    if not src.exists():
        raise SystemExit(f"build: no data at {src}")
    d = json.loads(src.read_text())
    statuses = [s for s in (d.get("statuses") or STATUS_ORDER) if s in STATUS_ORDER] or STATUS_ORDER
    totals = d.get("totals") or {}
    summary = d.get("summary") or {}
    rows = d.get("rows") or []
    total = int(totals.get("total") or sum(summary.get(k, {}).get("total", 0) for k in summary))
    wired = int(totals.get("WIRED") or 0)
    conflicts = d.get("conflicts") or []
    roles = d.get("roles") or []
    blocked = len(conflicts) + len(roles)  # rows that wait on an owner decision

    # surfaces in contract order, plus any summary key the surfaces list forgot
    surfaces, seen = [], set()
    for s in d.get("surfaces") or []:
        sid = str(s.get("id"))
        surfaces.append({"id": sid, "name": s.get("name") or sid})
        seen.add(sid)
    for sid in summary:
        if sid not in seen:
            surfaces.append({"id": sid, "name": "ROLES decision (round 3)" if sid.upper().startswith("ROLE") else sid})

    bad = [s["id"] for s in surfaces if s["id"] not in summary]
    if bad:
        print(f"build: WARNING summary missing for {bad}")

    for s in surfaces:
        c = summary.get(s["id"]) or {}
        s["counts"] = {k: int(c.get(k, 0)) for k in statuses}
        s["total"] = int(c.get("total") or sum(s["counts"].values()))
        s["open"] = s["total"] - s["counts"].get("WIRED", 0)

    cell_sum = sum(s["total"] for s in surfaces)
    if cell_sum != total:
        raise SystemExit(f"build: cells sum to {cell_sum}, totals say {total}")
    if len(rows) != total:
        print(f"build: WARNING {len(rows)} rows in data, totals say {total} (fixture build?)")

    # ---------- 01 KPI ----------
    h1 = (f"None of {total} elements is wired; {blocked} {plural(blocked)} wait on a decision"
          if wired == 0 else
          f"{total} elements; {wired} wired, {total - wired} still open")
    c1 = ("A WIRED row means the backend serves the canvas element as drawn. "
          "Every other status names what is missing, unconnected or blocked.")
    readout = "".join(
        f'<div class="ro"><i class="sq" style="background:{FILL[s]}" aria-hidden="true"></i>'
        f'<span class="rn">{esc(s)}</span>'
        f'<span class="rv">{int(totals.get(s) or 0)}</span></div>'
        for s in statuses)
    sec1 = f'''<section class="sec" id="size">
  <p class="eyebrow">01 / Size</p>
  <h2>{esc(h1)}</h2>
  <p class="cap">{esc(c1)}</p>
  <div class="hero">
    <div class="hcell"><b class="hnum">{total}<small>rows</small></b>
      <span class="hlab">Canvas elements</span></div>
    <div class="hcell"><b class="hnum warn">{wired}<small>wired</small></b>
      <span class="hlab">Served as drawn</span></div>
  </div>
  <div class="readout">{readout}</div>
</section>'''

    # ---------- 02 matrix ----------
    maxc = max([s["counts"][k] for s in surfaces for k in statuses] + [1])
    heads = "".join(
        f'<th scope="col"><i class="sw" style="background:{FILL[s]}" aria-hidden="true"></i>'
        f'<abbr title="{esc(s.title())}">{CODE[s]}</abbr></th>' for s in statuses)
    cols = ('<col class="c-s">' + '<col class="c-x">' * len(statuses) + '<col class="c-t">')
    body = []
    for s in surfaces:
        cells = []
        for k in statuses:
            c = s["counts"][k]
            if c == 0:
                cells.append('<td><span class="cellz" aria-hidden="true">0</span></td>')
            else:
                bg = HEAT[max(0, min(4, math.ceil(c / maxc * 5) - 1))]
                fg = fg_for(bg)[0]
                cells.append(
                    f'<td><button type="button" class="cellb" data-surface="{esc(s["id"])}" '
                    f'data-status="{k}" aria-pressed="false" style="background:{bg};color:{fg}" '
                    f'aria-label="{esc(s["id"])} {esc(k.lower())}, {c} {plural(c)}. Filter the row list.">{c}</button></td>')
        body.append(
            f'<tr><th scope="row"><button type="button" class="sbtn" data-surface="{esc(s["id"])}" '
            f'title="{esc(s["name"])}" aria-label="Filter the rows to {esc(s["id"])}, {esc(s["name"])}">'
            f'<span class="sid">{esc(disp_id(s))}</span><span class="snm">{esc(short_name(s["id"], s["name"]))}</span></button></th>'
            f'{"".join(cells)}<td class="tot">{s["total"]}</td></tr>')
    key = "".join(f'<span><i style="background:{FILL[s]}" aria-hidden="true"></i>{esc(s)}</span>'
                  for s in statuses)
    two_largest = sum(sorted((s["open"] for s in surfaces), reverse=True)[:2])
    c2 = ("One row per surface, one column per status. Cell shade carries the count only; "
          "status colour stays in the column header.")
    sec2 = f'''<section class="sec" id="matrix">
  <p class="eyebrow">02 / The matrix</p>
  <h2>{esc(f"The two largest surfaces hold {two_largest} of the {total} rows")}</h2>
  <p class="cap">{esc(c2)}</p>
  <div class="scroll" tabindex="0" role="region" aria-label="Gap matrix table, {len(surfaces)} surfaces by {len(statuses)} statuses">
  <table class="mx">
    <caption>Rows by surface and status. Each cell filters the row list below.</caption>
    <colgroup>{cols}</colgroup>
    <thead><tr><th scope="col" class="ab">Surface</th>{heads}<th scope="col" class="tc">Total</th></tr></thead>
    <tbody>{"".join(body)}</tbody>
  </table></div>
  <div class="bkey" role="list">{key}</div>
  <p class="note">Click a cell or a surface name to filter the rows below.</p>
</section>'''

    # ---------- 03 status mix ----------
    ranked = sorted(surfaces, key=lambda s: (-s["total"], s["id"]))
    max_open = max([s["open"] for s in ranked] + [1])
    mix = totals.get("PARTIAL", 0) + totals.get("MISSING", 0)
    mix_pct = round(mix / total * 100) if total else 0
    bar_rows = []
    for s in ranked:
        segs, chips = [], []
        for k in statuses:
            c = s["counts"][k]
            if not c:
                continue
            bg = FILL[k]
            fg = fg_for(bg)[0]
            px = c * BAR_TRACK / max(1, max_open)
            label = (f"{k} {c}" if px >= 108 else str(c) if px >= 18 else "")
            seg = (f'<span class="seg" role="img" aria-label="{esc(k.title())}, {c} {plural(c)}" '
                   f'style="flex:{c} 1 0;background:{bg};color:{fg}">')
            seg += f'<span aria-hidden="true">{esc(label)}</span>' if label else ""
            segs.append(seg + "</span>")
            chips.append(f'<span><b>{esc(k)}</b> {c}</span>')
        bar_rows.append(
            f'<div class="brow"><span class="blab"><span class="sid">{esc(disp_id(s))}</span>'
            f'<span class="bnm">{esc(short_name(s["id"], s["name"]))}</span></span>'
            f'<span class="track"><span class="stack" style="width:{s["total"] / max_open * 100:.2f}%">'
            f'{"".join(segs)}</span></span>'
            f'<span class="btot">{s["total"]}</span>'
            f'<span class="bchips">{"".join(chips)}</span></div>')
    c3 = ("Every row is open, so each bar runs to its surface's full size and the split "
          "shows which statuses make up that size.")
    sec3 = f'''<section class="sec" id="rank">
  <p class="eyebrow">03 / Status mix</p>
  <h2>{esc(f"Partial and missing rows make up {mix_pct}% of the {total} rows")}</h2>
  <p class="cap">{esc(c3)}</p>
  <div class="bkey">{key}</div>
  <div class="bars">{"".join(bar_rows)}</div>
</section>'''

    # ---------- 04 blockers ----------
    buckets = {}
    for c in conflicts:
        buckets.setdefault(lead_label(c.get("decision")), []).append(c)
    ordered = sorted(buckets.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    cites = Counter()
    for c in conflicts:
        for n in set(cited(c.get("decision"))):
            cites["#" + n] += 1
    top_key = max(cites, key=lambda k: (cites[k], k)) if cites else ""
    top_cites = cites.get(top_key, 0)
    top_leads = len(buckets.get(top_key, []))

    multi = [(k, v) for k, v in ordered if len(v) > 1]
    singles = [(k, v) for k, v in ordered if len(v) == 1]
    max_bar = max([len(v) for _, v in multi] + [len(roles)] + [1])
    nodes = []
    for i, (key_, items) in enumerate(multi):
        ids = " · ".join(esc(x.get("id")) for x in items[:8])
        if len(items) > 8:
            ids += f" · +{len(items) - 8} more"
        gloss = ""
        if i < 3:
            first = items[0]
            gloss = (f'<p class="twhy">Example row {esc(first.get("id"))}: '
                     f'{esc(clean(first.get("note")))}</p>')
        nodes.append(
            f'<div class="tnode{" hi" if i == 0 else ""}"><div class="thd">'
            f'<span class="tdec">{esc(key_)}</span>'
            f'<b class="tcnt">{len(items)}<small>{plural(len(items))}</small></b></div>'
            f'<div class="tbar"><i style="width:{len(items) / max_bar * 100:.1f}%"></i></div>'
            f'{gloss}<p class="tids">{ids}</p></div>')
    if roles:
        ids = " · ".join(esc(r.get("id")) for r in roles)
        nodes.append(
            f'<div class="tnode"><div class="thd"><span class="tdec">D10</span>'
            f'<b class="tcnt">{len(roles)}<small>{plural(len(roles))}</small></b></div>'
            f'<div class="tbar"><i style="width:{len(roles) / max_bar * 100:.1f}%"></i></div>'
            f'<p class="twhy">Owner fills the role and scope cells.</p>'
            f'<p class="tids">{ids}</p></div>')
    rest = ""
    if singles:
        lis = "".join(f'<li><span class="tdec">{esc(k)}</span>'
                      f'<span class="tid">{esc(v[0].get("id"))}</span></li>' for k, v in singles)
        rest = (f'<details class="trest"><summary>{len(singles)} decisions hold one conflict row each'
                f'</summary><ul>{lis}</ul></details>')

    parked = d.get("parked") or []
    judged = [p for p in parked if str(p.get("old_status", "")).upper().startswith("PARKED-D12")]
    active = [p for p in parked if p not in judged]
    park = ""
    if active or judged:
        block = ['<div class="park"><span class="pt">Parked (D12)</span>']
        if active:
            block.append(f'<span class="pids">{" · ".join(esc(p.get("id")) for p in active)}</span>')
            block.append('<span class="pnote">Consent and cycle tracking rows. Not counted in '
                         f'the {total}.</span>')
        if judged:
            block.append(f'<span class="pids">Also parked by the judge, not counted: '
                         f'{" · ".join(esc(p.get("id")) for p in judged)}</span>')
        block.append("</div>")
        park = "".join(block)
    c4 = ("A conflict row files under the first decision it cites, so a row that cites two "
          "counts once. Role cells wait on D10.")
    sec4 = f'''<section class="sec" id="block">
  <p class="eyebrow">04 / What blocks what</p>
  <h2>{esc(f"{top_cites} rows cite decision {top_key}; {top_leads} lead with it")}</h2>
  <p class="cap">{esc(c4)}</p>
  <div class="tree">{"".join(nodes)}</div>
  {rest}
  {park}
</section>'''

    # ---------- 05 explorer ----------
    by_surface = {}
    for r in rows:
        by_surface.setdefault(r.get("surface") or "S12", []).append(r)
    order = [s["id"] for s in surfaces] + sorted(k for k in by_surface if k not in {s["id"] for s in surfaces})
    groups_html = []
    for i, sid in enumerate(order):
        items = by_surface.get(sid)
        if not items:
            continue
        name = next((s["name"] for s in surfaces if s["id"] == sid), sid)
        lis = []
        for r in items:
            st = r.get("status")
            fill = FILL.get(st, "#8299b5")
            r3 = ' <span class="r3">R3</span>' if r.get("round3") else ""
            lis.append(
                f'<li class="r" data-surface="{esc(sid)}" data-status="{esc(st)}">'
                f'<span class="st"><i style="background:{fill}" aria-hidden="true"></i>{esc(st)}</span>'
                f'<span class="rid">{esc(r.get("id"))}{r3}</span>'
                f'<span class="rel">{esc(clean(str(r.get("element") or "")))}</span></li>')
        groups_html.append(
            f'<details class="grp" data-surface="{esc(sid)}"{" open" if i == 0 else ""}>'
            f'<summary><span class="gsid">{esc(sid)}</span>'
            f'<span class="gname">{esc(name)}</span>'
            f'<span class="gcount">{len(items)}</span></summary>'
            f'<ol class="rw">{"".join(lis)}</ol></details>')
    opts = "".join(f'<option value="{esc(s["id"])}">{esc(s["id"])}, {esc(s["name"])}</option>' for s in surfaces)
    c5 = "Each row is one canvas element with its status. Round 3 rows carry R3."
    sec5 = f'''<section class="sec" id="rows">
  <p class="eyebrow">05 / Every row</p>
  <h2>{esc(f"All {len(rows)} rows, grouped by surface")}</h2>
  <p class="cap">{esc(c5)}</p>
  <div class="filters needs-js" id="filters" tabindex="-1">
    <div class="f"><label for="f-surf">Surface</label>
      <select id="f-surf" name="surface"><option value="">All surfaces</option>{opts}</select></div>
    <div class="f"><label for="f-stat">Status</label>
      <select id="f-stat" name="status"><option value="">All statuses</option>
      {"".join(f'<option value="{s}">{s.title()}</option>' for s in statuses)}</select></div>
    <div class="f"><label for="f-q">Find</label>
      <input id="f-q" name="q" type="search" autocomplete="off" spellcheck="false"
        placeholder="Search text or id, e.g. S06-07 or nutrition…"></div>
    <div class="f"><button id="f-clear" type="button">Clear</button></div>
  </div>
  <p id="f-count" role="status" aria-live="polite">{len(rows)} of {len(rows)} rows</p>
  <div class="groups" id="rows-list">{"".join(groups_html)}</div>
</section>'''

    # ---------- 06 delta ----------
    delta = d.get("delta") or {}
    before = int(delta.get("before") or 0)
    added = int(delta.get("round3_added") or 0)
    parked_n = int(delta.get("parked") or len(active) or 0)
    after = int(delta.get("after") or total)
    peak = max(after, before + added, 1)
    # 0.85 leaves headroom inside the track for the value label above each bar
    pc = lambda v: f"{v / peak * 85:.2f}%"

    def bar(left, height, cls, label):
        return (f'<div class="wfbar {cls}" style="bottom:{left};height:{height}"></div>'
                f'<span class="wfval" style="bottom:calc({left} + {height} + 6px)">{label}</span>')

    def link(level):
        return f'<i class="wflink" style="bottom:{pc(level)}" aria-hidden="true"></i>'

    cols = [
        ("before", bar("0", pc(before), "a", str(before)) + link(before)),
        ("round 3", bar(pc(before), pc(added), "b", f"+{added}") + link(before + added)),
        ("parked", bar(pc(after), pc(parked_n), "c", f"-{parked_n}") + link(after)),
        ("after", bar("0", pc(after), "a", str(after))),
    ]
    wf = "".join(f'<div class="wfcol"><div class="wftrack">{body}</div>'
                 f'<span class="wfcat">{cat}</span></div>' for cat, body in cols)
    orphans = d.get("orphans") or {}
    orph_n = int(orphans.get("count") or 0)
    c6 = (f"{parked_n} {plural(parked_n)} parked under D12, consent and cycle tracking. "
          f"{len(judged)} more were judged parked and sit outside the count."
          if judged else
          f"{parked_n} {plural(parked_n)} parked under D12, consent and cycle tracking.")
    sec6 = f'''<section class="sec" id="delta">
  <p class="eyebrow">06 / Round 3</p>
  <h2>{esc(f"Round 3 added {added} rows and parked {parked_n}")}</h2>
  <p class="cap">{esc(c6)}</p>
  <div class="dgrid">
    <div class="wf">{wf}</div>
    <div class="orph"><b>{orph_n}</b><span>backend capabilities with no canvas row</span></div>
  </div>
</section>'''

    # ---------- template ----------
    tpl = (HERE / "template.html").read_text()
    footer = f"Source: {d.get('source') or 'icm/02-gap-matrix/output/GAP-MATRIX.md'}. Built {d.get('generated') or ''} from {len(rows)} rows."
    js = json.dumps(d, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    out = tpl.replace("{{TOTAL}}", str(total))
    for i, block in enumerate([sec1, sec2, sec3, sec4, sec5, sec6], 1):
        out = out.replace(f"<!--SEC{i}-->", block)
    out = out.replace("{{FOOTER}}", esc(footer)).replace("{{JSON}}", js)
    if "{{" in out or "<!--SEC" in out:
        raise SystemExit("build: unfilled placeholder in template")
    Path(args.out).write_text(out)

    # ---------- console report ----------
    prose = re.sub(r"<(script|style|svg)\b[\s\S]*?</\1>", " ", out)
    prose = re.sub(r'<section class="sec" id="rows"[\s\S]*?</section>', " ", prose)
    toks = re.sub(r"<[^>]+>", " ", prose).split()
    raw = len(toks)
    prose_words = len([t for t in toks if re.search(r"[A-Za-z]", t)])
    em = out.count("\u2014") + out.count("\u2013")
    print(f"build: {args.out}")
    print(f"build: rows={len(rows)} cells={cell_sum} total={total} statuses={len(statuses)} surfaces={len(surfaces)}")
    print(f"build: blocked={blocked} conflicts={len(conflicts)} groups={len(buckets)} multi={len(multi)} "
          f"singles={len(singles)} roles={len(roles)} parked={len(active)} judged={len(judged)} orphans={orph_n}")
    print(f"build: top={top_key} cites={top_cites} leads={top_leads} mix={mix} ({mix_pct}%)")
    print(f"build: words outside svg and explorer: raw={raw} prose={prose_words}  em/en dashes={em}")
    if len(active) != parked_n:
        print(f"build: WARNING parked block {len(active)} != delta.parked {parked_n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
