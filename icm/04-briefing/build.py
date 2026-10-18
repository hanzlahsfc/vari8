#!/usr/bin/env python3
"""Build vari8-dev-briefing.html (lane DB-PAGE). Stdlib only.

Reads, next to this file: cards-A.md, cards-B.md, cards-C.md, story.md,
and shots/index.json (optional). Also reads PLAN.md and matrix.json as checks.
Writes: vari8-dev-briefing.html, one self-contained file (images inlined as base64).

shots/index.json contract (DB-SHOTS writes it). A list of entries, or {"shots": [...]},
or {"<file>": {...}}. Each entry has: surface ("S01".."S11"), screen, route, click,
file (plain shot under shots/), annotated (annotated shot under shots/, or null),
matched (matrix rows found on the screen). A surface with no usable file gets a
"Screenshot pending" frame. Rerun this script when shots land; no code change needed.
"""
import base64
import html
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHOTS = HERE / "shots"
OUT = HERE / "vari8-dev-briefing.html"
PLAN = HERE.parent / "03-plan" / "output" / "PLAN.md"
MATRIX = HERE.parent / "02-gap-matrix" / "output" / "viz" / "matrix.json"
GAP_PAGE = "../02-gap-matrix/output/viz/gap-matrix.html"
MAX_SHOT = 400_000

LANES = ["Foundation", "Data model", "Services", "Wire screens", "Messaging and media", "Mobile"]
# (key in card text, plain label, colour). Colours: jade = go, cyan = accent, azure/cobalt = build steps, verm = your call.
WORDS = [
    ("switch on", "Switch on", "#46e3c2"),
    ("connect", "Connect", "#00c8f0"),
    ("reshape", "Reshape", "#4c8dff"),
    ("build", "Build", "#2f64c8"),
    ("your call", "Your call", "#e8453a"),
]
# Card title prefix -> surface id. Cards appear in this order in cards-A/B/C.md.
SURFACES = [("Coach shell", "S01"), ("Messages and Notes", "S02"), ("Check-ins", "S03"), ("Habits", "S04"),
            ("Templates", "S05"), ("Nutrition", "S06"), ("Training", "S07"), ("Dashboard builder", "S08"),
            ("Client tracker", "S09"), ("Appearance", "S10"), ("Sign-in", "S11")]
# Owner question number (story list, section 4) -> PLAN.md Q number it answers.
QMAP = {1: 5, 2: 8, 3: 13, 4: 12, 5: 10, 6: 11, 7: 15, 8: 18, 9: 2, 10: 14, 11: 16, 12: 10, 13: 17, 14: 9, 15: 2}
# Decision number -> patterns in a roadmap "Blocked by decision" cell.
DTAGS = {
    2: [r"\bQ9\b", r"\bQ15\b"], 3: [r"ROLES"], 4: [r"AUTH", r"mobile token"], 5: [r"\bQ1\b"],
    6: [r"test audit"], 7: [r"consent"], 8: [r"\bQ2\b", r"storage vendor"], 9: [r"\bQ14\b"],
    10: [r"\bQ5\b", r"\bQ12\b"], 11: [r"\bQ6\b"], 12: [r"\bQ4\b"], 13: [r"\bQ3\b"],
    14: [r"\bQ10\b"], 15: [r"\bQ7\b"], 16: [r"\bQ11\b"], 17: [r"\bQ13\b"], 18: [r"\bQ8\b"],
}
# Plain question per decision (story section 4, same order). Options, defaults and blocks come from the story.
DQ = {
    1: "Approve the plan, and should GitHub issues be created?",
    2: "Should the roster show real role names, and should the Ethereal studio stay as a dev-only route?",
    3: "Who may see, edit and do what, role by role?",
    4: "Keep Auth.js with your own tokens, or switch to Better Auth?",
    5: "How does the first coach account exist: operator setup, or coach self-signup?",
    6: "Approve the test audit, including the cut of the sign-in browser spec?",
    7: "Approve the consent-gate amendment, or keep the no-bypass wording? And does photo consent block media?",
    8: "Ship text-only messaging first, or hold messaging and media back?",
    9: "Allow workspace-wide calendar reads, or keep per-client calendars?",
    10: "Seed the template library after a source review or start empty? And keep Undo, or confirm before delete?",
    11: "Save appearance settings on the server, or in the browser only?",
    12: "Build coach-only tasks as a separate private, audited record, or drop them?",
    13: "What does archiving a client mean: a soft archive, or an ended membership?",
    14: "Show time and duration fields with a display format, or hide them?",
    15: "May nutrition totals be labeled estimates, or show entered values only?",
    16: "Show plain weekly set counts per muscle group, or hide the volume panel?",
    17: "Generate check-in dates on purpose, or replenish them on a schedule?",
    18: "Which dashboard layout: copied template defaults, or a per-client layout only?",
}
PR_RE = re.compile(r"\bPR-(?:\d{2}|M\d|SV\d|W\d{1,2}|MSG|MEDIA)\b")
PR_ANY = re.compile(r"PR-\w+")
QRUN = re.compile(r"\bQ\d{1,2}\b(?:(?:,\s*|\s+and\s+|\s+or\s+)Q\d{1,2}\b)*")


def read(name):
    return (HERE / name).read_text(encoding="utf-8")


def esc(s):
    return html.escape(s, quote=True)


def plain(s):
    """Drop path:line citations and D-codes from story text. Keeps readable parentheticals."""
    s = re.sub(r"\s*\((?=[^()]*(?:\.(?:md|ts|tsx|prisma|mjs|js|json)\b|:\d))[^()]*\)", "", s)
    s = re.sub(r"\s*\(conflict rows[^)]*\)", "", s)
    s = re.sub(r"\s*\(D\d+\)", "", s)
    return s.strip()


def decisions_text(s):
    """Turn owner question codes (Q9, Q15) into decision numbers."""
    s = s.replace("D12 says", "the parked consent rule says")
    def rep(m):
        nums = sorted({QMAP[int(q)] for q in re.findall(r"\d+", m.group(0))})
        return ("decision " if len(nums) == 1 else "decisions ") + " and ".join(map(str, nums))
    return QRUN.sub(rep, s)


def inline(s):
    s = esc(s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    return PR_RE.sub(lambda m: f'<span class="pr">{m.group(0)}</span>', s)


def wrap(text, width):
    lines, cur = [], ""
    for w in text.split():
        if cur and len(cur) + 1 + len(w) > width:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    return lines


def sections(text):
    out = {}
    for part in re.split(r"(?m)^## ", text)[1:]:
        key, _, body = part.partition("\n")
        out[key.strip()] = body
    return out


# ---------- cards (screens) ----------
FIELD = re.compile(r"^(Verdict|Readiness|What works already|The real work|Blocked on you|Start here|Screenshot):\s*(.*)$")


def parse_cards(name):
    cards = []
    for block in re.split(r"(?m)^## ", read(name))[1:]:
        title, _, body = block.partition("\n")
        title = title.strip()
        if title.lower().startswith(("self-check", "sources")):
            continue
        c = dict(title=title, verdict="", ready={}, works=[], work=[], blocked=[], start="", shot="")
        key = None
        for raw in body.splitlines():
            line = raw.rstrip()
            m = FIELD.match(line)
            if m:
                key, rest = m.group(1), m.group(2).strip()
                if key == "Readiness":
                    c["ready"] = {w.lower(): int(n) for w, n in re.findall(r"(switch on|connect|reshape|build|your call)\s+(\d+)", rest, re.I)}
                    key = None
                elif key in ("Verdict", "Start here", "Screenshot"):
                    c[{"Verdict": "verdict", "Start here": "start", "Screenshot": "shot"}[key]] = rest
                elif rest:
                    c[{"What works already": "works", "The real work": "work", "Blocked on you": "blocked"}[key]].append(rest)
                continue
            s = line.strip()
            if not s or key is None:
                continue
            if key in ("Verdict", "Start here", "Screenshot"):
                fld = {"Verdict": "verdict", "Start here": "start", "Screenshot": "shot"}[key]
                c[fld] = (c[fld] + " " + s).strip()
            else:
                c[{"What works already": "works", "The real work": "work", "Blocked on you": "blocked"}[key]].append(s[2:] if s.startswith("- ") else s)
        cards.append(c)
    return cards


# ---------- story ----------
def parse_next(sec):
    out = []
    for m in re.finditer(r"(?m)^\d+\. (.*)$", sec):
        line = plain(m.group(1))
        b = re.match(r"\*\*(.+?)\*\*\s*(.*)$", line)
        title, body = b.group(1), b.group(2)
        pr = PR_ANY.search(title).group(0)
        head = re.sub(r"^PR-\w+,?\s*", "", title).rstrip(".")
        head = head[:1].upper() + head[1:]
        see, unb, needs = "", "", body
        i = body.find("You see:")
        if i >= 0:
            needs = body[:i].strip()
            rest = body[i + len("You see:"):].strip()
            u = re.search(r"(?:\.\s+|\s+)(Unblocks .*)$", rest)
            see = rest[:u.start()].strip() if u else rest
            unb = u.group(1) if u else ""
        out.append(dict(pr=pr, title=head, needs=decisions_text(needs.replace("Needs two decisions first", "Needs two questions answered first")), see=decisions_text(see), unblocks=decisions_text(unb)))
    return out


def parse_merge(sec):
    states = {}
    for part in re.split(r"(?m)^### ", sec)[1:]:
        key, _, body = part.partition("\n")
        key = key.strip()
        lines = [l.strip() for l in body.splitlines() if l.strip()]
        boxes = []
        for l in lines:
            m = re.match(r"^- \*\*(.+?)\*\*:?\s*(.*)$", l)
            if m:
                boxes.append((m.group(1).replace("`", ""), decisions_text(plain(m.group(2)))))
        mech = next((l[len("Mechanism:"):].strip() for l in lines if l.startswith("Mechanism:")), "")
        states[key] = dict(sub=decisions_text(plain(lines[0])), boxes=boxes, mech=decisions_text(plain(mech)))
    return states


def parse_roadmap(sec):
    rows = []
    for line in sec.splitlines():
        if not line.startswith("| PR-"):
            continue
        pid, name, lane, deps, blocked = [plain(c.strip()) for c in line.strip().strip("|").split("|")[:5]]
        deps = re.sub(r"PR-W(\d+) to PR-W(\d+)", lambda m: ", ".join(f"PR-W{i}" for i in range(int(m.group(1)), int(m.group(2)) + 1)), deps)
        dep_ids = [] if deps.strip().lower() == "none" else PR_ANY.findall(deps)
        tags = sorted(n for n, pats in DTAGS.items() if any(re.search(p, blocked) for p in pats))
        rows.append(dict(id=pid, name=name, lane=lane, deps=dep_ids, decisions=tags, blocked=blocked))
    return rows


def depths(rows):
    by = {r["id"]: r for r in rows}
    memo = {}

    def d(i):
        if i not in memo:
            ds = by[i]["deps"]
            memo[i] = 0 if not ds else 1 + max(d(x) for x in ds)
        return memo[i]
    return {i: d(i) for i in by}


def parse_decisions(sec):
    out = []
    for m in re.finditer(r"(?m)^(\d+)\. \*\*(.+?)\*\*\s*(.*)$", sec):
        out.append(dict(n=int(m.group(1)), body=decisions_text(plain(m.group(3)))))
    pm = re.search(r"\*\*Parked[^*]*\*\*\s*(.*)", sec)
    parked = decisions_text(plain(pm.group(1))) if pm else ""
    return out, parked


def parse_tests(sec):
    txt = decisions_text(plain(next(l for l in sec.splitlines() if l.strip()).strip()))
    m = re.search(r"Of (\d+) test files, (\d+) keep as they are, (\d+) are trimmed, (\d+) are cut in (PR-\d+).*?and (\d+) wait", txt)
    if not m:
        raise SystemExit("tests line did not match the expected pattern")
    total, keep, trim, cut, cut_pr, wait = m.groups()
    t = dict(total=int(total), keep=int(keep), trim=int(trim), cut=int(cut), cut_pr=cut_pr, wait=int(wait), text=txt)
    if t["keep"] + t["trim"] + t["cut"] + t["wait"] != t["total"]:
        raise SystemExit("test split does not add up to the total")
    return t


# ---------- shots ----------
MIME = {".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


def load_shots():
    f = SHOTS / "index.json"
    if not f.exists():
        return {}, ["no shots/index.json yet"]
    data = json.loads(f.read_text(encoding="utf-8"))
    if isinstance(data, dict) and isinstance(data.get("shots"), list):
        entries = data["shots"]
    elif isinstance(data, dict):
        entries = [dict(v, file=k) for k, v in data.items() if isinstance(v, dict)]
    else:
        entries = data
    by, notes = {}, []
    for e in entries:
        if not isinstance(e, dict):
            continue
        name = (e.get("annotated") if isinstance(e.get("annotated"), str) else None) or e.get("file")
        path = SHOTS / Path(name or "").name
        if not name or not path.exists():
            notes.append(f"{e.get('surface')}: missing file {name}")
            continue
        raw = path.read_bytes()
        if len(raw) > MAX_SHOT:
            notes.append(f"{path.name} is {len(raw)//1000} KB (over 400 KB)")
        mime = MIME.get(path.suffix.lower(), "image/png")
        by.setdefault(e.get("surface"), []).append(dict(
            uri=f"data:{mime};base64," + base64.b64encode(raw).decode("ascii"),
            screen=e.get("screen") or "", route=e.get("route") or "", click=e.get("click") or "",
            annotated=bool(isinstance(e.get("annotated"), str)), matched=e.get("matched")))
    return by, notes


# ---------- SVG ----------
def flow_svg(prefix, title, nodes, edges):
    """Vertical flow: nodes = [(title, desc)], edges = [(i, j, label, dashed, arrow)]. Adjacent edges run straight, others run down a gutter."""
    X, NW, GUT0, GAP = 10, 270, 292, 34
    right = X + NW
    geo, y = [], 10
    for t, d in nodes:
        tl = wrap(t, 32)
        dl = wrap(d, 40) if d else []
        last = 22 + (len(tl) - 1) * 17 + ((20 + (len(dl) - 1) * 16) if dl else 0)
        geo.append(dict(y=y, h=last + 14, tl=tl, dl=dl))
        y += last + 14 + GAP
    H = y - GAP + 10
    cx = X + NW / 2
    top = lambda i: geo[i]["y"]
    bot = lambda i: geo[i]["y"] + geo[i]["h"]
    mid = lambda i: geo[i]["y"] + geo[i]["h"] / 2
    s = [f'<svg class="flow" viewBox="0 0 312 {H:.0f}" role="img" aria-label="{esc(title)}">',
         f'<title>{esc(title)}</title>',
         f'<defs><marker id="{prefix}-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
         '<path d="M0,0 L10,5 L0,10 z" fill="#8299b5"/></marker></defs>']
    for g in geo:
        s.append(f'<rect x="{X}" y="{g["y"]}" width="{NW}" height="{g["h"]}" rx="4" fill="#0e1628" stroke="#2b6f88"/>')
        for k, line in enumerate(g["tl"]):
            s.append(f'<text x="{X + 12}" y="{g["y"] + 22 + k * 17}" class="ft">{esc(line)}</text>')
        base = g["y"] + 22 + (len(g["tl"]) - 1) * 17 + 20
        for k, line in enumerate(g["dl"]):
            s.append(f'<text x="{X + 12}" y="{base + k * 16}" class="fd">{esc(line)}</text>')
    gut = 0
    for i, j, label, dashed, arrow in edges:
        da = ' stroke-dasharray="5 4"' if dashed else ""
        ma = f' marker-end="url(#{prefix}-a)"' if arrow else ""
        if abs(i - j) == 1:
            y1, y2 = (bot(i), top(j)) if j > i else (top(i), bot(j))
            s.append(f'<line x1="{cx}" y1="{y1}" x2="{cx}" y2="{y2}" stroke="#8299b5" stroke-width="1.5"{da}{ma}/>')
            if label:
                s.append(f'<text x="{cx + 10}" y="{(y1 + y2) / 2 + 4:.1f}" class="fl">{esc(label)}</text>')
        else:
            gx = GUT0 + 10 * gut
            gut += 1
            s.append(f'<path d="M{right},{mid(i)} H{gx} V{mid(j)} H{right}" fill="none" stroke="#8299b5" stroke-width="1.5"{da}{ma}/>')
    s.append("</svg>")
    return "".join(s)


def merge_html(states):
    order = {"Before": None, "Now": None, "After": None}
    after_keys = ["Browser", "Mobile", "app/api", "Service", "Web forms", "Auth", "Prisma"]
    after_edges = [(0, 2, "", False, True), (1, 2, "bearer token", False, True), (2, 3, "", False, True),
                   (4, 3, "calls the same service", False, True), (3, 5, "", False, True), (5, 6, "", False, True)]
    before_edges = [(0, 1, "no link", True, False)]
    now_edges = [(0, 1, "same repo", True, False)]
    panels = []
    for key, edges in [("Before", before_edges), ("Now", now_edges), ("After", after_edges)]:
        st = states[key]
        boxes = st["boxes"]
        if key == "After":
            def rank(b):
                for n, k in enumerate(after_keys):
                    if b[0].startswith(k):
                        return n
                raise SystemExit(f"unexpected After box {b[0]}")
            boxes = sorted(boxes, key=rank)
        svg = flow_svg("m" + key[0].lower(), f"{key}: {st['sub']}", boxes, edges)
        panels.append(f'<article class="state"><p class="step-tag">{key}</p><h3>{inline(st["sub"])}</h3>{svg}'
                      f'<p class="mech"><span class="lab">Mechanism</span> {inline(st["mech"])}</p></article>')
    return f'<div class="states">{"".join(panels)}</div>'


def roadmap_svg(rows, dep, crit):
    LW, CW, NW, GAP, PAD, TOP = 120, 96, 76, 8, 10, 44
    ncol = max(dep.values()) + 1
    W = LW + ncol * CW + 12
    info = {}
    for r in rows:
        lines = wrap(r["name"], 11)[:4]
        info[r["id"]] = dict(lines=lines, h=22 + len(lines) * 15 + 8, col=dep[r["id"]], r=r)
    y, lane_box, pos = TOP, {}, {}
    for lane in LANES:
        ids = sorted(k for k in info if info[k]["r"]["lane"] == lane)
        cols = {}
        for k in ids:
            cols.setdefault(info[k]["col"], []).append(k)
        inner = max((sum(info[k]["h"] + GAP for k in v) for v in cols.values()), default=40) - GAP
        band = inner + 2 * PAD
        lane_box[lane] = (y, band)
        for c, v in cols.items():
            yy = y + PAD
            for k in v:
                pos[k] = (LW + c * CW + 4, yy)
                yy += info[k]["h"] + GAP
        y += band + 12
    H = y + 6
    out = [f'<svg class="rm" viewBox="0 0 {W} {H}" role="img" aria-labelledby="rm-t">',
           '<title id="rm-t">Roadmap: every piece of work by lane and step, with arrows for dependencies</title>',
           '<defs><marker id="rm-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
           '<path d="M0,0 L10,5 L0,10 z" fill="#8299b5"/></marker></defs>']
    for c in range(ncol):
        out.append(f'<text x="{LW + c * CW + 4 + NW / 2}" y="{TOP - 14}" text-anchor="middle" class="ax">Step {c + 1}</text>')
    for lane in LANES:
        y0, band = lane_box[lane]
        out.append(f'<rect x="0" y="{y0}" width="{W}" height="{band}" fill="#0c1526"/>')
        lines = wrap(lane, 14)
        y1 = y0 + band / 2 - (len(lines) - 1) * 9 + 5
        for n, line in enumerate(lines):
            out.append(f'<text x="10" y="{y1 + n * 18:.1f}" class="lane">{esc(line)}</text>')
    for r in rows:
        for d in r["deps"]:
            x1, y1 = pos[d][0] + NW, pos[d][1] + info[d]["h"] / 2
            x2, y2 = pos[r["id"]][0], pos[r["id"]][1] + info[r["id"]]["h"] / 2
            hot = " hot" if d in crit and r["id"] in crit else ""
            out.append(f'<path class="edge{hot}" d="M{x1},{y1} C{x1 + 10},{y1} {x2 - 10},{y2} {x2},{y2}" marker-end="url(#rm-a)"/>')
    for k in sorted(info):
        x, y0 = pos[k]
        h, r = info[k]["h"], info[k]["r"]
        cls = "node crit" if k in crit else "node"
        out.append(f'<g class="{cls}"><title>{esc(k)}: {esc(r["name"])}</title><rect x="{x}" y="{y0}" width="{NW}" height="{h}" rx="3"/>')
        out.append(f'<text x="{x + 6}" y="{y0 + 15}" class="rid">{esc(k)}</text>')
        for n, line in enumerate(info[k]["lines"]):
            out.append(f'<text x="{x + 6}" y="{y0 + 31 + n * 15}" class="rn">{esc(line)}</text>')
        out.append("</g>")
        if r["decisions"]:
            n = r["decisions"][0]
            cx, cy = x + NW + 10, y0 + 12
            out.append(f'<a href="#decision-{n}"><title>Waits on decision {", ".join(map(str, r["decisions"]))}</title>'
                       f'<circle cx="{cx}" cy="{cy}" r="8.5" class="mk"/><text x="{cx}" y="{cy + 4}" text-anchor="middle" class="mkt">{n}</text></a>')
    out.append("</svg>")
    return "".join(out)


# ---------- page sections ----------
def sec_html(num, chip, h2, body, sid):
    return (f'<section class="sec" id="{sid}"><div class="wrap"><header class="sec-head"><span class="num">{num}</span>'
            f'<span class="chip">{esc(chip)}</span><h2>{esc(h2)}</h2></header>{body}</div></section>')


def next_html(items):
    lis = []
    for k, it in enumerate(items, 1):
        needs = f'<p class="needs">{inline(it["needs"])}</p>' if it["needs"] else ""
        lis.append(f'<li><span class="step">{k}</span><h3>{inline(it["title"])}</h3>'
                   f'<p class="pr-line">{inline(it["pr"])}</p>{needs}'
                   f'<p class="done"><span class="lab">Done when you see</span> {inline(it["see"])}</p>'
                   f'<p class="unb">{inline(it["unblocks"])}</p></li>')
    return f'<ol class="track">{"".join(lis)}</ol>'


def decision_card(d, blocks_n):
    sents = [s.strip() for s in re.split(r"(?<=\.)\s+(?=[A-Z(])", d["body"]) if s.strip()]
    rows, ctx = [], []
    labels = {"Options": "Options", "Default": "If you say nothing", "Blocks": "Blocks"}
    for s in sents:
        m = re.match(r"^(Options|Default|Blocks)\b:?\s*(.*)$", s)
        if m:
            rows.append((labels[m.group(1)], m.group(2).rstrip(".")))
        else:
            ctx.append(s)
    dl = "".join(f"<div><dt>{esc(k)}</dt><dd>{inline(v)}</dd></div>" for k, v in rows)
    ctx_html = f'<p class="ctx">{inline(" ".join(ctx))}</p>' if ctx else ""
    plural = "piece" if blocks_n == 1 else "pieces"
    return (f'<article class="dcard" id="decision-{d["n"]}"><header><span class="dn">Decision {d["n"]}</span>'
            f'<span class="dblk">Blocks {blocks_n} {plural} of work</span></header>'
            f'<h3>{esc(DQ[d["n"]])}</h3><dl>{dl}</dl>{ctx_html}</article>')


def screen_card(i, c, shots):
    total = sum(c["ready"].values()) or 1
    segs = "".join(f'<span style="width:{c["ready"].get(k, 0) / total * 100:.2f}%;background:{col}"></span>'
                   for k, _, col in WORDS if c["ready"].get(k, 0))
    legend = "".join(f'<li><i class="sw" style="background:{col}"></i>{lab} <b>{c["ready"].get(k, 0)}</b></li>'
                     for k, lab, col in WORDS)
    ul = lambda xs, empty="": f'<ul>{"".join(f"<li>{inline(x)}</li>" for x in xs)}</ul>' if xs else (f"<p>{empty}</p>" if empty else "")
    if shots:
        figs = "".join(
            f'<figure class="shot" id="shot-{i}-{k}"><a class="shot-open" href="#shot-{i}-{k}" aria-label="Enlarge: {esc(s["screen"])}">'
            f'<img src="{s["uri"]}" alt="{esc(s["screen"])}"></a>'
            f'<a class="close" href="#screen-{i}">Close</a>'
            f'<figcaption>{esc(s["screen"])}{" (annotated)" if s["annotated"] else ""}. Route {esc(s["route"])}. {esc(s["click"])}</figcaption></figure>'
            for k, s in enumerate(shots, 1))
    else:
        figs = (f'<div class="pending"><b>Screenshot pending</b><span>The capture lane has not saved this screen yet.</span>'
                f'<span>Where to see it: {esc(c["shot"])}</span></div>')
    return (f'<article class="screen" id="screen-{i}"><div class="scr-shot">{figs}</div><div class="scr-body">'
            f'<h3>{esc(c["title"])}</h3><p class="verdict">{inline(c["verdict"])}</p>'
            f'<div class="bar" role="img" aria-label="{esc(", ".join(f"{lab} {c["ready"].get(k, 0)}" for k, lab, _ in WORDS))}">{segs}</div>'
            f'<ul class="bar-legend">{legend}</ul>'
            f'<div class="cols"><div><h4>What works already</h4>{ul(c["works"])}</div>'
            f'<div><h4>The real work</h4>{ul(c["work"])}</div>'
            f'<div class="block"><h4>Blocked on you</h4>{ul(c["blocked"], "Nothing on this screen waits on you.")}</div>'
            f'<div><h4>Start here</h4><p class="start">{inline(c["start"])}</p></div></div></div></article>')


def rm_list(rows, dep, lanes):
    parts = []
    for lane in lanes:
        items = sorted((r for r in rows if r["lane"] == lane), key=lambda r: r["id"])
        lis = []
        for r in items:
            after = ", ".join(f'<span class="pr">{d}</span>' for d in r["deps"]) or "nothing"
            waits = " ".join(f'<a href="#decision-{n}">decision {n}</a>' for n in r["decisions"]) or "nothing"
            lis.append(f'<li><p><span class="pr">{r["id"]}</span> <strong>{esc(r["name"])}</strong></p>'
                       f'<p class="meta">After: {after}. Waits on: {waits}.</p></li>')
        parts.append(f'<div class="lane-block"><h3>{esc(lane)} <span class="cnt">{len(items)}</span></h3><ul>{"".join(lis)}</ul></div>')
    return "".join(parts)


CSS = """
:root{--void:#0a1120;--panel:#0e1628;--ink:#eef6fd;--soft:#b8cce3;--mist:#8299b5;--cyan:#00c8f0;--cyan-hi:#9df2ff;
--line:rgba(0,200,240,.14);--hair:rgba(232,242,252,.08);--jade:#46e3c2;--verm:#e8453a;
--sans:-apple-system,"SF Pro Text","Segoe UI",system-ui,sans-serif;--mono:"SF Mono",ui-monospace,Menlo,Consolas,monospace}
*{box-sizing:border-box}
html{background:var(--void);scroll-behavior:smooth}
body{margin:0;color:var(--soft);font:15px/1.55 var(--sans);background-color:var(--void);
background-image:linear-gradient(rgba(0,200,240,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,240,.035) 1px,transparent 1px);
background-size:48px 48px}
a{color:var(--cyan-hi)}
h1,h2,h3,h4{color:var(--ink);font-weight:650;letter-spacing:-.01em;line-height:1.25}
h3{font-size:17px;margin:6px 0 8px}
h4{font-size:13px;font-family:var(--mono);color:var(--mist);font-weight:500;margin:0 0 6px}
p{margin:0 0 8px}
ul,ol{margin:0;padding:0}
code{font:12.5px var(--mono);color:var(--cyan-hi);background:#06121f;padding:1px 4px;border-radius:3px}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}
.top{position:sticky;top:0;z-index:20;background:rgba(10,17,32,.9);backdrop-filter:blur(8px);border-bottom:1px solid rgba(0,200,240,.35)}
.top .wrap{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-top:10px;padding-bottom:10px;flex-wrap:wrap}
.mark{display:flex;align-items:center;gap:10px;color:var(--ink);font-weight:600}
.mono-box{width:28px;height:28px;border:1px solid var(--cyan);color:var(--cyan);display:grid;place-items:center;font:600 13px var(--mono)}
.topnav{display:flex;gap:16px;flex-wrap:wrap;font-size:14px}
.topnav a{color:var(--soft);text-decoration:none}
.topnav a:hover{color:var(--cyan-hi)}
.hero{padding-top:40px}
.hero h1{font-size:32px;margin:0 0 12px;max-width:24ch}
.deck{font-size:17px;color:var(--soft);max-width:70ch;margin:0}
.sec{padding:56px 0 8px;scroll-margin-top:60px}
.sec-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-bottom:14px;border-bottom:1px solid var(--hair);margin-bottom:24px}
.num{font:600 13px var(--mono);color:var(--cyan)}
.chip{background:var(--cyan);color:var(--void);font-weight:600;font-size:13px;padding:6px 11px;border-radius:999px;line-height:1}
.sec-head h2{margin:0;font-size:22px;flex:1 1 320px}
.sub-deck{color:var(--soft);margin:-8px 0 20px;max-width:72ch}
.lab{font:12px var(--mono);color:var(--mist);margin-right:4px}
.pr{font:600 12px var(--mono);color:var(--cyan-hi);background:#06121f;border:1px solid rgba(0,200,240,.3);padding:0 5px;border-radius:3px;white-space:nowrap}
/* next moves track */
.track{list-style:none;display:grid;grid-template-columns:repeat(5,minmax(0,1fr))}
.track li{position:relative;padding:0 18px 0 0}
.track li::before{content:"";position:absolute;left:32px;right:0;top:15px;height:1px;background:rgba(0,200,240,.45)}
.track li:last-child::before{display:none}
.step{position:relative;display:grid;place-items:center;width:32px;height:32px;border:1px solid var(--cyan);border-radius:50%;background:var(--void);color:var(--cyan-hi);font:600 14px var(--mono);margin-bottom:14px}
.track h3{font-size:16px;margin-top:0}
.track .needs,.track .unb{font-size:14px;color:var(--soft)}
.track .done{font-size:14px;color:var(--ink);border-left:2px solid var(--cyan);padding-left:10px;margin:10px 0}
.track .pr-line{margin-bottom:8px}
/* merge */
.states{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:start}
.state{background:var(--panel);border:1px solid var(--line);padding:18px 18px 16px}
.step-tag{font:600 12px var(--mono);color:var(--cyan);margin:0 0 4px;text-transform:none}
.state h3{font-size:16px;color:var(--soft);font-weight:500;margin:0 0 12px}
.flow{display:block;width:100%;max-width:330px;height:auto}
.flow .ft{font:600 13px var(--sans);fill:var(--ink)}
.flow .fd{font:12px var(--sans);fill:var(--soft)}
.flow .fl{font:12px var(--sans);fill:var(--mist)}
.mech{margin:14px 0 0;font-size:14px;color:var(--soft);border-left:2px solid var(--cyan);padding-left:10px}
.mech .lab{display:block;margin:0 0 4px}
/* roadmap */
.legend{display:flex;flex-wrap:wrap;gap:8px 22px;font-size:14px;margin:0 0 14px;color:var(--soft)}
.legend span{display:inline-flex;align-items:center;gap:8px}
.lg-hot{width:22px;height:14px;border:2px solid var(--cyan-hi);border-radius:3px;display:inline-block}
.lg-mk{width:17px;height:17px;border-radius:50%;background:var(--void);border:1.5px solid var(--verm);color:#f7a79e;font:700 12px var(--sans);display:inline-grid;place-items:center}
.rm-svg{overflow-x:visible}
.rm{display:block;width:100%;max-width:1096px;height:auto}
.rm text{font-family:var(--sans)}
.rm .ax{font:12px var(--mono);fill:var(--mist)}
.rm .lane{font:600 13px var(--sans);fill:var(--ink)}
.rm .node rect{fill:var(--panel);stroke:#2b6f88;stroke-width:1}
.rm .node.crit rect{stroke:var(--cyan-hi);stroke-width:2}
.rm .rid{font:600 12px var(--mono);fill:var(--cyan-hi)}
.rm .rn{font:12px var(--sans);fill:var(--soft)}
.rm .edge{fill:none;stroke:#8299b5;stroke-width:1.1;opacity:.75}
.rm .edge.hot{stroke:var(--cyan-hi);stroke-width:2;opacity:1}
.rm .mk{fill:var(--void);stroke:var(--verm);stroke-width:1.5}
.rm .mkt{font:700 12px var(--sans);fill:#f7a79e}
.rm-list{display:none}
.lane-block{background:var(--panel);border:1px solid var(--line);padding:14px 16px;margin-bottom:12px}
.lane-block ul{list-style:none}
.lane-block li{padding:8px 0;border-top:1px solid var(--hair)}
.lane-block li p{margin:0}
.lane-block .meta{font-size:13px;color:var(--mist);margin-top:2px}
.cnt{font:12px var(--mono);color:var(--mist);margin-left:6px}
/* decisions */
.dgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.dcard{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--cyan);padding:16px 18px;scroll-margin-top:70px}
.dcard header{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.dn{font:600 12px var(--mono);color:var(--cyan);background:#06121f;padding:3px 8px;border-radius:999px}
.dblk{font:12px var(--mono);color:var(--verm)}
.dcard h3{font-size:17px;margin:4px 0 10px}
.dcard dl{margin:0}
.dcard dl>div{display:grid;grid-template-columns:140px 1fr;gap:10px;padding:6px 0;border-top:1px solid var(--hair);font-size:14px}
.dcard dt{font:12px var(--mono);color:var(--mist);padding-top:2px}
.dcard dd{margin:0;color:var(--soft)}
.dcard .ctx{font-size:13px;color:var(--mist);margin:8px 0 0}
.parked{margin-top:18px;background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--mist);padding:14px 18px}
.parked h3{margin-top:0}
/* screens */
.screen{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:22px;background:var(--panel);border:1px solid var(--line);padding:20px;margin-bottom:18px;scroll-margin-top:70px}
.scr-body h3{font-size:20px;margin:0 0 8px}
.verdict{font-size:16px;color:var(--ink);margin-bottom:12px}
.bar{display:flex;height:14px;gap:2px;margin:0 0 8px}
.bar span{display:block;height:100%}
.bar-legend{list-style:none;display:flex;flex-wrap:wrap;gap:6px 16px;font-size:14px;margin:0 0 16px;color:var(--soft)}
.bar-legend li{display:flex;align-items:center;gap:6px}
.bar-legend b{font:600 14px var(--mono);color:var(--ink)}
.sw{width:10px;height:10px;display:inline-block;border-radius:2px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px 20px}
.cols ul{list-style:none}
.cols li{font-size:14px;padding:4px 0 4px 12px;position:relative}
.cols li::before{content:"";position:absolute;left:0;top:11px;width:5px;height:5px;background:var(--cyan)}
.cols .block li::before{background:var(--verm)}
.cols p{font-size:14px;margin:0}
.start{font-size:14px;color:var(--ink)}
.shot{margin:0;position:relative}
.shot-open{display:block;line-height:0}
.shot img{display:block;width:100%;height:auto;border:1px solid var(--line)}
.shot figcaption{font-size:13px;color:var(--mist);margin-top:8px}
.shot .close{display:none}
.shot:target{position:fixed;inset:14px;z-index:50;background:rgba(10,17,32,.97);overflow:auto;padding:14px;border:1px solid var(--cyan)}
.shot:target img{width:100%;border:0}
.shot:target .close{display:inline-block;font-size:14px;margin-bottom:8px}
.shot:target .close::before{content:"Close. "}
.pending{aspect-ratio:1440/900;border:1px dashed rgba(0,200,240,.45);display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:8px;padding:20px;background:repeating-linear-gradient(135deg,rgba(0,200,240,.05) 0 10px,transparent 10px 20px)}
.pending b{font-size:16px;color:var(--ink)}
.pending span{font:13px var(--mono);color:var(--mist)}
/* tests */
.tbar{display:flex;height:22px;gap:2px;margin:0 0 8px}
.tbar span{display:block;height:100%}
.tlegend{list-style:none;display:flex;flex-wrap:wrap;gap:6px 22px;font-size:14px;margin:0 0 14px}
.tlegend li{display:flex;align-items:center;gap:6px}
.tline{font-size:14px;color:var(--soft);max-width:90ch}
/* footer */
.foot{margin-top:56px;padding:24px 0 48px;border-top:1px solid var(--hair);font-size:13px;color:var(--mist)}
.foot ul{list-style:none;margin:6px 0 0}
.foot li{margin-bottom:4px}
/* responsive */
@media (max-width:1179px){.rm-svg{display:none}.rm-list{display:block}}
@media (max-width:1000px){.states{grid-template-columns:1fr}}
@media (max-width:900px){
 .track{grid-template-columns:1fr}
 .track li{padding:0 0 22px 52px}
 .track li::before{left:15px;right:auto;top:32px;bottom:0;width:1px;height:auto}
 .track .step{position:absolute;left:0;top:0}
 .dgrid{grid-template-columns:1fr}
 .screen{grid-template-columns:1fr}
}
@media (max-width:640px){
 .wrap{padding:0 16px}
 .hero h1{font-size:26px}
 .cols{grid-template-columns:1fr}
 .dcard dl>div{grid-template-columns:1fr;gap:2px}
 .topnav{display:none}
 .sec-head h2{font-size:20px}
}
"""


def build():
    cards = []
    for name in ["cards-A.md", "cards-B.md", "cards-C.md"]:
        cards += parse_cards(name)
    assert len(cards) == 11, f"expected 11 screen cards, got {len(cards)}"
    for c, (prefix, sid) in zip(cards, SURFACES):
        assert c["title"].startswith(prefix), (c["title"], prefix)
        c["surface"] = sid
        assert c["ready"], f"no readiness line in {c['title']}"

    S = sections(read("story.md"))
    nxt = parse_next(S["1. Next moves"])
    assert len(nxt) == 5, f"expected 5 next moves, got {len(nxt)}"
    merge = parse_merge(S["2. The merge in three states"])
    rroad = S["3. Roadmap"]
    rows = parse_roadmap(rroad)
    dep = depths(rows)
    ids = {r["id"] for r in rows}
    assert len(ids) == len(rows) == 31, f"expected 31 PRs, got {len(rows)}"
    for r in rows:
        assert set(r["deps"]) <= ids, f"unknown dependency in {r['id']}"
    plan_ids = set(re.findall(r"\((PR-[\w]+)\)\s*$", PLAN.read_text(encoding="utf-8"), re.M)) if PLAN.exists() else None
    if plan_ids is not None:
        missing = ids - plan_ids
        assert not missing, f"PR ids not in PLAN.md: {missing}"
    for n in nxt:
        assert n["pr"] in ids, f"next move {n['pr']} not in roadmap"
    cm = re.search(r"Critical path to the first wired screen: ([^.]*)\.", rroad)
    crit = set(PR_ANY.findall(cm.group(1))) if cm else set()
    decs, parked = parse_decisions(S["4. Your decisions"])
    assert [d["n"] for d in decs] == list(range(1, 19)), "decision numbering changed"
    tests = parse_tests(S["5. Tests in one line"])
    shots, shot_notes = load_shots()

    n_blocked = sum(1 for r in rows if r["decisions"])
    n_dec = len(decs)
    tot = {k: sum(c["ready"].get(k, 0) for c in cards) for k, _, _ in WORDS}

    hero = (f'<section class="hero wrap"><h1>Vari8: what to do next</h1>'
            f'<p class="deck">The two apps now sit in one repository, and nothing connects them yet. '
            f'Five moves come first. {n_blocked} of {len(rows)} pieces of work wait on at least one of the {n_dec} '
            f'decisions only you can make, listed in section 04.</p></section>')
    nav = ('<nav class="topnav"><a href="#next">Next moves</a><a href="#merge">The merge</a><a href="#roadmap">Roadmap</a>'
           '<a href="#decisions">Decisions</a><a href="#screens">Screens</a><a href="#tests">Tests</a></nav>')
    top = (f'<header class="top"><div class="wrap"><div class="mark"><span class="mono-box">N</span>'
           f'<span>Nexus Link</span></div>{nav}<span class="mono">Vari8 developer briefing</span></div></header>')

    s_next = sec_html("01", "Next moves", "Five moves, in this order", next_html(nxt), "next")

    s_merge = sec_html("02", "The merge", "Two apps share a repository. Nothing connects them yet.",
                       f'<p class="sub-deck">Read left to right. Before, the apps were apart. Now they sit in one tree. '
                       f'After, every screen goes through one server path.</p>' + merge_html(merge), "merge")

    lane_counts = {l: sum(1 for r in rows if r["lane"] == l) for l in LANES}
    legend = ('<div class="legend"><span><i class="lg-hot"></i>Critical path to the first wired screen</span>'
              '<span><i class="lg-mk">2</i>Waits on that decision (links to it)</span>'
              '<span>Arrows point from a piece of work to the one that needs it</span></div>')
    road_intro = (f'<p class="sub-deck">Each column is one step in the order of work. Nothing in a column starts before '
                  f'everything in the column to its left that it depends on. Decision 1 blocks all {len(rows)} pieces until the plan is approved.</p>')
    s_road = sec_html("03", "Roadmap", f"{len(rows)} pieces of work in six lanes, read left to right",
                      road_intro + legend +
                      f'<div class="rm-svg">{roadmap_svg(rows, dep, crit)}</div>'
                      f'<div class="rm-list">{rm_list(rows, dep, LANES)}</div>', "roadmap")

    dcards = "".join(decision_card(d, len(rows) if d["n"] == 1 else sum(1 for r in rows if d["n"] in r["decisions"])) for d in decs)
    parked_html = (f'<aside class="parked"><h3>Parked, no decision needed now</h3><p>{inline(parked)}</p></aside>') if parked else ""
    s_dec = sec_html("04", "Your decisions", f"{n_dec} decisions, most blocking first",
                     '<p class="sub-deck">The default is what happens if you say nothing. Each card names what waits on it.</p>'
                     f'<div class="dgrid">{dcards}</div>{parked_html}', "decisions")

    scards = "".join(screen_card(i, c, shots.get(c["surface"], [])) for i, c in enumerate(cards, 1))
    totline = " · ".join(f"{tot[k]} {lab.lower()}" for k, lab, _ in WORDS)
    s_screens = sec_html("05", "Screens", f"{len(cards)} screens, and how far each is from working",
                         f'<p class="sub-deck">Across all screens: {totline}. Each bar counts the matrix rows for that screen, in five plain words.</p>'
                         + scards, "screens")

    tb = [("keep", "Keep as they are", tests["keep"], "#00c8f0"), ("trim", "Trim", tests["trim"], "#2f64c8"),
          ("cut", f"Cut in {tests['cut_pr']}", tests["cut"], "#8299b5"), ("wait", "Wait for a replacement", tests["wait"], "#9df2ff")]
    tbar = "".join(f'<span style="width:{n / tests["total"] * 100:.2f}%;background:{col}"></span>' for _, _, n, col in tb)
    tleg = "".join(f'<li><i class="sw" style="background:{col}"></i>{lab} <b class="mono">{n}</b></li>' for _, lab, n, col in tb)
    s_tests = sec_html("06", "Tests", f"{tests['cut']} test files are cut in {tests['cut_pr']}; {tests['wait']} wait for replacements",
                       f'<div class="tbar" role="img" aria-label="{tests["total"]} test files">{tbar}</div>'
                       f'<ul class="tlegend">{tleg}</ul><p class="tline">{inline(tests["text"])}</p>', "tests")

    notes = " ".join(f"<li>{esc(n)}</li>" for n in shot_notes) if shot_notes else ""
    foot = (f'<footer class="foot wrap"><p>Built from story.md (next moves, merge, roadmap, decisions, tests), '
            f'cards-A.md, cards-B.md and cards-C.md (screens), and shots/index.json (screenshots). Plan: '
            f'icm/03-plan/output/PLAN.md and icm/03-plan/DECISIONS.md. Tests: icm/03-plan/output/TEST-AUDIT.md. '
            f'Per-screen detail: icm/02-gap-matrix/output/F1/.</p>'
            f'<p><a href="{GAP_PAGE}">Full list of matrix rows (the old gap matrix page)</a></p>'
            f'{"<ul>" + notes + "</ul>" if notes else ""}</footer>')

    page = (f'<!doctype html><html lang="en"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width, initial-scale=1">'
            f'<title>Vari8 developer briefing</title><style>{CSS}</style></head><body>'
            f'{top}{hero}{s_next}{s_merge}{s_road}{s_dec}{s_screens}{s_tests}{foot}</body></html>')
    assert "\u2014" not in page and "\u2013" not in page, "long dash in output"
    OUT.write_text(page, encoding="utf-8")

    # self-check summary
    print(f"wrote {OUT.name}: {len(page)//1024} KB")
    print(f"screens {len(cards)}, next moves {len(nxt)}, PRs {len(rows)} (blocked by a decision: {n_blocked}), decisions {n_dec}")
    for c in cards:
        print(f"  {c['surface']} {c['title'][:40]:40s} ready={sum(c['ready'].values()):3d} shots={len(shots.get(c['surface'], []))}")
    print("shots:", "none yet" if not shots else sum(len(v) for v in shots.values()), shot_notes or "")
    loose = re.compile(r"\b(S\d{2}|R\d-\d+|V\d-\w+)\b|\bQ\d+\b|\bD\d+\b")
    for c in cards:
        for field in ["verdict", "works", "work"]:
            v = c[field] if isinstance(c[field], str) else " ".join(c[field])
            if loose.search(v):
                print(f"  internal id in {c['title'][:30]} {field}: {loose.findall(v)}")
    if MATRIX.exists():
        m = json.loads(MATRIX.read_text(encoding="utf-8"))
        n_rows = len(m.get("rows", [])) if isinstance(m, dict) else len(m)
        print(f"matrix rows: {n_rows}")


if __name__ == "__main__":
    build()
