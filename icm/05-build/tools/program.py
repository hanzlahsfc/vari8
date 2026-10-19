"""Generate PLAN v2, cards, coverage ledger, graph and timeline from program_data.py.

Run from anywhere: python3 /home/nexuslink/vari8-worktrees/beta/icm/05-build/tools/program.py
Exit code 0 only when every hard gate holds (zero unmapped ledger rows, no cycles,
every PR has a build, verify and merge card, every verifier differs from its builder).
"""
import csv
import json
import os
import re
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from program_data import (BETA, BUILDER_MODEL, DECISION_CARDS, GATES, GEAR, HERMES, LIVE_ROLES, MODELS, PARKED,  # noqa: E402
                          PRS, UI_EXTRA, WORKER_SKILLS, WT)

ICM = f"{BETA}/icm"
OUT = f"{ICM}/05-build"
SHOTS = json.load(open(f"{ICM}/04-briefing/shots/index.json"))["shots"]
SHOT_FILES = [s["file"] for s in SHOTS]
PR_BY_ID = {p["id"]: p for p in PRS}
problems = []

# ---------- matrix rows ----------
MATRIX = open(f"{ICM}/02-gap-matrix/output/GAP-MATRIX.md").read().split("\n")
STATUSES = {"UNWIRED", "UNCONFIGURED", "PARTIAL", "MISSING", "CONFLICT", "ROLES"}


def section(lines, start_prefix, end_prefix):
    s = next(i for i, l in enumerate(lines) if l.startswith(start_prefix))
    e = next(i for i, l in enumerate(lines) if i > s and l.startswith(end_prefix))
    return lines[s:e]


matrix_rows = []
surface = None
for line in section(MATRIX, "## Non-WIRED elements by surface", "## CONFLICT rows"):
    m = re.match(r"### (S\d\d) surface", line)
    if m:
        surface = m.group(1)
        continue
    if line.startswith("| ") and not line.startswith("| Row"):
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells[1] in STATUSES:
            matrix_rows.append(dict(id=cells[0], surface=surface, status=cells[1], element=cells[2]))
seen = {r["id"] for r in matrix_rows}
for line in section(MATRIX, "## ROLES decision rows", "## Parked"):
    if line.startswith("| R3-"):
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells[0] not in seen:
            matrix_rows.append(dict(id=cells[0], surface="ROLES", status="ROLES", element=cells[4]))
orphans = []
for line in section(MATRIX, "## ORPHANS", "## Action mapping"):
    m = re.match(r"- (S12-\d\d|R3-\d+)(?: \((G6-\d+)\))? (.*)$", line)
    if m:
        orphans.append(dict(id=m.group(1), element=m.group(3)))

DEFAULT_OWNER = {"S01": "PR-W2", "S02": "PR-MSG", "S03": "PR-W6", "S04": "PR-W5", "S05": "PR-W3", "S06": "PR-W7",
                 "S07": "PR-W8", "S08": "PR-W9", "S09": "PR-W4", "S10": "PR-W10", "S11": "PR-05", "ROLES": "PR-05"}
OVERRIDE = {}


def own(task, *ids):
    for i in ids:
        OVERRIDE[i] = task


own("PR-01", "S01-01", "S01-02", "S01-03", "S01-05", "S01-07", "S01-08", "S01-09", "S01-12", "S01-41", "R3-1",
    "S10-04", "S10-11", "S10-12", "S10-13", "S10-21", "S11-01", "S11-02", "S11-03")
own("PR-MSG", "S01-04", "S01-30", "S01-38", "S03-20", "S11-13", "S11-14")
own("PR-W10", "S01-06", "S01-10", "S01-31", "S01-32", "S01-40", "S02-17", "S02-18", "S02-19", "S02-20", "S02-21", "S02-22",
    "S02-23", "V3-L1-CoachTask", "V3-L1-ClientNote", "S11-09", "S11-10", "S11-12", "S11-22")
own("PR-W0", "V3-L1-CoachState")
own("PR-R1", "S01-13")
own("PR-SV4", "S01-20", "S11-16", "S11-17")
own("PR-W3", "S01-26", "S01-27", "S01-36", "S04-09", "S11-07", "S11-08", "S11-27")
own("PR-W6", "S01-28", "S01-29", "S01-34", "S01-37", "V2-WS04", "S11-20")
own("PR-W8", "S01-39", "V3-CP12")
own("PR-MEDIA", "S02-08", "S02-24", "S02-25", "V1-X2", "V3-L1-Media")
own("PR-W9", "S04-13", "S05-10", "S07-21", "S10-14", "S10-15", "S10-16", "S10-17")
own("PR-M0", "V3-L1-Plan", "V3-L1-ClientPlans", "V3-L1-IIFYM", "V3-L1-ClientGoal")
own("PR-M5", "V3-L1-PlanVersion", "V3-L1-PlanLifecycle")
own("PR-M6", "V3-L1-TrainingSet", "V3-L1-TrainingPlan", "V3-L1-Exercise")
own("PR-W7", "V3-CO02", "S10-20")
own("PR-W4", "S07-17", "S07-18", "S10-18", "S11-19")
own("PR-W5", "S07-19")
own("PR-W2", "S10-19", "S11-05", "S11-06", "S11-11", "S11-15", "S11-21")
own("PR-04", "S08-37", "V3-H4-04", "V3-H4-02")
own("PR-W1", "S11-04", "S11-18")
own("PR-05", "V2-H5", "V2-H12", "V3-CO01")

ORPHAN_OWNER = {}
for i in list(range(1, 8)) + list(range(34, 43)) + list(range(66, 72)) + [72]:
    ORPHAN_OWNER[f"S12-{i:02d}"] = ("PR-05", "keep or replace per D16a; covered by the roles test")
for i in [8, 9] + list(range(44, 54)):
    ORPHAN_OWNER[f"S12-{i:02d}"] = ("PR-R1", "delete when the census shows no runtime caller (D33)")
for i in [10, 11, 12]:
    ORPHAN_OWNER[f"S12-{i:02d}"] = ("PR-R1", "old UI page, delete after the canvas screen is wired (D33)")
for i in [13, 14, 15, 16] + list(range(59, 66)):
    ORPHAN_OWNER[f"S12-{i:02d}"] = ("PR-W2", "keep; serves the canvas onboarding tab")
for i in list(range(17, 22)) + [23, 24] + list(range(25, 33)):
    ORPHAN_OWNER[f"S12-{i:02d}"] = ("PR-R2", "model census: keep if read, drop if not (D33, D34)")
for i in [22, 41, 54, 55, 56]:
    ORPHAN_OWNER[f"S12-{i:02d}"] = ("PR-04", "parked behind ENABLE_CONSENT_GATES, not extended (D19)")
ORPHAN_OWNER["S12-33"] = ("PR-M3", "keep; structural audit for notes, tasks and messages")
ORPHAN_OWNER["S12-43"] = ("PR-R1", "keep; Prisma singleton")
ORPHAN_OWNER["S12-57"] = ("PR-04", "keep; run by db:fresh")
ORPHAN_OWNER["S12-58"] = ("PR-04", "keep; run by db:fresh")
ORPHAN_OWNER["S12-73"] = ("PR-SV4", "keep; routed from the roster")
ORPHAN_OWNER["S12-74"] = ("PR-SV4", "keep; invite acceptance")
ORPHAN_OWNER["S12-75"] = ("PR-R3", "delete with the sheet viewer (D33)")
ORPHAN_OWNER["S12-76"] = ("PR-R3", "collapse into product (D33)")
for rid in ["R3-16", "R3-17", "R3-18", "R3-20", "R3-21", "R3-22"]:
    ORPHAN_OWNER[rid] = ("PR-R1", "census then delete or keep (D33); R3-17 is the D23 open risk")

# ---------- TEST-AUDIT actions ----------
TA = open(f"{ICM}/03-plan/output/TEST-AUDIT.md").read().split("\n")
ta_actions = []
for line in section(TA, "## Per-file action list", "## GUARD inventory"):
    m = re.match(r"- `([^`]+)`: (.*)$", line)
    if m:
        ta_actions.append(dict(path=m.group(1), action=m.group(2)))
ta_rewire = []
for line in section(TA, "## Delayed replacement", "## Pass-2 block decisions"):
    m = re.match(r"- `([^`]+)`: (REWIRE.*)$", line)
    if m:
        ta_rewire.append(dict(path=m.group(1), action=m.group(2)))


def ta_owner(action):
    a = action
    tasks = []
    if "in PR-03" in a or a.startswith("KEEP-ALL") or a.startswith("TRIM"):
        tasks.append("PR-T1")
    if "PR-04" in a:
        tasks.append("PR-T2")
    if "PR-05" in a:
        tasks.append("PR-05")
    if "PR-W4" in a:
        tasks.append("PR-W4")
    if not tasks:
        return None, []
    if a.startswith("CUT-AT-REPLACE in PR-05"):
        return "PR-05", []
    if a.startswith("CUT-AT-REPLACE in PR-04"):
        return "PR-T2", []
    return tasks[0], tasks[1:]


# ---------- cards ----------
cards = []  # each: key, kind, pr, slug, title, who, parents(keys), est, body, model, provider, skills, runtime, port, db


def norm(pid):
    return re.sub(r"[^a-z0-9]", "", pid.lower())


def screens_of(p):
    s = p.get("screens", [])
    return SHOT_FILES if s == ["ALL"] else s


PORT = {"base": 3700}


def next_port():
    PORT["base"] += 1
    return PORT["base"]


def rel(path):
    return path.replace(BETA + "/", "")


def gear_block(p):
    if p["who"] != "yamato":
        return ""
    g = p["gear"]
    skills = [f"`{HERMES}/profiles/{g}/skills/{s}/SKILL.md`" for s in GEAR[g]]
    if p["track"] == "Wiring" and p["id"] not in ("PR-W0", "PR-MEDIA"):
        skills += [f"`{HERMES}/profiles/zenitsu/skills/{s}/SKILL.md`" for s in UI_EXTRA]
    return (f"## Gear (Devin loads this first)\n\nLoad `{HERMES}/profiles/{g}/SOUL.md` as your working persona "
            f"(drop the persona voice in files you write) and read these skills:\n\n" + "\n".join(f"- {s}" for s in skills) + "\n")


def ledger_rows_for(pid):
    return [r for r in LEDGER if r["owner"] == pid and r["kind"] in ("matrix", "parked")]


LEDGER = []


def build_ledger():
    for r in matrix_rows:
        owner = OVERRIDE.get(r["id"], DEFAULT_OWNER.get(r["surface"]))
        LEDGER.append(dict(kind="matrix", id=r["id"], detail=f'{r["surface"]} {r["status"]}: {r["element"][:140]}', owner=owner))
    for o in orphans:
        owner, disp = ORPHAN_OWNER.get(o["id"], (None, ""))
        LEDGER.append(dict(kind="orphan", id=o["id"], detail=f'{o["element"][:110]} ({disp})', owner=owner))
    for pid, old, what, owner in PARKED:
        LEDGER.append(dict(kind="parked", id=pid, detail=f"{old}: {what}", owner=owner))
    for s in SHOTS:
        owner = next((p["id"] for p in PRS if s["file"] in p.get("screens", []) and p["track"] in ("Wiring",)
                      and p["id"] not in ("PR-W0",)), None)
        LEDGER.append(dict(kind="screen", id=s["file"], detail=f'{s["surface"]} {s["screen"]} ({s["route"]})', owner=owner))
    for t in ta_actions:
        owner, extra = ta_owner(t["action"])
        LEDGER.append(dict(kind="test-audit", id=t["path"], detail=t["action"][:160], owner=owner, also=extra))
    for t in ta_rewire:
        LEDGER.append(dict(kind="test-rewire", id=t["path"], detail=t["action"][:160], owner="PR-05"))
    for p in PRS:
        LEDGER.append(dict(kind="plan-pr", id=p["id"], detail=p["title"], owner=p["id"]))
    for d in DECISION_CARDS + GATES:
        LEDGER.append(dict(kind="program", id=d["id"], detail=d["title"], owner=d["id"]))


build_ledger()


def verification_for(row):
    o = row["owner"]
    p = PR_BY_ID.get(o)
    if row["kind"] == "screen":
        return f"D32 parity diff 1440x900 and 390x844 in {o} and PR-01 (before vs after) plus the live flow"
    if row["kind"] in ("test-audit", "test-rewire"):
        return "file state matches the action after the PR; kept suites pass in verify-local.sh"
    if row["kind"] == "plan-pr" or row["kind"] == "program":
        return "verifier card PASS at the exact head plus merge card integration check"
    if row["kind"] == "orphan":
        return "census output committed in the PR report; full local gate"
    if o == "PR-05":
        return "roles-matrix.test.ts (every actor x capability) plus the live role matrix"
    if o == "PR-04":
        return "fresh-database sign-in and flag checks in the live lane"
    if p and p["track"] == "Model":
        return "keep-category behavior test plus round trip through the wiring PR"
    if p and p["track"] == "Service":
        return "isolation or calculation test plus the live read in the wiring PR"
    if p and screens_of(p):
        sc = [s for s in screens_of(p)]
        return f"live flow at 1440 and 390 plus D32 parity on {len(sc)} screen(s)"
    return "live flow at 1440 and 390"


def card_key(pid, kind):
    return f"{pid}:{kind}"


def pr_card_bodies(p):
    pid = p["id"]
    slug = p["slug"]
    rows = ledger_rows_for(pid)
    tas = [r for r in LEDGER if r["kind"] in ("test-audit", "test-rewire") and r["owner"] == pid]
    orph = [r for r in LEDGER if r["kind"] == "orphan" and r["owner"] == pid]
    scr = screens_of(p)
    dbname = f"app_{norm(pid)}"
    port = next_port()
    vport = next_port()
    mport = next_port()
    schema_ok = "yes (D34 schema writer)" if p.get("schema") else "no; the local check fails if `db/` changes"
    deps = ", ".join(p["deps"]) or "none"
    rows_txt = "\n".join(f"- {r['id']}: {r['detail']}" for r in rows) or "- none (foundation or tooling PR)"
    orph_txt = "\n".join(f"- {r['id']}: {r['detail']}" for r in orph)
    ta_txt = "\n".join(f"- `{r['id']}`: {r['detail']}" for r in tas)
    scr_txt = ", ".join(f"`{s}`" for s in scr) if scr else "none"
    common = f"""## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `{pid}` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

{rows_txt}
"""
    if orph_txt:
        common += f"\n## Backend orphans this PR disposes\n\n{orph_txt}\n"
    if ta_txt:
        common += f"\n## TEST-AUDIT actions this PR executes\n\n{ta_txt}\n"
    files_txt = "\n".join(f"- `{f}`" if not " " in f else f"- {f}" for f in p["files"])
    build_txt = "\n".join(f"- {b}" for b in p["build"])
    see_txt = "\n".join(f"- {s}" for s in p["see"])
    devin = p["who"] == "yamato"
    launch = (f"cd {WT}/{slug} && {rel(OUT)}/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap "
              f"devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/{slug}.md")
    driver = ""
    if devin:
        driver = f"""## Driver steps (yamato only; Devin skips this section)

1. `cd {WT}/{slug} && git merge --ff-only Vari8-Beta` (the branch may have been created at an older tip). Stop and block the card if it is not a fast-forward.
2. Launch Devin and block until it exits: `{launch} > {WT}/{slug}.devin.log 2>&1`
3. Run the local gate: `BASE_SHA=$(git merge-base HEAD Vari8-Beta) LANE_DB={dbname} LANE_PORT={port} CARD={pid} icm/05-build/tools/verify-local.sh > {WT}/{slug}.check.log 2>&1`; record the exit code.
4. Attach `{slug}.devin.log`, `{slug}.check.log` and `icm/05-build/reports/{slug}.md` to the card (`hermes kanban attach`). Complete the card with the head SHA and the gate exit code; block it with the failing step if the gate failed after one repair round by Devin.
"""
    else:
        driver = f"""## Worktree step 0

`cd {WT}/{slug} && git merge --ff-only Vari8-Beta`. Stop and block the card if it is not a fast-forward.
"""
    build = f"""# {pid} build: {p['title']}

Card slug `{slug}`. Board `vari8`. Track {p['track']}. Depends on {deps}. Builder: {'Devin swe-2-max driven by yamato' if devin else p['who'] + ' (ds4f)'}.
Worktree `{WT}/{slug}`, branch `beta/{slug}` off `Vari8-Beta`. Never push. Never edit `docs/STATUS.md` (shared state; the merge card records status). Lane database `{dbname}` on 127.0.0.1:5433 user `app`; dev port {port}. May touch `db/`: {schema_ok}.

{driver}
{gear_block(p)}
{common}
## Files

{files_txt}

## Build

{build_txt}

## Acceptance (you see)

{see_txt}

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard).
- Live: start the app on port {port} against `{dbname}` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots to `icm/05-build/evidence/{slug}/`.
- Parity (D32) on: {scr_txt}. Command: `npm run parity:check -- --base-url http://127.0.0.1:{port} --screens <files>` once PR-P1 has landed.
- Unit (D11, D14): {p['unit']}

## Report

Write `icm/05-build/reports/{slug}.md`: head SHA, changed paths, every command with its exit code, screenshots, parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
"""
    vslug = f"{slug}-verify"
    vdb = f"app_verify_{norm(pid)}"
    verify = f"""# {pid} verify: {p['title']}

Card slug `{vslug}`. Independent verifier (different model than the builder). You never edit product code. Worktree `{WT}/{vslug}`, branch `beta/{vslug}`.

## Steps

1. `cd {WT}/{vslug} && git merge --ff-only beta/{slug} && git merge --no-ff --no-edit Vari8-Beta`. On a conflict: `git merge --abort`, block this card with reason `conflict: <paths>` and stop; the merge lead resolves it in the builder worktree.
2. `mkdir -p icm/05-build/evidence/{slug} && BASE_SHA=$(git rev-parse Vari8-Beta) LANE_DB={vdb} LANE_PORT={vport} CARD={pid} icm/05-build/tools/verify-local.sh > icm/05-build/evidence/{slug}/verify-local.log 2>&1; echo EXIT=$?`. Paste the exit code.
3. Live receipt at the exact head: start the app on port {vport} with a fresh `{vdb}` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: {LIVE_ROLES}. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `evidence/{slug}/<role>-<width>.png`.
4. Parity (D32) on {scr_txt}: run the harness against your server and commit the report and diff images under `icm/05-build/evidence/{slug}/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Commit the evidence with an explicit pathspec (`git add -- icm/05-build/evidence/{slug}`), complete the card with `PASS <head sha>` or block it with `FAIL` and the findings for the builder.

## Acceptance to check

{see_txt}

{common}
"""
    mslug = f"{slug}-merge"
    merge = f"""# {pid} merge: integrate into Vari8-Beta

Card slug `{mslug}`. Integration lead. Worktree `{WT}/{mslug}`, branch `beta/{mslug}`.

1. Confirm every verifier card of {pid} completed with PASS at the same head SHA.
2. `cd {WT}/{mslug} && icm/05-build/tools/integrate.sh beta/{vslug} {pid}`. The script takes the integration lock, merges the verified branch on top of the current `Vari8-Beta`, re-runs the fast gate (typecheck, lint, unit, build) on port {mport} with `app_merge_{norm(pid)}`, and fast-forwards `Vari8-Beta` only when it passes.
3. On a conflict: resolve it in this worktree (format-only hunks: take either side and re-run `npm run format`), re-run step 2. A conflict in product logic goes back to the builder card as `request-changes`.
4. Append one line to `icm/05-build/BLACKBOARD.md` log (time, {pid}, merged SHA) inside the same lock, as the script does.
5. Never push.
"""
    return build, verify, merge, dict(port=port, vport=vport, mport=mport, db=dbname, vdb=vdb)


def add_card(key, kind, pr, slug, title, who, parents, est, body, runtime, extra=None):
    model, provider = MODELS.get(who, (None, None)) if who else (None, None)
    cards.append(dict(key=key, kind=kind, pr=pr, slug=slug, title=title, who=who, parents=parents, est=est, body=body,
                      model=model, provider=provider, skills=WORKER_SKILLS.get(who, []), runtime=runtime, **(extra or {})))


def merge_key(dep):
    if dep in PR_BY_ID:
        return card_key(dep, "merge")
    return card_key(dep, "decision")


for d in DECISION_CARDS:
    add_card(card_key(d["id"], "decision"), "decision", d["id"], d["slug"], f'{d["id"]}: {d["title"]}', d["who"],
             [card_key(x, "decision") for x in d["deps"]], d["est"],
             f'# {d["id"]}: {d["title"]}\n\nWorktree `{WT}/{d["slug"]}`, branch `beta/{d["slug"]}`. Step 0: `git merge --ff-only Vari8-Beta`.\n\n{d["body"]}\n',
             "30m", dict(ext=d.get("ext", False)))

for p in PRS:
    b, v, m, ports = pr_card_bodies(p)
    parents = [merge_key(d) for d in p["deps"]]
    rt = f'{max(30, int(p["est"] * 1.5))}m' if p["est"] else "3h"
    add_card(card_key(p["id"], "build"), "build", p["id"], p["slug"], f'{p["id"]} build: {p["title"]}', p["who"], parents,
             p["est"], b, rt, dict(ext=p.get("ext", False), **ports))
    vparents = [card_key(p["id"], "build")]
    vest = 30 if screens_of(p) == SHOT_FILES else 20
    add_card(card_key(p["id"], "verify"), "verify", p["id"], f'{p["slug"]}-verify', f'{p["id"]} verify', "neji", vparents,
             vest, v, "45m", ports)
    mparents = [card_key(p["id"], "verify")]
    if p.get("sec"):
        sbody = v.replace(f'# {p["id"]} verify', f'# {p["id"]} security verify').replace(f'{p["slug"]}-verify', f'{p["slug"]}-secverify') + \
            "\n## Security focus\n\nRun the security diff scan on the PR diff: authorization on every new route (D15 table), trust-boundary validation, token and upload handling, secrets in code or logs, audit metadata free of bodies. Findings rated by severity with file and line.\n"
        add_card(card_key(p["id"], "secverify"), "verify", p["id"], f'{p["slug"]}-secverify', f'{p["id"]} security verify', "shinobu",
                 vparents, 20, sbody, "45m", ports)
        mparents.append(card_key(p["id"], "secverify"))
    add_card(card_key(p["id"], "merge"), "merge", p["id"], f'{p["slug"]}-merge', f'{p["id"]} merge', "kakashi", mparents, 10, m, "30m", ports)

for g in GATES:
    parents = [merge_key(d) if d in PR_BY_ID else card_key(d, "gate") for d in g["deps"]]
    if g["id"] == "GATE-PRR":
        parents = [card_key(p["id"], "merge") for p in PRS]
    body = (f'# {g["id"]}: {g["title"]}\n\nWorktree `{WT}/{g["slug"]}`, branch `beta/{g["slug"]}`. Step 0: `git merge --ff-only Vari8-Beta`.\n\n')
    if g["id"] == "GATE-PRR":
        body += ("Run the `production-readiness-checklist` skill against the integrated `Vari8-Beta` tip: full `verify-local.sh`, a fresh-clone setup per `docs/setup.md`, "
                 "parity on all 35 screens at both widths, the live role matrix, the security doc against `lib/auth/roles.ts`, the D19 parked list, open risks. "
                 "Write `icm/05-build/reports/gate-prr.md` with READY, REPAIR or BLOCKED per item and commit it with an explicit pathspec. REPAIR items become new cards via the program lead.\n")
    else:
        body += ("Judge the integrated branch once: read `icm/05-build/reports/gate-prr.md`, PLAN v2, the coverage ledger and the evidence tree. Attack the premise: is `Vari8-Beta` "
                 "a functional first beta that keeps the canvas exactly as it looks today? Write `icm/05-build/reports/gate-final.md` with SHIP or HOLD and the reasons, commit it with an explicit pathspec.\n")
    add_card(card_key(g["id"], "gate"), "gate", g["id"], g["slug"], g["title"], g["who"], parents, g["est"], body, "2h")

CARD_BY_KEY = {c["key"]: c for c in cards}


def ancestors(key, acc=None):
    acc = set() if acc is None else acc
    for pk in CARD_BY_KEY[key]["parents"]:
        if pk in CARD_BY_KEY and pk not in acc:
            acc.add(pk)
            ancestors(pk, acc)
    return acc


# Verifiers need the parity harness (screen PRs) and the dev seed (every live lane) on Vari8-Beta.
# Add the edge only where it is not already implied.
for p in PRS:
    if p["id"] in ("PR-02", "PR-P1", "PR-T1", "PR-04"):
        continue
    for kind in ("verify", "secverify"):
        v = CARD_BY_KEY.get(card_key(p["id"], kind))
        if not v:
            continue
        anc = ancestors(v["key"])
        needs = ["PR-04"] + (["PR-P1"] if screens_of(p) else [])
        for need in needs:
            mk = card_key(need, "merge")
            if mk not in anc:
                v["parents"].append(mk)

# ---------- hard gates ----------
for c in cards:
    for pk in c["parents"]:
        if pk not in CARD_BY_KEY:
            problems.append(f"{c['key']}: unknown parent {pk}")
# cycle check (Kahn)
indeg = {c["key"]: 0 for c in cards}
children = {c["key"]: [] for c in cards}
for c in cards:
    for pk in c["parents"]:
        if pk in indeg:
            indeg[c["key"]] += 1
            children[pk].append(c["key"])
queue = [k for k, v in indeg.items() if v == 0]
topo = []
while queue:
    k = queue.pop(0)
    topo.append(k)
    for ch in children[k]:
        indeg[ch] -= 1
        if indeg[ch] == 0:
            queue.append(ch)
if len(topo) != len(cards):
    problems.append(f"cycle: {len(cards) - len(topo)} cards unreachable in topological order")
for p in PRS:
    for kind in ("build", "verify", "merge"):
        if card_key(p["id"], kind) not in CARD_BY_KEY:
            problems.append(f"{p['id']}: missing {kind} card")
    b = CARD_BY_KEY[card_key(p["id"], "build")]
    bm = BUILDER_MODEL.get(b["who"], b["model"])
    for kind in ("verify", "secverify"):
        v = CARD_BY_KEY.get(card_key(p["id"], kind))
        if v and v["model"] == bm:
            problems.append(f"{p['id']}: verifier model equals builder model")
unmapped = [r for r in LEDGER if not r.get("owner")]
badowner = [r for r in LEDGER if r.get("owner") and r["owner"] not in PR_BY_ID and r["owner"] not in
            {d["id"] for d in DECISION_CARDS + GATES}]
for r in unmapped:
    problems.append(f"ledger unmapped: {r['kind']} {r['id']}")
for r in badowner:
    problems.append(f"ledger owner without card: {r['kind']} {r['id']} -> {r['owner']}")
counts = {}
for r in LEDGER:
    counts[r["kind"]] = counts.get(r["kind"], 0) + 1
if counts.get("matrix") != 338:
    problems.append(f"matrix rows {counts.get('matrix')} != 338")
if counts.get("screen") != 35:
    problems.append(f"screens {counts.get('screen')} != 35")
if counts.get("test-audit") != 232:
    problems.append(f"test-audit files {counts.get('test-audit')} != 232")

# ---------- timeline simulation ----------
T0 = datetime(2026, 10, 19, 3, 0)
DEVIN_CAP = 5
done_at = {}
start_at = {}
pending = {c["key"] for c in cards}
running = []  # (end, key)
now = T0
# Work already in flight: PR-02 Devin and the AUTH lane.
assumed = {card_key("PR-02", "build"): T0, card_key("DEC-AUTH", "decision"): datetime(2026, 10, 19, 2, 50)}
for k, t in assumed.items():
    done_at[k] = t
    start_at[k] = datetime(2026, 10, 19, 2, 6)
    pending.discard(k)


def is_devin(c):
    return c["kind"] == "build" and c["who"] == "yamato"


while pending:
    ready = [k for k in pending if all(pk in done_at and done_at[pk] <= now for pk in CARD_BY_KEY[k]["parents"])]
    ready.sort(key=lambda k: topo.index(k))
    for k in ready:
        c = CARD_BY_KEY[k]
        if is_devin(c) and sum(1 for e, rk in running if is_devin(CARD_BY_KEY[rk])) >= DEVIN_CAP:
            continue
        start_at[k] = now
        end = now + timedelta(minutes=c["est"])
        running.append((end, k))
        pending.discard(k)
    if not running:
        problems.append("timeline: deadlock")
        break
    running.sort()
    end, k = running.pop(0)
    now = max(now, end)
    done_at[k] = end
for e, k in running:
    done_at[k] = e
finish = max(done_at.values())

# ---------- outputs ----------
os.makedirs(f"{OUT}/cards", exist_ok=True)
for c in cards:
    open(f"{OUT}/cards/{c['slug']}.md", "w").write(c["body"])

with open(f"{OUT}/coverage-ledger.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["kind", "id", "detail", "owning_task", "contributing_tasks", "build_card", "verify_card", "verification_method"])
    for r in LEDGER:
        o = r["owner"]
        p = PR_BY_ID.get(o)
        contrib = ";".join(r.get("also", []) + ([d for d in p["deps"]] if p and r["kind"] == "matrix" else []))
        if p:
            bc, vc = p["slug"], p["slug"] + "-verify"
        else:
            d = next((x for x in DECISION_CARDS + GATES if x["id"] == o), None)
            bc, vc = (d["slug"], "") if d else ("", "")
        w.writerow([r["kind"], r["id"], r["detail"], o or "", contrib, bc, vc, verification_for(r)])

graph = dict(
    generated_by=rel(__file__),
    cards=[dict(key=c["key"], slug=c["slug"], kind=c["kind"], pr=c["pr"], title=c["title"], assignee=c["who"], model=c["model"],
                provider=c["provider"], parents=c["parents"], est_min=c["est"], max_runtime=c["runtime"], skills=c["skills"],
                external=c.get("ext", False), start=start_at.get(c["key"]).strftime("%H:%M") if start_at.get(c["key"]) else None,
                done=done_at.get(c["key"]).strftime("%d %H:%M") if done_at.get(c["key"]) else None,
                body_file=f"icm/05-build/cards/{c['slug']}.md", worktree=f"{WT}/{c['slug']}", branch=f"beta/{c['slug']}")
           for c in cards],
)
json.dump(graph, open(f"{OUT}/graph.json", "w"), indent=1)

# Summary for PROGRAM.md and the lead report
by_kind = {}
for c in cards:
    by_kind[c["kind"]] = by_kind.get(c["kind"], 0) + 1
summary = dict(cards=len(cards), by_kind=by_kind, ledger=counts, unmapped=len(unmapped), cycles=len(cards) - len(topo),
               finish=finish.strftime("%a %H:%M"), problems=problems,
               checkpoint=[(c["key"], done_at[c["key"]].strftime("%H:%M")) for c in cards
                           if c["key"] in done_at and done_at[c["key"]] <= datetime(2026, 10, 19, 5, 0)])
json.dump(summary, open(f"{OUT}/graph-summary.json", "w"), indent=1, default=str)

# Timeline table (merge completion per PR)
rows = []
for p in PRS:
    b = card_key(p["id"], "build")
    mk = card_key(p["id"], "merge")
    rows.append((done_at.get(mk), p["id"], start_at.get(b), done_at.get(mk), p["who"], p.get("gear") or "-"))
rows.sort(key=lambda r: r[0])
with open(f"{OUT}/timeline.md", "w") as f:
    f.write("| PR | Builder | Gear | Build starts | Merged by |\n| --- | --- | --- | --- | --- |\n")
    for _, pid, s, d, who, g in rows:
        f.write(f"| {pid} | {who} | {g} | {s.strftime('%d %H:%M') if s else '-'} | {d.strftime('%d %H:%M') if d else '-'} |\n")

print(json.dumps(dict(cards=len(cards), by_kind=by_kind, ledger=counts, unmapped=len(unmapped),
                      cycles=len(cards) - len(topo), finish=summary["finish"], problems=problems[:20]), indent=1))
print("checkpoint (done by 05:00):", [k for k, _ in summary["checkpoint"]])
sys.exit(1 if problems else 0)
