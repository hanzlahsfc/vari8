#!/usr/bin/env node
/**
 * apply-test-audit.mjs — PR-03a lever (issue #59)
 *
 * Parses icm/03-plan/output/TEST-AUDIT.md and deletes what the owner-approved
 * audit marks for removal in PR-03:
 *   - whole files whose action is `CUT-FILE in PR-03`
 *   - pass-2 blocks tagged VISIBLE or `CUT pass 2` inside TRIM files
 *   - the 34 named within-block cut cases
 *   - VISIBLE e2e flow cases in the two retained spec files
 *
 * Never touches GUARD or CUT-AT-REPLACE blocks, whole-file CUT-AT-REPLACE
 * files, KEEP-ALL files, or files absent from the audit.
 *
 * Usage:
 *   node icm/05-build/tools/apply-test-audit.mjs            # list only
 *   node icm/05-build/tools/apply-test-audit.mjs --apply    # execute
 *   node icm/05-build/tools/apply-test-audit.mjs --json out.json
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../..",
);
const AUDIT = path.join(ROOT, "icm/03-plan/output/TEST-AUDIT.md");
const APPLY = process.argv.includes("--apply");
const jsonIdx = process.argv.indexOf("--json");
const JSON_OUT = jsonIdx > -1 ? process.argv[jsonIdx + 1] : null;

const CUT_TAGS = new Set(["VISIBLE", "CUT pass 1", "CUT pass 2"]);
const KEEP_TAGS = new Set(["GUARD", "CUT-AT-REPLACE"]);
const WHOLE_FILE = "<whole-file>";

// ---------- audit parsing ----------

function section(text, startRe, endRe) {
  const s = text.search(startRe);
  if (s < 0) return "";
  const rest = text.slice(s);
  const e = rest.slice(1).search(endRe);
  return e < 0 ? rest : rest.slice(0, e + 1);
}

function parseAudit(md) {
  const files = new Map();
  const get = (p) => {
    if (!files.has(p))
      files.set(p, { action: null, blocks: [], cuts: [], e2e: [] });
    return files.get(p);
  };

  // Per-file action list.
  const actions = section(md, /^## Per-file action list/m, /^## /m);
  for (const m of actions.matchAll(/^- `([^`]+)`: (.+)$/gm)) {
    const [, p, rest] = m;
    const f = get(p);
    if (rest.startsWith("CUT-FILE")) f.action = "CUT-FILE";
    else if (rest.startsWith("KEEP-ALL")) f.action = "KEEP-ALL";
    else if (rest.startsWith("TRIM")) f.action = "TRIM";
    else if (rest.startsWith("CUT-AT-REPLACE")) f.action = "CUT-AT-REPLACE";
    else throw new Error(`unparsed action for ${p}: ${rest}`);
  }

  // Pass-2 block tables. Cells split on the spaced separator; names may hold
  // bare pipes, so anchor the last five columns from the right.
  const pass2 = section(
    md,
    /^## Pass-2 block decisions/m,
    /^## Within-block cuts/m,
  );
  const rowRe =
    /^\|\s*(TB\d+\.\d+):\s*(.*?)\s*\|\s*(\d+)-(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(GUARD|VISIBLE|CUT-AT-REPLACE|CUT pass 1|CUT pass 2)\s*\|\s*([^|]*)\|\s*$/gm;
  for (const sec of pass2.matchAll(
    /^### `([^`]+)`\s*\n([\s\S]*?)(?=^### |\n## )/gm,
  )) {
    const [, p, body] = sec;
    for (const r of body.matchAll(rowRe)) {
      const [, id, name, s, e, tests, lines, tag, pr] = r;
      get(p).blocks.push({
        id,
        name,
        s: +s,
        e: +e,
        tests: +tests,
        lines: +lines,
        tag,
        pr: pr.trim(),
      });
    }
  }

  // Within-block named cuts (parent block id identifies the file).
  const within = section(
    md,
    /^## Within-block cuts/m,
    /^## E2e flow decisions/m,
  );
  const cutRe =
    /^\|\s*(TB\d+\.\d+)\s*\|\s*(.*?)\s*\|\s*(\d+)-(\d+)\s*\|\s*(\d+)\s*\|\s*$/gm;
  const blockFile = new Map();
  for (const [p, f] of files) for (const b of f.blocks) blockFile.set(b.id, p);
  for (const r of within.matchAll(cutRe)) {
    const [, id, name, s, e, cases] = r;
    const p = blockFile.get(id);
    if (!p) throw new Error(`within-block cut for unknown block ${id}`);
    get(p).cuts.push({ id, name, s: +s, e: +e, cases: +cases });
  }

  // E2e flow table.
  const flows = section(
    md,
    /^## E2e flow decisions/m,
    /^## Independent spot checks/m,
  );
  const flowRe =
    /^\|\s*`([^`]+)`\s*\|\s*(.*?)\s*\|\s*(\d+)-(\d+)\s*\|\s*(GUARD|VISIBLE)\s*\|[^|]*\|\s*$/gm;
  for (const r of flows.matchAll(flowRe)) {
    const [, file, name, s, e, tag] = r;
    get(`tests/e2e/${file}`).e2e.push({ name, s: +s, e: +e, tag });
  }

  // Summary targets.
  const summary = section(md, /^## Summary/m, /^## /m);
  const totals = {};
  for (const r of summary.matchAll(
    /^\| (GUARD|VISIBLE|CUT-AT-REPLACE|CUT pass 1|CUT pass 2|e2e CUT) \| \d+ \| \d+ \| (\d+) \| (\d+) \|$/gm,
  )) {
    totals[r[1]] = { tests: +r[2], lines: +r[3] };
  }
  return { files, totals };
}

// ---------- statement scanner ----------

const TESTISH_ROOT = /^(describe|it|test)$/;

function scan(src) {
  const stmts = []; // testish calls {kind,name,s,e,startLine,endLine,parent,leaf}
  const wrappers = []; // for/if/while regions for empty cleanup

  const skipWs = (j) => {
    while (j < src.length && /\s/.test(src[j])) j++;
    return j;
  };
  const lineOf = (pos) => {
    let l = 1;
    for (let k = 0; k < pos && k < src.length; k++) if (src[k] === "\n") l++;
    return l;
  };
  const skipStr = (j) => {
    const q = src[j];
    j++;
    while (j < src.length) {
      const c = src[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === q) return j + 1;
      j++;
    }
    return src.length;
  };
  // Is the slash at j a regex literal opener? Regexes appear where a value is
  // expected: after operators, openers, keywords, commas, or nothing before.
  const prevSignificant = (j) => {
    let k = j - 1;
    while (k >= 0) {
      const c = src[k];
      if (/\s/.test(c)) {
        k--;
        continue;
      }
      if (c === "/" && src[k - 1] === "/") {
        while (k >= 0 && src[k] !== "\n") k--;
        continue;
      }
      if (c === "/" && src[k - 1] === "*") {
        const e = src.lastIndexOf("/*", k);
        k = e < 0 ? -1 : e - 1;
        continue;
      }
      return src.slice(k).match(/[A-Za-z_$][\w$]*$/)?.[0] ?? c;
    }
    return "";
  };
  const isRegexOpen = (j) => {
    const p = prevSignificant(j);
    if (p === "") return true;
    if (p.length === 1) return /[(=[{,:;!&|?+\-*/%^~<>]/.test(p);
    // word token: regex only after keyword-ish words
    return /^(return|typeof|case|in|of|new|delete|void|throw|else|do|yield|await|instanceof)$/.test(
      p,
    );
  };
  const skipRegex = (j) => {
    j++;
    let inClass = false;
    while (j < src.length) {
      const c = src[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) return j + 1;
      else if (c === "\n") return j; // unterminated regex, bail
      j++;
    }
    return src.length;
  };
  const match = (j, open, close) => {
    let d = 1;
    j++;
    while (j < src.length && d > 0) {
      const c = src[j];
      if (c === "'" || c === '"') {
        j = skipStr(j);
        continue;
      }
      if (c === "`") {
        j = skipTpl(j);
        continue;
      }
      if (c === "/" && src[j + 1] === "/") {
        const k = src.indexOf("\n", j);
        j = k < 0 ? src.length : k;
        continue;
      }
      if (c === "/" && src[j + 1] === "*") {
        const k = src.indexOf("*/", j);
        j = k < 0 ? src.length : k + 2;
        continue;
      }
      if (c === "/" && isRegexOpen(j)) {
        j = skipRegex(j);
        continue;
      }
      if (c === open) d++;
      else if (c === close) {
        d--;
        if (d === 0) return j;
      }
      j++;
    }
    return -1;
  };
  const skipTpl = (j) => {
    j++;
    while (j < src.length) {
      const c = src[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === "`") return j + 1;
      if (c === "$" && src[j + 1] === "{") {
        const k = match(j + 1, "{", "}");
        j = k < 0 ? src.length : k + 1;
        continue;
      }
      j++;
    }
    return src.length;
  };
  const firstStringArg = (openParen) => {
    // first argument literal of a call group, or null
    const k = skipWs(openParen + 1);
    if (src[k] === "'" || src[k] === '"' || src[k] === "`") {
      const q = src[k];
      const end = q === "`" ? skipTpl(k) : skipStr(k);
      return src.slice(k + 1, end - 1);
    }
    return null;
  };
  // first brace body inside (a,b): returns {bs,be} interior of that {...}
  const bodyBounds = (a, b) => {
    let i = a;
    while (i < b) {
      const c = src[i];
      if (c === "'" || c === '"') {
        i = skipStr(i);
        continue;
      }
      if (c === "`") {
        i = skipTpl(i);
        continue;
      }
      if (c === "/" && src[i + 1] === "/") {
        const k = src.indexOf("\n", i);
        i = k < 0 ? b : k;
        continue;
      }
      if (c === "/" && src[i + 1] === "*") {
        const k = src.indexOf("*/", i);
        i = k < 0 ? b : k + 2;
        continue;
      }
      if (c === "/" && isRegexOpen(i)) {
        i = skipRegex(i);
        continue;
      }
      if (c === "(") {
        const j = match(i, "(", ")");
        i = j < 0 ? b : j + 1;
        continue;
      }
      if (c === "[") {
        const j = match(i, "[", "]");
        i = j < 0 ? b : j + 1;
        continue;
      }
      if (c === "{") {
        const j = match(i, "{", "}");
        return j < 0 ? null : { bs: i + 1, be: j };
      }
      i++;
    }
    return null;
  };

  function walk(a, b, parent) {
    let i = a;
    while (i < b) {
      const c = src[i];
      if (c === "'" || c === '"') {
        i = skipStr(i);
        continue;
      }
      if (c === "`") {
        i = skipTpl(i);
        continue;
      }
      if (c === "/" && src[i + 1] === "/") {
        const k = src.indexOf("\n", i);
        i = k < 0 ? b : k;
        continue;
      }
      if (c === "/" && src[i + 1] === "*") {
        const k = src.indexOf("*/", i);
        i = k < 0 ? b : k + 2;
        continue;
      }
      if (c === "/" && isRegexOpen(i)) {
        i = skipRegex(i);
        continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
        const word = m[0];
        const start = i;
        i += word.length;
        let callee = word;
        while (src[i] === ".") {
          const mm = /^\.([A-Za-z_$][\w$]*)/.exec(src.slice(i));
          if (!mm) break;
          callee += "." + mm[1];
          i += mm[0].length;
        }
        const callPos = skipWs(i);
        if (
          src[callPos] === "(" ||
          (callee === word &&
            /^(for|if|while|switch|catch|try|finally|else|do)$/.test(word))
        ) {
          // chained call groups: it.each(cases)("name"), skipIf(c)("name")
          const groups = [];
          let pos = callPos;
          while (src[pos] === "(") {
            const close = match(pos, "(", ")");
            if (close < 0) break;
            groups.push({ open: pos, close });
            pos = skipWs(close + 1);
          }
          {
            const last = groups[groups.length - 1];
            const isTestish = TESTISH_ROOT.test(callee.split(".")[0]);
            const isCtrl =
              /^(for|if|while|switch|catch|try|finally|else|do)$/.test(word) &&
              callee === word;

            if (isCtrl) {
              // brace body follows the last paren group (for/if/...) or the
              // word itself (else/do/try/finally)
              const j = skipWs(groups.length ? last.close + 1 : callPos);
              if (src[j] === "{") {
                const cb = match(j, "{", "}");
                if (cb > -1) {
                  const st = {
                    kind: word,
                    name: null,
                    s: start,
                    e: cb + 1,
                    startLine: lineOf(start),
                    endLine: lineOf(cb + 1),
                    parent,
                    leaf: false,
                    bodyS: j + 1,
                    bodyE: cb,
                  };
                  wrappers.push(st);
                  walk(j + 1, cb, st);
                  i = cb + 1;
                  continue;
                }
              }
              i = groups.length ? last.close + 1 : callPos;
              continue;
            }

            if (isTestish && groups.length) {
              let name = null;
              for (const g of groups) {
                const lit = firstStringArg(g.open);
                if (lit != null) name = lit; // last string-first group wins
              }
              let e = last.close + 1;
              const j = skipWs(e);
              if (src[j] === ";") e = j + 1;
              const bb = bodyBounds(last.open + 1, last.close);
              const st = {
                kind: callee,
                name,
                s: start,
                e,
                startLine: lineOf(start),
                endLine: lineOf(e),
                parent,
                leaf: !/describe/.test(callee),
                bodyS: bb?.bs ?? null,
                bodyE: bb?.be ?? null,
              };
              stmts.push(st);
              wrappers.push(st); // suites also act as cleanup regions
              for (const g of groups) walk(g.open + 1, g.close, st);
              i = e;
              continue;
            }
            // non-testish call: still descend to catch nested testish args
            for (const g of groups) walk(g.open + 1, g.close, parent);
            i = groups.length ? last.close + 1 : callPos;
            continue;
          }
        }
        continue;
      }
      if (c === "{" || c === "(" || c === "[") {
        const close = { "{": "}", "(": ")", "[": "]" }[c];
        const j = match(i, c, close);
        if (j < 0) return;
        if (c === "{") walk(i + 1, j, parent); // recurse into block bodies
        i = j + 1;
        continue;
      }
      i++;
    }
  }
  walk(0, src.length, null);
  return { stmts, wrappers };
}

// ---------- name normalization ----------

function norm(s) {
  if (s == null) return "";
  return s
    .replace(/\$\{[^}]*\}/g, "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function nameMatches(auditName, stmtName) {
  if (stmtName == null || auditName === WHOLE_FILE) return false;
  const truncated = auditName.endsWith("...");
  const a = norm(truncated ? auditName.slice(0, -3) : auditName);
  const b = norm(stmtName);
  if (!a) return false;
  return truncated ? b.startsWith(a) : a === b;
}

// ---------- resolution ----------

// rows: [{id?,name,s,e,templated?}]. Returns resolved spans + problems.
function resolveSpans(rows, lines, stmts) {
  const resolved = [],
    problems = [];
  const byStart = new Map();
  for (const st of stmts)
    if (!byStart.has(st.startLine)) byStart.set(st.startLine, st);
  const seen = new Map();
  for (const r of rows) {
    const k = `${r.s}-${r.e}`;
    if (seen.has(k)) {
      seen.get(k).templated = true;
      r.templated = true;
    } else seen.set(k, r);
  }

  for (const row of rows) {
    if (row.name === WHOLE_FILE) continue;
    const st = byStart.get(row.s);
    if (
      st &&
      st.endLine === row.e &&
      (row.templated || nameMatches(row.name, st.name))
    ) {
      resolved.push({ row, startLine: row.s, endLine: row.e, via: "span" });
      continue;
    }
    const cand = stmts.filter((s2) => nameMatches(row.name, s2.name));
    if (cand.length === 1) {
      resolved.push({
        row,
        startLine: cand[0].startLine,
        endLine: cand[0].endLine,
        via: "name",
      });
    } else if (cand.length > 1) {
      cand.sort(
        (x, y) => Math.abs(x.startLine - row.s) - Math.abs(y.startLine - row.s),
      );
      resolved.push({
        row,
        startLine: cand[0].startLine,
        endLine: cand[0].endLine,
        via: "name-nearest",
      });
    } else {
      problems.push(
        `no statement for ${row.id ?? "-"} "${row.name}" @${row.s}-${row.e}`,
      );
    }
  }
  return { resolved, problems };
}

// ---------- plan ----------

function buildPlan(audit) {
  const plan = [];
  for (const [p, f] of audit.files) {
    if (f.action === "CUT-FILE") {
      plan.push({ file: p, action: "CUT-FILE" });
    } else if (f.action === "TRIM") {
      const del = [
        ...f.blocks.filter((b) => CUT_TAGS.has(b.tag)),
        ...f.cuts,
        ...f.e2e.filter((x) => CUT_TAGS.has(x.tag)),
      ];
      const keep = [
        ...f.blocks.filter((b) => KEEP_TAGS.has(b.tag)),
        ...f.e2e.filter((x) => KEEP_TAGS.has(x.tag)),
      ];
      plan.push({ file: p, action: "TRIM", del, keep });
    }
  }
  return plan;
}

// ---------- analysis + apply ----------

function analyze(item, lines, stmts) {
  const delRes = resolveSpans(item.del, lines, stmts);
  const keepRes = resolveSpans(item.keep, lines, stmts);
  const problems = [...delRes.problems];
  for (const k of keepRes.problems) problems.push(`KEEP ${k}`);

  // overlap safety: a delete span may not fully contain a keep span
  for (const d of delRes.resolved) {
    for (const k of keepRes.resolved) {
      if (d.startLine < k.startLine && d.endLine >= k.endLine) {
        problems.push(
          `del "${d.row.name}" @${d.startLine}-${d.endLine} contains keep "${k.row.name}" @${k.startLine}-${k.endLine}`,
        );
      }
    }
  }
  const uniq = new Map();
  for (const d of delRes.resolved) {
    const k = `${d.startLine}-${d.endLine}`;
    if (!uniq.has(k)) uniq.set(k, d);
  }
  const cuts = [...uniq.values()].sort((a, b) => b.startLine - a.startLine);
  return { cuts, keepRes, problems };
}

// empty wrapper cleanup. A wrapper is dead iff its brace body contains only
// whitespace, comments and nested dead wrappers; control flow carrying real
// code (a catch inside a helper, a for inside a test) is never swept.
function sweepText(input) {
  let text = input;
  const removed = [];
  let changed = true,
    rounds = 0;
  while (changed && rounds++ < 50) {
    changed = false;
    const { wrappers } = scan(text);
    const eligible = wrappers.filter(
      (w) =>
        w.bodyS != null &&
        (/^(for|if|while|switch|catch|try|finally|else|do)$/.test(w.kind) ||
          /describe/.test(w.kind)),
    );
    // fixpoint: wrapper is empty if its body holds only ws/comments plus
    // strictly-contained empty wrappers
    const dead = [];
    let grew = true;
    while (grew) {
      grew = false;
      for (const w of eligible) {
        if (dead.includes(w)) continue;
        let rest = "",
          cur = w.bodyS;
        const nested = dead
          .filter((d) => d.s > w.s && d.e <= w.bodyE)
          .sort((a, b) => a.s - b.s);
        for (const d of nested) {
          rest += text.slice(cur, d.s);
          cur = d.e;
        }
        rest += text.slice(cur, w.bodyE);
        rest = rest.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
        if (rest.trim() === "") {
          dead.push(w);
          grew = true;
        }
      }
    }
    if (!dead.length) break;
    const w = dead.reduce((a, b) => (b.s > a.s ? b : a));
    let s = w.s,
      e = w.e;
    const ls = text.lastIndexOf("\n", s - 1) + 1;
    if (text.slice(ls, s).trim() === "") s = ls;
    let le = text.indexOf("\n", e);
    if (le === -1) le = text.length;
    if (text.slice(e, le).trim() === "") e = Math.min(le + 1, text.length);
    text = text.slice(0, s) + text.slice(e);
    removed.push({ kind: w.kind, s: w.s, e: w.e });
    changed = true;
  }
  return { text, removed };
}

function sweep(abs) {
  // standalone empty-wrapper cleanup, returns removed regions
  const { text, removed } = sweepText(fs.readFileSync(abs, "utf8"));
  if (removed.length) fs.writeFileSync(abs, text);
  return removed;
}

function applyTrim(abs, item) {
  const src = fs.readFileSync(abs, "utf8");
  let lines = src.split("\n");
  const { stmts } = scan(src);
  const { cuts, keepRes, problems } = analyze(item, lines, stmts);
  const removed = [];
  if (problems.length) return { ok: false, problems, removed };

  for (const c of cuts) {
    let s = c.startLine;
    // swallow contiguous comment lines directly above the cut
    while (s > 1 && /^\s*(\/\/|\/\*|\*)/.test(lines[s - 2])) s--;
    removed.push({ s, e: c.endLine });
    lines.splice(s - 1, c.endLine - s + 1);
  }

  // empty-wrapper cleanup in memory; verify keeps before touching disk
  const { text: out, removed: swept } = sweepText(lines.join("\n"));
  for (const r of swept) removed.push(r);
  const { stmts: after } = scan(out);
  const missing = [];
  for (const k of keepRes.resolved) {
    if (!after.some((t) => nameMatches(k.row.name, t.name)))
      missing.push(k.row.id ?? k.row.name);
  }
  if (missing.length) {
    return {
      ok: false,
      problems: [`keep blocks missing after trim: ${missing.join(", ")}`],
      removed,
    };
  }

  fs.writeFileSync(abs, out);
  lines = out.split("\n");
  return {
    ok: true,
    problems: [],
    removed,
    after: out.split("\n").length - (out.endsWith("\n") ? 1 : 0),
  };
}

// ---------- main ----------

const sweepIdx = process.argv.indexOf("--sweep");
if (sweepIdx > -1) {
  const files = process.argv
    .slice(sweepIdx + 1)
    .filter((a) => !a.startsWith("--"));
  for (const f of files) {
    const removed = sweep(path.resolve(f));
    console.log(`${f}: swept ${removed.length} wrapper(s)`);
  }
  process.exit(0);
}

const md = fs.readFileSync(AUDIT, "utf8");
const audit = parseAudit(md);
const plan = buildPlan(audit);

const results = [];
const missing = [];
let cutFiles = 0,
  trimFiles = 0;

for (const item of plan) {
  const abs = path.join(ROOT, item.file);
  if (!fs.existsSync(abs)) {
    missing.push(item.file);
    continue;
  }
  if (item.action === "CUT-FILE") {
    const size = fs.readFileSync(abs, "utf8").split("\n").length;
    results.push({ file: item.file, action: "CUT-FILE", lines: size - 1 });
    if (APPLY) fs.rmSync(abs);
    cutFiles++;
    continue;
  }
  trimFiles++;
  const src = fs.readFileSync(abs, "utf8");
  const before = src.split("\n").length - 1;
  if (APPLY) {
    const r = applyTrim(abs, item);
    const after = fs.existsSync(abs)
      ? fs.readFileSync(abs, "utf8").split("\n").length - 1
      : 0;
    results.push({
      file: item.file,
      action: "TRIM",
      ok: r.ok,
      before,
      after,
      removed: r.removed,
      problems: r.problems,
    });
  } else {
    const { stmts } = scan(src);
    const { cuts, problems } = analyze(item, src.split("\n"), stmts);
    const cutLines = cuts.reduce(
      (a, c) => a + (c.endLine - c.startLine + 1),
      0,
    );
    results.push({
      file: item.file,
      action: "TRIM",
      before,
      spans: cuts.length,
      cutLines,
      problems,
    });
  }
}

const auditedExtra = [...audit.files.keys()]
  .filter(
    (p) =>
      audit.files.get(p).action === "KEEP-ALL" ||
      audit.files.get(p).action === "CUT-AT-REPLACE",
  )
  .filter((p) => !fs.existsSync(path.join(ROOT, p)));

const summary = {
  mode: APPLY ? "apply" : "list",
  cutFiles,
  trimFiles,
  missingAuditedFiles: missing.concat(auditedExtra),
  expectedRemaining: {
    tests:
      (audit.totals.GUARD?.tests ?? 0) +
      (audit.totals["CUT-AT-REPLACE"]?.tests ?? 0),
    lines:
      (audit.totals.GUARD?.lines ?? 0) +
      (audit.totals["CUT-AT-REPLACE"]?.lines ?? 0),
  },
};

if (!APPLY) {
  console.log(
    `plan: ${cutFiles} CUT-FILE + ${trimFiles} TRIM (of ${audit.files.size} audited files)`,
  );
  for (const r of results) {
    if (r.action === "CUT-FILE")
      console.log(`  CUT-FILE  ${r.file} (${r.lines} lines)`);
    else
      console.log(
        `  TRIM      ${r.file} (cut ${r.spans} spans ~${r.cutLines} lines, ${r.before} before)${r.problems.length ? "  PROBLEMS: " + r.problems.join("; ") : ""}`,
      );
  }
  for (const m of summary.missingAuditedFiles) console.log(`  MISSING   ${m}`);
  console.log(
    `expected remaining: ${summary.expectedRemaining.tests} tests / ${summary.expectedRemaining.lines} lines`,
  );
} else {
  console.log(`applied: ${cutFiles} files deleted, ${trimFiles} trimmed`);
  for (const r of results.filter((x) => x.action === "TRIM")) {
    console.log(
      `  ${r.ok ? "OK " : "FAIL"} ${r.file} ${r.before} -> ${r.after}${r.problems.length ? "  " + r.problems.join("; ") : ""}`,
    );
  }
}
if (JSON_OUT)
  fs.writeFileSync(JSON_OUT, JSON.stringify({ summary, results }, null, 2));
