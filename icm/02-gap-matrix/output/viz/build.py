#!/usr/bin/env python3
"""Build viz/gap-matrix.html from viz/matrix.json and viz/template.html.

Stdlib only. Sections are rendered here, at build time, so the page reads
without JavaScript. The same JSON is inlined for the filter layer.

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
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATUS_ORDER = ["UNWIRED", "UNCONFIGURED", "PARTIAL", "MISSING", "CONFLICT", "ROLES"]
CODE = {"UNWIRED": "UNW", "UNCONFIGURED": "UNC", "PARTIAL": "PAR",
        "MISSING": "MIS", "CONFLICT": "CON", "ROLES": "ROL"}
FILL = {"UNWIRED": "#2f64c8", "UNCONFIGURED": "#4c8dff", "PARTIAL": "#00c8f0",
        "MISSING": "#9df2ff", "CONFLICT": "#8299b5", "ROLES": "#536680"}
HEAT = ["#2a6aa3", "#2f89bf", "#38aad8", "#5fd0f0", "#9df2ff"]
INK, VOID = "#eef6fd", "#0a1120"
BAR_TRACK = 912  # px, matches .bars grid: 1040 - 52 - 52 - 24

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


def clean(s):
    """House rule: no em or en dashes on the page."""
    return re.sub(r"\s*\u2014\s*", ", ", str(s).replace("`", "")).replace("\u2013", "-")


def words(s):
    return len(re.sub(r"<[^>]+>", " ", s).split())


def short(s, limit=105):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    m = re.match(r"^(.+?[.!?])(\s|$)", s)
    if m and len(m.group(1)) <= limit:
        return m.group(1)
    if len(s) <= limit:
        return s
    cut = s[:limit]
    return (cut.rsplit(" ", 1)[0].rstrip(",;:") + "…") if " " in cut else cut


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


def decision_key(decision):
    d = str(decision or "")
    m = re.search(r"#(\d+)", d)
    if m:
        return "#" + m.group(1)
    if "runtime" in d.lower():
        return "trusted runtime"
    if "CALORIES" in d:
        return "CALORIES"
    return short(d, 22) or "decision"


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
        print(f"build: WARNING cells sum to {cell_sum}, totals say {total}")
    if len(rows) != total:
        print(f"build: WARNING {len(rows)} rows in data, totals say {total} (fixture build?)")

    # ---------- 01 KPI ----------
    if wired == 0:
        h1 = f"{total} canvas elements need backend work; none is wired"
    else:
        h1 = f"{total} elements; {wired} wired, {total - wired} still open"
    c1 = "A WIRED row means the backend serves the element as drawn. Every other status names what is absent, unconnected or blocked."
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
    <div class="hcell"><b class="hnum warn">0<small>wired</small></b>
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
                bg = HEAT[max(0, math.ceil(c / maxc * 5) - 1)]
                fg = fg_for(bg)[0]
                cells.append(
                    f'<td><button type="button" class="cellb" data-surface="{esc(s["id"])}" '
                    f'data-status="{k}" aria-pressed="false" style="background:{bg};color:{fg}" '
                    f'aria-label="{esc(s["id"])} {esc(k.lower())}, {c} rows. Filter the row list.">{c}</button></td>')
        body.append(
            f'<tr><th scope="row"><button type="button" class="sbtn" data-surface="{esc(s["id"])}" '
            f'title="{esc(s["name"])}" aria-label="Filter the rows to {esc(s["id"])}, {esc(s["name"])}">'
            f'<span class="sid">{esc(disp_id(s))}</span><span class="snm">{esc(short_name(s["id"], s["name"]))}</span></button></th>'
            f'{"".join(cells)}<td class="tot">{s["total"]}</td></tr>')
    key = "".join(f'<span><i style="background:{FILL[s]}" aria-hidden="true"></i>{esc(s.title())}</span>'
                  for s in statuses)
    c2 = "One row per surface, one column per status. Shade and number both carry the count."
    sec2 = f'''<section class="sec" id="matrix">
  <p class="eyebrow">02 / The matrix</p>
  <h2>{esc(f"The two largest surfaces hold {sum(sorted((s['open'] for s in surfaces), reverse=True)[:2])} of {total} rows")}</h2>
  <p class="cap">{esc(c2)}</p>
  <div class="scroll"><table class="mx">
    <caption>Rows by surface and status. Each cell filters the row list below.</caption>
    <colgroup>{cols}</colgroup>
    <thead><tr><th scope="col" class="ab">Surface</th>{heads}<th scope="col" class="tc">Total</th></tr></thead>
    <tbody>{"".join(body)}</tbody>
  </table></div>
  <div class="bkey" role="list">{key}</div>
  <p class="note">Click a cell or a surface name to filter the rows below.</p>
</section>'''

    # ---------- 03 ranked stacked bars ----------
    ranked = sorted(surfaces, key=lambda s: (-s["open"], s["id"]))
    max_open = max([s["open"] for s in ranked] + [1])
    bar_rows = []
    for s in ranked:
        segs = []
        for k in statuses:
            c = s["counts"][k]
            if not c:
                continue
            bg = FILL[k]
            fg = fg_for(bg)[0]
            px = c * BAR_TRACK / max(1, max_open)
            if px >= 16:
                segs.append(f'<span class="seg" style="flex:{c} 1 0;background:{bg};color:{fg}" '
                            f'title="{esc(k.title())}: {c} of {s["open"]} open rows">{c}</span>')
            else:
                segs.append(f'<span class="seg" style="flex:{c} 1 0;background:{bg}" '
                            f'aria-label="{esc(k.title())}, {c} rows"></span>')
        bar_rows.append(
            f'<div class="brow"><span class="blab"><span class="sid">{esc(disp_id(s))}</span></span>'
            f'<span class="track"><span class="stack" style="width:{s["open"] / max_open * 100:.2f}%">'
            f'{"".join(segs)}</span></span>'
            f'<span class="btot">{s["open"]}</span></div>')
    top = ranked[0]
    c3 = "No row is wired, so bar length is surface size."
    sec3 = f'''<section class="sec" id="rank">
  <p class="eyebrow">03 / Where the work is</p>
  <h2>{esc(f"{top['id']} carries the most open rows at {top['open']}")}</h2>
  <p class="cap">{esc(c3)}</p>
  <div class="scroll"><div class="bars" role="img"
    aria-label="Stacked bars, surfaces ranked by open rows, largest is {esc(top['id'])} at {top['open']}">{''.join(bar_rows)}</div></div>
</section>'''

    # ---------- 04 blockers ----------
    conflicts = d.get("conflicts") or []
    groups = {}
    for c in conflicts:
        groups.setdefault(decision_key(c.get("decision")), []).append(c)
    roles = d.get("roles") or []
    nodes = []
    for i, (key_, items) in enumerate(sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0]))):
        ids = " · ".join(esc(i2.get("id")) for i2 in items[:8])
        if len(items) > 8:
            ids += f" · +{len(items) - 8} more"
        nodes.append(
            f'<div class="tnode{" hi" if i == 0 else ""}"><span class="tdec">{esc(key_)}</span>'
            f'<b class="tcnt">{len(items)}</b>'
            f'<p class="twhy">{esc(short(items[0].get("note"), 78))}</p>'
            f'<p class="tids">{ids}</p></div>')
    if roles:
        ids = " · ".join(esc(r.get("id")) for r in roles)
        nodes.append(
            f'<div class="tnode"><span class="tdec">D10</span>'
            f'<b class="tcnt">{len(roles)}</b>'
            f'<p class="twhy">Owner fills these role and scope cells.</p>'
            f'<p class="tids">{ids}</p></div>')
    parked = d.get("parked") or []
    active_parked = [p for p in parked if not str(p.get("old_status", "")).upper().startswith("PARKED-D12")]
    if active_parked:
        parked = active_parked
    park = ""
    if parked:
        pids = " · ".join(esc(p.get("id")) for p in parked)
        park = (f'<div class="park"><span class="pt">Parked (D12)</span>'
                f'<span class="pids">{pids}</span>'
                f'<span class="pnote">Consent and health data, parked and not blocking.</span></div>')
    first_key, first_items = sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0]))[0] if groups else ("", [])
    c4 = "A conflict row collides with a binding decision, so its wiring waits. Roles rows wait on D10."
    sec4 = f'''<section class="sec" id="block">
  <p class="eyebrow">04 / What blocks what</p>
  <h2>{esc(f"Decision {first_key} holds up {len(first_items)} of {len(conflicts)} conflict rows")}</h2>
  <p class="cap">{esc(c4)}</p>
  <div class="tree">{"".join(nodes)}</div>
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
    c5 = "Each row is one canvas element with its status. Round-3 rows carry R3."
    sec5 = f'''<section class="sec" id="rows">
  <p class="eyebrow">05 / Every row</p>
  <h2>{esc(f"All {len(rows)} rows, grouped by surface")}</h2>
  <p class="cap">{esc(c5)}</p>
  <div class="filters needs-js">
    <div class="f"><label for="f-surf">Surface</label>
      <select id="f-surf" name="surface"><option value="">All surfaces</option>{opts}</select></div>
    <div class="f"><label for="f-stat">Status</label>
      <select id="f-stat" name="status"><option value="">All statuses</option>
      {"".join(f'<option value="{s}">{s.title()}</option>' for s in statuses)}</select></div>
    <div class="f"><label for="f-q">Find</label>
      <input id="f-q" name="q" type="search" autocomplete="off" spellcheck="false"
        placeholder="element text or row id"></div>
    <div class="f"><button id="f-clear" type="button">Clear</button></div>
  </div>
  <p id="f-count" role="status" aria-live="polite">{len(rows)} of {len(rows)} rows</p>
  <div class="groups" id="rows-list">{"".join(groups_html)}</div>
</section>'''

    # ---------- 06 delta ----------
    delta = d.get("delta") or {}
    before = int(delta.get("before") or 0)
    added = int(delta.get("round3_added") or 0)
    parked_n = int(delta.get("parked") or len(parked) or 0)
    after = int(delta.get("after") or total)
    peak = max(after, before + added)
    k = 154 / max(1, peak)
    y = lambda v: 200 - v * k
    svg_bars, svg_txt = [], []
    svg_bars.append(f'<rect x="56" y="{y(before):.1f}" width="64" height="{200 - y(before):.1f}" fill="#00c8f0"/>')
    svg_bars.append(f'<rect x="176" y="{y(before + added):.1f}" width="64" height="{max(2.0, added * k):.1f}" fill="#9df2ff"/>')
    svg_bars.append(f'<rect x="296" y="{y(after + parked_n):.1f}" width="64" height="{max(2.0, parked_n * k):.1f}" fill="#8299b5"/>')
    svg_bars.append(f'<rect x="416" y="{y(after):.1f}" width="64" height="{200 - y(after):.1f}" fill="#00c8f0"/>')
    svg_txt.append(f'<text x="88" y="{y(before) - 11:.1f}" class="nv" text-anchor="middle">{before}</text>')
    svg_txt.append(f'<text x="448" y="{y(after) - 11:.1f}" class="nv" text-anchor="middle">{after}</text>')
    svg_txt.append(f'<text x="208" y="{y(before + added) - 11:.1f}" class="nv" text-anchor="middle">+{added}</text>')
    svg_txt.append(f'<text x="328" y="{y(after) + 26:.1f}" class="nv" text-anchor="middle">-{parked_n}</text>')
    conn = (f'<g style="stroke:rgba(130,153,181,.55);stroke-width:1;stroke-dasharray:3 3">'
            f'<line x1="120" y1="{y(before):.1f}" x2="176" y2="{y(before):.1f}"/>'
            f'<line x1="240" y1="{y(before + added):.1f}" x2="296" y2="{y(before + added):.1f}"/>'
            f'<line x1="360" y1="{y(after):.1f}" x2="416" y2="{y(after):.1f}"/></g>')
    cats = "".join(f'<text x="{x}" y="220" class="nm" text-anchor="middle">{t}</text>'
                   for x, t in ((88, "before"), (208, "round 3"), (328, "parked"), (448, "after")))
    svg = (f'<svg viewBox="0 0 600 236" role="img" '
           f'aria-label="Row count from {before} before round 3, plus {added} round-3 rows, minus {parked_n} parked, to {after}">'
           f'<line x1="36" y1="200" x2="556" y2="200" style="stroke:rgba(130,153,181,.30);stroke-width:1"/>'
           f'<text x="30" y="203" class="nm" text-anchor="end">0</text>'
           f'{conn}{"".join(svg_bars)}{"".join(svg_txt)}{cats}</svg>')
    orphans = d.get("orphans") or {}
    orph_n = int(orphans.get("count") or 0)
    c6 = "The judge confirmed the round-3 rows. Four consent rows moved to the parked appendix."
    sec6 = f'''<section class="sec" id="delta">
  <p class="eyebrow">06 / Round 3</p>
  <h2>{esc(f"Round 3 added {added} rows and parked {parked_n}")}</h2>
  <p class="cap">{esc(c6)}</p>
  <div class="dgrid">
    <div class="scroll">{svg}</div>
    <div class="orph"><b>{orph_n}</b><span>backend capabilities with no canvas row</span></div>
  </div>
</section>'''

    # ---------- template ----------
    tpl = (HERE / "template.html").read_text()
    footer = f"Source: {d.get('source') or 'icm/02-gap-matrix/output/GAP-MATRIX.md'}. Built {d.get('generated') or ''} from {len(rows)} rows."
    js = json.dumps(d, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    out = tpl
    for i, block in enumerate([sec1, sec2, sec3, sec4, sec5, sec6], 1):
        out = out.replace(f"<!--SEC{i}-->", block)
    out = out.replace("{{FOOTER}}", esc(footer)).replace("{{JSON}}", js)
    if "{{" in out or "<!--SEC" in out:
        raise SystemExit("build: unfilled placeholder in template")
    Path(args.out).write_text(out)

    # ---------- console report ----------
    text = out
    prose = re.sub(r"<(script|style|svg)\b[\s\S]*?</\1>", " ", text)
    prose = re.sub(r'<section class="sec" id="rows"[\s\S]*?</section>', " ", prose)
    toks = re.sub(r"<[^>]+>", " ", prose).split()
    raw = len(toks)
    prose_words = len([t for t in toks if re.search(r"[A-Za-z]", t)])
    em = out.count("\u2014") + out.count("\u2013")
    print(f"build: {args.out}")
    print(f"build: rows={len(rows)} cells={cell_sum} total={total} statuses={len(statuses)} surfaces={len(surfaces)}")
    print(f"build: words outside svg and explorer: raw={raw} prose={prose_words}  em/en dashes={em}")
    print(f"build: conflicts={len(conflicts)} groups={len(groups)} roles={len(roles)} parked={len(parked)} orphans={orph_n}")
    if parked and len(parked) != parked_n:
        print(f"build: WARNING parked block {len(parked)} != delta.parked {parked_n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
