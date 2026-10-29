// Extract the full PRGRSS 2.0 workbook into the legacy-sheet display layer.
// Source of truth: prgrss-2.0-full.xlsx only (owner ruling 2026-10-26: demo
// data, may be used as fixtures). Regenerates
// components/canvas/client/legacy-sheet/workbook-values.ts and its
// byte-identical twin under frontend/src/, plus the public image assets both
// trees serve. Dependency-free: zip, XML, number formats and shared-formula
// expansion are implemented here so the script runs under plain tsx.
//
// Usage:
//   tsx scripts/extract-legacy-sheet-full.ts
//   tsx scripts/extract-legacy-sheet-full.ts --xlsx <path> --manifest <path>
//
// --xlsx      override the workbook path (default: the FULL-PACKAGE-2 source)
// --manifest  also write the expected-display JSON the match harness reads
// --report    print the extraction summary only, write nothing

import { inflateRawSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_XLSX = join(
  process.env.HOME ?? "",
  "NEXUS_AI_CENTER/04_PROJECTS/Vari8-evidence/FULL-PACKAGE-2/SOURCE/prgrss-2.0-full.xlsx",
);
const OUT_FILES = [
  "components/canvas/client/legacy-sheet/workbook-values.ts",
  "frontend/src/components/client/legacy-sheet/workbook-values.ts",
];
const PUBLIC_DIRS = ["public/legacy-sheet", "frontend/public/legacy-sheet"];

// ---------- minimal xlsx (zip) reader ----------

type ZipEntry = { name: string; method: number; data: Buffer };

function readZip(path: string): Map<string, ZipEntry> {
  const buf = readFileSync(path);
  // End Of Central Directory signature 0x06054b50, searched from the tail.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${path}: no zip EOCD`);
  const count = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const method = buf.readUInt16LE(pos + 10);
    const csize = buf.readUInt32LE(pos + 20);
    const nlen = buf.readUInt16LE(pos + 28);
    const elen = buf.readUInt16LE(pos + 30);
    const clen = buf.readUInt16LE(pos + 32);
    const off = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf8", pos + 46, pos + 46 + nlen);
    const ln = buf.readUInt16LE(off + 26);
    const le = buf.readUInt16LE(off + 28);
    const raw = buf.subarray(off + 30 + ln + le, off + 30 + ln + le + csize);
    const data =
      method === 0 ? Buffer.from(raw) : (inflateRawSync(raw) as Buffer);
    out.set(name, { name, method, data });
    pos += 46 + nlen + elen + clen;
  }
  return out;
}

// ---------- xml helpers (regex pass over the well-formed export) ----------

function unesc(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#[0-9]+);/g, (m, g) =>
    g === "amp"
      ? "&"
      : g === "lt"
        ? "<"
        : g === "gt"
          ? ">"
          : g === "quot"
            ? '"'
            : g === "apos"
              ? "'"
              : g.startsWith("#x")
                ? String.fromCodePoint(parseInt(g.slice(2), 16))
                : String.fromCodePoint(parseInt(g.slice(1), 10)),
  );
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? unesc(m[1]) : undefined;
}

const COL_RE = /^([A-Z]+)(\d+)$/;
function colToNum(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}
function numToCol(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function a1ToRC(ref: string): { r: number; c: number } {
  const m = COL_RE.exec(ref.replace(/\$/g, ""));
  if (!m) throw new Error(`bad ref ${ref}`);
  return { r: parseInt(m[2], 10), c: colToNum(m[1]) };
}

// ---------- number formats ----------

const BUILTIN_FMT: Record<number, string> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  12: "# ?/?",
  13: "# ??/??",
  14: "mm-dd-yy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yy h:mm",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mmss.0",
  48: "##0.0E+0",
  49: "@",
};

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DATE_EPOCH = Date.UTC(1899, 11, 30); // 1900 system incl. leap bug

/** Remove color, condition, locale and currency bracket runs from a section. */
function cleanSection(s: string): string {
  return s
    .replace(/\[[^\]]*\]/g, (m) => (/^\[(h+|m+|s+)\]$/i.test(m) ? m : ""))
    .replace(/@/g, "");
}

function splitSections(fmt: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < fmt.length; i++) {
    const ch = fmt[i];
    if (ch === '"') inQ = !inQ;
    if (ch === ";" && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const DATE_TOKEN =
  /(yyyy|yy|dddd|ddd|mmmm|mmm|dd|d|mm|m|hh|h|ss|s|AM\/PM|A\/P)/i;

function isDateFormat(section: string): boolean {
  const bare = section
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/_./g, "")
    .replace(/\*./g, "");
  return /[dmyh]/i.test(bare) && !/E\+0/i.test(bare);
}

function formatDateTime(section: string, v: number): string {
  const ms = DATE_EPOCH + v * 86_400_000;
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const dow = d.getUTCDay();
  // Elapsed forms [h] [m] [s] count from the epoch, not the wall clock.
  const totalH = Math.floor(v * 24 + 1e-9);
  const totalM = Math.floor(v * 1440 + 1e-9);
  const totalS = Math.floor(v * 86400 + 1e-9);
  let h24 = d.getUTCHours();
  const mins = d.getUTCMinutes();
  const secs = d.getUTCSeconds();
  const ampm = /AM\/PM|A\/P/i.test(section);
  let suffix = "";
  if (ampm) {
    suffix = h24 >= 12 ? "PM" : "AM";
    h24 = h24 % 12 || 12;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  let out = "";
  let inQ = false;
  // m/mm is a minute only when it follows h or precedes s in the token stream.
  const tokens: { text: string; i: number }[] = [];
  {
    let i = 0;
    while (i < section.length) {
      const ch = section[i];
      if (ch === '"') {
        inQ = !inQ;
        i++;
        continue;
      }
      if (!inQ && (ch === "\\" || ch === "_")) {
        i += 2;
        continue;
      }
      if (!inQ) {
        const rest = section.slice(i);
        const m = rest.match(DATE_TOKEN);
        if (m && m.index === 0) {
          tokens.push({ text: m[0], i });
          i += m[0].length;
          continue;
        }
        if (rest.startsWith("[h]") || rest.startsWith("[H]")) {
          tokens.push({ text: "[h]", i });
          i += 3;
          continue;
        }
        if (rest.startsWith("[m]") || rest.startsWith("[M]")) {
          tokens.push({ text: "[m]", i });
          i += 3;
          continue;
        }
        if (rest.startsWith("[s]") || rest.startsWith("[S]")) {
          tokens.push({ text: "[s]", i });
          i += 3;
          continue;
        }
      }
      i++;
    }
  }
  // Classify minute vs month for m/mm tokens.
  const isMinute = new Set<number>();
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k].text.toLowerCase();
    if (t !== "m" && t !== "mm") continue;
    const prev = tokens[k - 1]?.text.toLowerCase() ?? "";
    const next = tokens[k + 1]?.text.toLowerCase() ?? "";
    if (
      prev.startsWith("h") ||
      prev === "[h]" ||
      prev === "[m]" ||
      next.startsWith("s") ||
      next === "[s]"
    )
      isMinute.add(tokens[k].i);
  }
  inQ = false;
  let i = 0;
  const tokByIndex = new Map(tokens.map((t) => [t.i, t.text]));
  while (i < section.length) {
    const ch = section[i];
    if (ch === '"') {
      inQ = !inQ;
      i++;
      continue;
    }
    if (!inQ && (ch === "\\" || ch === "_")) {
      i += 2;
      continue;
    }
    if (inQ) {
      out += ch;
      i++;
      continue;
    }
    const tok = tokByIndex.get(i);
    if (!tok) {
      out += ch;
      i++;
      continue;
    }
    i += tok.length;
    const t = tok.toLowerCase();
    if (tok === "[h]") out += String(totalH);
    else if (tok === "[m]") out += String(totalM);
    else if (tok === "[s]") out += String(totalS);
    else if (t === "yyyy") out += String(year);
    else if (t === "yy") out += pad(year % 100);
    else if (t === "dddd") out += DAYS[dow];
    else if (t === "ddd") out += DAYS[dow].slice(0, 3);
    else if (t === "mmmm") out += MONTHS[month - 1];
    else if (t === "mmm") out += MONTHS[month - 1].slice(0, 3);
    else if (t === "dd") out += pad(day);
    else if (t === "d") out += String(day);
    else if (t === "mm")
      out += isMinute.has(i - tok.length) ? pad(mins) : pad(month);
    else if (t === "m")
      out += isMinute.has(i - tok.length) ? String(mins) : String(month);
    else if (t === "hh") out += pad(h24);
    else if (t === "h") out += String(h24);
    else if (t === "ss") out += pad(secs);
    else if (t === "s") out += String(secs);
    else if (/am\/pm|a\/p/i.test(tok)) out += suffix;
    else out += tok;
  }
  return out;
}

/** Integer part of a fraction in lowest terms, for "# ?/?" formats. */
function formatFraction(section: string, v: number): string {
  const whole = Math.floor(Math.abs(v));
  const frac = Math.abs(v) - whole;
  const qm = /\/(\?+|#+|\d+)/.exec(section);
  const denom = qm
    ? qm[1].match(/\d+/)
      ? parseInt(qm[1], 10)
      : 10 ** qm[1].length
    : 0;
  if (!denom) return String(v);
  const n = Math.round(frac * denom);
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const dv = g(n, denom) || 1;
  const parts: string[] = [];
  if (whole || !n) parts.push(String(whole));
  if (n) parts.push(`${n / dv}/${denom / dv}`);
  return (v < 0 ? "-" : "") + parts.join(" ").trim();
}

const PH_CHARS = new Set([..."0#?.,%+Ee"]);

/** Strip literal quoting, escapes and spacer/fill runs, keeping raw text. */
function unwrapLiterals(s: string): string {
  return s
    .replace(/"([^"]*)"/g, "$1")
    .replace(/\\(.)/g, "$1")
    .replace(/_(.)/g, " ")
    .replace(/\*(.)/g, "");
}

/**
 * Apply one format section to a non-negative number. Finds the contiguous
 * digit-placeholder block, formats the number per that block, and splices it
 * back so quoted units and spacing around it stay verbatim.
 */
function formatNumber(section: string, v: number): string {
  let first = -1;
  let last = -1;
  let inQ = false;
  for (let i = 0; i < section.length; i++) {
    const ch = section[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (inQ) continue;
    if (ch === "\\" || ch === "_" || ch === "*") {
      i++;
      continue;
    }
    if (PH_CHARS.has(ch)) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return unwrapLiterals(section);
  const block = section.slice(first, last + 1);
  const percent = block.includes("%");
  const sv = percent ? v * 100 : v;
  const [ib, fb = ""] = block.split(".");
  const decSpec = fb.replace(/%/g, "");
  const reqDec = (decSpec.match(/0/g) ?? []).length;
  const optDec = (decSpec.match(/[#?]/g) ?? []).length;
  const num = Math.abs(sv).toFixed(reqDec + optDec);
  let [ni, nf = ""] = num.split(".");
  while (nf.length > reqDec && nf.endsWith("0")) nf = nf.slice(0, -1);
  if (ib.includes(",")) ni = ni.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (ni === "0" && !/0/.test(ib)) ni = "";
  const numStr = ni + (nf ? "." + nf : "") + (percent ? "%" : "");
  return (
    unwrapLiterals(section.slice(0, first)) +
    numStr +
    unwrapLiterals(section.slice(last + 1))
  );
}

/** Apply an Excel number-format code to a numeric value. */
export function formatValue(fmt: string | undefined, v: number): string {
  if (!fmt || fmt === "General") {
    const s = String(v);
    if (!/e/i.test(s) && s.length <= 15) return s;
    return Number(v.toPrecision(11)).toString();
  }
  if (fmt === "@") return String(v);
  const sections = splitSections(fmt)
    .map(cleanSection)
    .filter((x) => x !== "");
  if (v < 0 && sections.length > 1) {
    // A dedicated negative section owns the sign/parens itself.
    return emitSection(sections[1], Math.abs(v));
  }
  if (v === 0 && sections.length > 2) return emitSection(sections[2], 0);
  const out = emitSection(sections[0] ?? "General", Math.abs(v));
  return v < 0 ? `-${out}` : out;
}

function emitSection(section: string, v: number): string {
  if (!section || section === "General") return formatValue("General", v);
  if (isDateFormat(section)) return formatDateTime(section, v);
  if (section.includes("/")) return formatFraction(section, v);
  if (/e\+0/i.test(section)) return String(v);
  return formatNumber(section, v);
}

// ---------- shared formula translation ----------

const REF_RE = /(\$?)([A-Z]{1,3})(\$?)(\d{1,7})/g;

/**
 * Shift the relative A1 references of a shared formula by (dCol, dRow).
 * Absolute markers are kept; refs inside string literals are skipped.
 */
function shiftFormula(text: string, dCol: number, dRow: number): string {
  const parts = text.split(/("(?:[^"]|"")*")/g);
  return parts
    .map((p, i) => {
      if (i % 2 === 1) return p; // inside quotes
      return p.replace(
        REF_RE,
        (m, cAbs, col, rAbs, row) =>
          `${cAbs}${numToCol(colToNum(col) + (cAbs ? 0 : dCol))}${rAbs}${parseInt(row, 10) + (rAbs ? 0 : dRow)}`,
      );
    })
    .join("");
}

// ---------- workbook parse ----------

type CellRec = {
  r: number;
  c: number;
  t: string;
  s: number;
  f?: string;
  fShared?: { si: number; ref?: string };
  v?: string;
  is?: string;
};

function parseCells(xml: string): CellRec[] {
  const out: CellRec[] = [];
  const re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const body = m[2] ?? "";
    const ref = attr(attrs, "r");
    if (!ref) continue;
    const { r, c } = a1ToRC(ref);
    const rec: CellRec = {
      r,
      c,
      t: attr(attrs, "t") ?? "n",
      s: parseInt(attr(attrs, "s") ?? "0", 10),
    };
    const fm = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(body);
    if (fm) {
      const fAttrs = fm[1];
      const fText = fm[2] ?? "";
      if (attr(fAttrs, "t") === "shared") {
        rec.fShared = {
          si: parseInt(attr(fAttrs, "si") ?? "0", 10),
          ref: attr(fAttrs, "ref"),
        };
        if (fText) rec.f = unesc(fText);
      } else {
        rec.f = unesc(fText);
      }
    }
    const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
    if (vm) rec.v = unesc(vm[1]);
    const im =
      /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>|<is>\s*<t[^>]*>([\s\S]*?)<\/t>\s*<\/is>/.exec(
        body,
      );
    if (im) rec.is = unesc(im[1] ?? im[2] ?? "");
    out.push(rec);
  }
  return out;
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const ts = [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)];
    out.push(unesc(ts.map((t) => t[1]).join("")));
  }
  return out;
}

// OOXML indexed color palette subset (the entries this workbook can hit).
const INDEXED_COLOR: Record<number, string> = {
  0: "#000000",
  1: "#FFFFFF",
  8: "#000000",
  9: "#FFFFFF",
  10: "#FF0000",
  22: "#808080",
  23: "#808080",
};

function tintChannel(c: number, tint: number): number {
  const v = tint < 0 ? c * (1 + tint) : c + (255 - c) * tint;
  return Math.max(0, Math.min(255, Math.round(v)));
}

// Resolve a <color> element to #RRGGBB. `theme` indexes the clrScheme order
// dk1 lt1 dk2 lt2 accent1..6 hlink folHlink; sysClr uses lastClr. `auto`
// and unresolvable colors return undefined (renderer default wins).
function resolveColor(attrs: string, scheme: string[]): string | undefined {
  const rgb = attr(attrs, "rgb");
  const theme = attr(attrs, "theme");
  const indexed = attr(attrs, "indexed");
  const tint = parseFloat(attr(attrs, "tint") ?? "0");
  let base: string | undefined;
  if (rgb) {
    base = `#${rgb.slice(-6).toUpperCase()}`;
  } else if (theme !== undefined) {
    base = scheme[parseInt(theme, 10)];
  } else if (indexed !== undefined) {
    base = INDEXED_COLOR[parseInt(indexed, 10)];
  }
  if (!base) return undefined;
  if (!tint) return base;
  const n = parseInt(base.slice(1), 16);
  const r = tintChannel((n >> 16) & 255, tint);
  const g = tintChannel((n >> 8) & 255, tint);
  const b = tintChannel(n & 255, tint);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0").toUpperCase()}`;
}

function parseTheme(xml: string): string[] {
  const scheme =
    /<a:clrScheme\b[^>]*>([\s\S]*?)<\/a:clrScheme>/.exec(xml)?.[1] ?? "";
  const out: string[] = [];
  for (const m of scheme.matchAll(
    /<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)>([\s\S]*?)<\/a:\1>/g,
  )) {
    const body = m[2];
    const srgb = /<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/.exec(body)?.[1];
    const last = /<a:sysClr\b[^>]*lastClr="([0-9A-Fa-f]{6})"/.exec(body)?.[1];
    out.push(`#${(srgb ?? last ?? "000000").toUpperCase()}`);
  }
  return out;
}

function parseStyles(
  xml: string,
  themeXml: string,
): {
  fmtForXf: (s: number) => string | undefined;
  inkForXf: (s: number) => string | undefined;
} {
  const numFmts: Record<number, string> = { ...BUILTIN_FMT };
  for (const m of xml.matchAll(/<numFmt\b([^>]*?)\/>/g)) {
    const id = parseInt(attr(m[1], "numFmtId") ?? "", 10);
    const code = attr(m[1], "formatCode");
    if (Number.isFinite(id) && code !== undefined) numFmts[id] = code;
  }
  const scheme = parseTheme(themeXml);
  // Font theme indices follow the text-color order (lt1,dk1,lt2,dk2,...),
  // swapped against the clrScheme slot order used for fills.
  const fontScheme = [...scheme];
  if (fontScheme.length >= 4) {
    [fontScheme[0], fontScheme[1]] = [fontScheme[1], fontScheme[0]];
    [fontScheme[2], fontScheme[3]] = [fontScheme[3], fontScheme[2]];
  }
  const fontBlock = /<fonts\b[^>]*>([\s\S]*?)<\/fonts>/.exec(xml)?.[1] ?? "";
  const fontColors: (string | undefined)[] = [];
  for (const m of fontBlock.matchAll(/<font>([\s\S]*?)<\/font>|<font\/>/g)) {
    const body = m[1] ?? "";
    const col = /<color\b([^>]*?)\/>/.exec(body)?.[1];
    fontColors.push(col ? resolveColor(col, fontScheme) : undefined);
  }
  const xfBlock = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  const xfs: number[] = [];
  const xfsFont: number[] = [];
  for (const m of xfBlock.matchAll(/<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g)) {
    xfs.push(parseInt(attr(m[1], "numFmtId") ?? "0", 10));
    xfsFont.push(parseInt(attr(m[1], "fontId") ?? "0", 10));
  }
  return {
    fmtForXf: (s) => numFmts[xfs[s] ?? 0],
    inkForXf: (s) => fontColors[xfsFont[s] ?? 0],
  };
}

type ImageSpec = {
  src: string;
  row: number; // 1-based anchor row
  col: number; // 1-based anchor col
  offX: number; // px inside the anchor cell
  offY: number;
  w: number;
  h: number;
};

const EMU = 9525;

function parseDrawing(
  xml: string,
  rels: Map<string, string>,
): { images: Omit<ImageSpec, "src">[] & { rid: string }[] } {
  const pics: (Omit<ImageSpec, "src"> & { rid: string })[] = [];
  const anchorRe =
    /<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)>([\s\S]*?)<\/xdr:\1>/g;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(xml))) {
    const body = m[2];
    if (!body.includes("<xdr:pic>")) continue;
    const rid = /<a:blip\b[^>]*\br:embed="([^"]*)"/.exec(body)?.[1];
    if (!rid || !rels.has(rid)) continue;
    const fromM = /<xdr:from>([\s\S]*?)<\/xdr:from>/.exec(body)?.[1] ?? "";
    const col = parseInt(/<xdr:col>(\d+)/.exec(fromM)?.[1] ?? "0", 10) + 1;
    const row = parseInt(/<xdr:row>(\d+)/.exec(fromM)?.[1] ?? "0", 10) + 1;
    const offX =
      parseInt(/<xdr:colOff>(\d+)/.exec(fromM)?.[1] ?? "0", 10) / EMU;
    const offY =
      parseInt(/<xdr:rowOff>(\d+)/.exec(fromM)?.[1] ?? "0", 10) / EMU;
    const extM = /<xdr:ext\b([^>]*)\/>/.exec(body)?.[1] ?? "";
    const w = parseInt(attr(extM, "cx") ?? "0", 10) / EMU;
    const h = parseInt(attr(extM, "cy") ?? "0", 10) / EMU;
    if (m[1] === "twoCellAnchor") {
      const toM = /<xdr:to>([\s\S]*?)<\/xdr:to>/.exec(body)?.[1] ?? "";
      pics.push({
        rid,
        row,
        col,
        offX: +offX.toFixed(2),
        offY: +offY.toFixed(2),
        w: +w.toFixed(2),
        h: +h.toFixed(2),
        // twoCellAnchor size is resolved against geometry at render time;
        // stash the to-anchor in extra fields the generator serializes.
        ...({
          toRow: parseInt(/<xdr:row>(\d+)/.exec(toM)?.[1] ?? "0", 10) + 1,
          toCol: parseInt(/<xdr:col>(\d+)/.exec(toM)?.[1] ?? "0", 10) + 1,
          toOffX: parseInt(/<xdr:colOff>(\d+)/.exec(toM)?.[1] ?? "0", 10) / EMU,
          toOffY: parseInt(/<xdr:rowOff>(\d+)/.exec(toM)?.[1] ?? "0", 10) / EMU,
        } as object),
      } as Omit<ImageSpec, "src"> & { rid: string });
    } else {
      pics.push({
        rid,
        row,
        col,
        offX: +offX.toFixed(2),
        offY: +offY.toFixed(2),
        w: +w.toFixed(2),
        h: +h.toFixed(2),
      } as Omit<ImageSpec, "src"> & { rid: string });
    }
  }
  return { images: pics as Omit<ImageSpec, "src">[] & { rid: string }[] };
}

function parseRels(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of xml.matchAll(/<Relationship\b([^>]*?)\/>/g)) {
    const id = attr(m[1], "Id");
    const target = attr(m[1], "Target");
    const mode = attr(m[1], "TargetMode");
    if (id && target && mode !== "External") out.set(id, target);
  }
  return out;
}

// ---------- main ----------

/**
 * The renderer only paints cells inside each tab's rendered window; the
 * generated layer covers that scope exactly (the match harness asserts the
 * same scope). Windows are re-read from model.ts so a geometry change is
 * picked up automatically on the next extraction. Painted scope matches
 * grid.tsx: a cell is emitted when its position among the tab's visible
 * rows/columns falls inside the LO page prefix (pageR x pageC).
 */
async function readWindows(): Promise<
  Record<
    string,
    { rows: number[]; cols: number[]; pageR: number; pageC: number }
  >
> {
  const model = await import(
    join(ROOT, "components/canvas/client/legacy-sheet/model.ts")
  );
  const styles = await import(
    join(ROOT, "components/canvas/client/legacy-sheet/styles.ts")
  );
  const out: Record<
    string,
    { rows: number[]; cols: number[]; pageR: number; pageC: number }
  > = {};
  for (const tab of model.WORKBOOK as {
    slug: string;
  }[]) {
    const vr = model.visibleRows(tab) as number[];
    const vc = model.visibleCols(tab) as number[];
    const page = styles.sheetPage(tab.slug) as
      { rows: number; cols: number } | undefined;
    out[tab.slug] = {
      rows: vr,
      cols: vc,
      pageR: page?.rows ?? vr.length,
      pageC: page?.cols ?? vc.length,
    };
  }
  return out;
}

const SLUGS = [
  "dashboard",
  "daily-tracker",
  "timeline",
  "mealplan",
  "supplementation",
  "menses",
  "training",
  "peaking",
  "showday",
  "exercise-database",
  "nutrition-database",
];

type SheetOut = {
  values: Record<string, string>;
  formulas: Record<string, string>;
  ink: Record<string, string>;
  validations: { sqref: string; options: string[] }[];
  images: ImageSpec[];
};

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const xlsx = arg("--xlsx") ?? DEFAULT_XLSX;
  if (!existsSync(xlsx)) throw new Error(`workbook not found: ${xlsx}`);
  const reportOnly = process.argv.includes("--report");
  const zip = readZip(xlsx);
  const entry = (n: string) => zip.get(n)?.data.toString("utf8");

  const sst = parseSharedStrings(entry("xl/sharedStrings.xml") ?? "");
  const { fmtForXf, inkForXf } = parseStyles(
    entry("xl/styles.xml") ?? "",
    entry("xl/theme/theme1.xml") ?? "",
  );
  const windows = await readWindows();

  // Sheet order -> part name via workbook rels.
  const wbXml = entry("xl/workbook.xml") ?? "";
  const wbRels = parseRels(entry("xl/_rels/workbook.xml.rels") ?? "");
  const sheetParts: string[] = [];
  for (const m of wbXml.matchAll(/<sheet\b([^>]*?)\/>/g)) {
    const rid = attr(m[1], "r:id");
    const target = rid ? wbRels.get(rid) : undefined;
    sheetParts.push(target ? `xl/${target.replace(/^\//, "")}` : "");
  }

  const result: Record<string, SheetOut> = {};
  const full: Record<
    string,
    { values: Record<string, string>; formulas: Record<string, string> }
  > = {};
  const mediaOut = new Map<string, Buffer>();
  const distinctStrings = new Set<string>();
  const imageLog: string[] = [];

  for (let i = 0; i < SLUGS.length; i++) {
    const slug = SLUGS[i];
    const part = sheetParts[i];
    const xml = entry(part);
    if (!xml) {
      result[slug] = {
        values: {},
        formulas: {},
        ink: {},
        validations: [],
        images: [],
      };
      continue;
    }
    const cells = parseCells(xml);
    const shared = new Map<number, { text: string; r: number; c: number }>();
    const out: SheetOut = {
      values: {},
      formulas: {},
      ink: {},
      validations: [],
      images: [],
    };
    for (const cell of cells) {
      const ink = cell.s === undefined ? undefined : inkForXf(cell.s);
      if (ink) out.ink[`${cell.r}:${cell.c}`] = ink;
    }
    for (const cell of cells) {
      // Resolve shared formulas after collecting masters.
      if (cell.fShared && cell.f !== undefined && cell.fShared.ref) {
        shared.set(cell.fShared.si, {
          text: cell.f,
          r: cell.r,
          c: cell.c,
        });
      }
      let display: string | undefined;
      if (cell.t === "s") {
        display =
          cell.v === undefined ? undefined : (sst[parseInt(cell.v, 10)] ?? "");
      } else if (cell.t === "inlineStr") {
        display = cell.is ?? "";
      } else if (cell.t === "b") {
        display = cell.v === "1" ? "TRUE" : "FALSE";
      } else if (cell.t === "e" || cell.t === "str") {
        display = cell.v ?? "";
      } else if (cell.v !== undefined && cell.v !== "") {
        const num = Number(cell.v);
        display = Number.isFinite(num)
          ? formatValue(fmtForXf(cell.s), num)
          : cell.v;
      } else if (cell.f !== undefined || cell.fShared) {
        display = ""; // formula cell with no cached value renders blank
      }
      if (display === undefined) continue;
      out.values[`${cell.r}:${cell.c}`] = display;
      distinctStrings.add(display);
    }
    for (const cell of cells) {
      let fText: string | undefined;
      if (cell.f !== undefined) fText = cell.f;
      else if (cell.fShared) {
        const master = shared.get(cell.fShared.si);
        if (master)
          fText = shiftFormula(
            master.text,
            cell.c - master.c,
            cell.r - master.r,
          );
      }
      if (fText !== undefined)
        out.formulas[`${cell.r}:${cell.c}`] = `=${fText}`;
    }
    // Window scope for the emitted layer: blank cells and cells outside the
    // rendered window render identically whether present or absent, so the
    // emitted maps keep only non-empty values inside the window. The manifest
    // keeps the full extraction.
    const win = windows[slug];
    const fullValues = out.values;
    const fullFormulas = out.formulas;
    if (win) {
      const inWin = (key: string) => {
        const [r, c] = key.split(":").map(Number);
        const ri = win.rows.indexOf(r);
        const ci = win.cols.indexOf(c);
        return ri >= 0 && ri < win.pageR && ci >= 0 && ci < win.pageC;
      };
      out.values = Object.fromEntries(
        Object.entries(out.values).filter(([k, v]) => v !== "" && inWin(k)),
      );
      out.formulas = Object.fromEntries(
        Object.entries(out.formulas).filter(([k]) => inWin(k)),
      );
      out.ink = Object.fromEntries(
        Object.entries(out.ink).filter(([k]) => inWin(k)),
      );
    }
    full[slug] = { values: fullValues, formulas: fullFormulas };
    // Data validations.
    for (const m of xml.matchAll(
      /<dataValidation\b([^>]*?)(?:\/>|>([\s\S]*?)<\/dataValidation>)/g,
    )) {
      const vtype = attr(m[1], "type");
      if (vtype !== undefined && vtype !== "list") continue;
      const sqref = attr(m[1], "sqref");
      const body = m[2] ?? "";
      const f1 = /<formula1>([\s\S]*?)<\/formula1>/.exec(body)?.[1];
      if (!sqref || f1 === undefined) continue;
      const formula = unesc(f1);
      let options: string[] = [];
      const lit = /^"(.*)"$/.exec(formula);
      if (lit) options = lit[1].split(",").map((s) => s.trim());
      else {
        // Range reference: resolve against the extracted display values.
        const range = formula.replace(/^'?([^'!]+)'?!/, "").replace(/\$/g, "");
        const m2 = /^([A-Z]+\d+)(?::([A-Z]+\d+))?$/.exec(range);
        if (m2) {
          const s = a1ToRC(m2[1]);
          const e = m2[2] ? a1ToRC(m2[2]) : s;
          const seen = new Set<string>();
          for (let r = s.r; r <= e.r; r++)
            for (let c = s.c; c <= e.c; c++) {
              const v = out.values[`${r}:${c}`];
              if (v && !seen.has(v)) {
                seen.add(v);
                options.push(v);
              }
            }
        }
      }
      out.validations.push({ sqref, options });
    }
    // Drawings -> images.
    const sheetRelsPath =
      part.replace("worksheets/", "worksheets/_rels/") + ".rels";
    const sheetRels = parseRels(entry(sheetRelsPath) ?? "");
    for (const [, target] of sheetRels) {
      if (!target.includes("drawings/")) continue;
      const drawingPart = `xl/${target.replace(/^\.\.\//, "").replace(/^\//, "")}`;
      const drawingXml = entry(drawingPart);
      if (!drawingXml) continue;
      const drawingRelsPath =
        drawingPart.replace("drawings/", "drawings/_rels/") + ".rels";
      const drawingRels = parseRels(entry(drawingRelsPath) ?? "");
      const { images } = parseDrawing(drawingXml, drawingRels);
      for (const img of images as (Omit<ImageSpec, "src"> & {
        rid: string;
        toRow?: number;
        toCol?: number;
        toOffX?: number;
        toOffY?: number;
      })[]) {
        const mediaTarget = drawingRels.get(img.rid);
        if (!mediaTarget) continue;
        const mediaPart = `xl/${mediaTarget.replace(/^\.\.\//, "").replace(/^\//, "")}`;
        const media = zip.get(mediaPart)?.data;
        if (!media) continue;
        const fileName = `${slug}-${mediaPart.split("/").pop()}`;
        mediaOut.set(fileName, media);
        const spec: ImageSpec & Record<string, number | string | undefined> = {
          src: `/legacy-sheet/${fileName}`,
          row: img.row,
          col: img.col,
          offX: img.offX,
          offY: img.offY,
          w: img.w,
          h: img.h,
        };
        if (img.toRow) {
          spec.toRow = img.toRow;
          spec.toCol = img.toCol;
          spec.toOffX = +(img.toOffX ?? 0).toFixed(2);
          spec.toOffY = +(img.toOffY ?? 0).toFixed(2);
        }
        out.images.push(spec);
        imageLog.push(
          `${slug}: ${fileName} @ ${numToCol(img.col)}${img.row} +(${img.offX},${img.offY}) ${img.w}x${img.h}px`,
        );
      }
    }
    result[slug] = out;
    process.stderr.write(
      `${slug}: ${Object.keys(fullValues).length} extracted cells (${Object.keys(out.values).length} emitted), ${Object.keys(fullFormulas).length} formulas (${Object.keys(out.formulas).length} emitted), ${out.validations.length} validations, ${out.images.length} images\n`,
    );
  }

  // ---------- emit ----------
  const header = `// Generated by scripts/extract-legacy-sheet-full.ts from
// prgrss-2.0-full.xlsx (owner ruling 2026-10-26: demo data). Display text is
// the workbook cell text with number formats applied; FORMULAS carries the
// real formula text; IMAGES carries anchored drawing specs; VALIDATIONS
// carries the list options per sqref. Maps cover the rendered window of each
// tab (the layer the grid can display); --manifest writes the full extraction.
// Do not edit by hand.
// biome-ignore format: generated extraction artifact, kept compact for regeneration
`;
  const imgType = `type SheetImage = { src: string; row: number; col: number; offX: number; offY: number; w: number; h: number; toRow?: number; toCol?: number; toOffX?: number; toOffY?: number };\n`;
  const valType = `type SheetValidation = { sqref: string; options: string[] };\n`;
  const guard = `// biome-ignore format: generated extraction artifact, kept compact for regeneration\n`;
  const body =
    header +
    imgType +
    valType +
    guard +
    `const VALUES: Record<string, Record<string, string>> = ${JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.values])))};\n\n` +
    guard +
    `const FORMULAS: Record<string, Record<string, string>> = ${JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.formulas])))};\n\n` +
    guard +
    `const INK: Record<string, Record<string, string>> = ${JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.ink])))};\n\n` +
    guard +
    `const IMAGES: Record<string, SheetImage[]> = ${JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.images])))};\n\n` +
    guard +
    `const VALIDATIONS: Record<string, SheetValidation[]> = ${JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.validations])))};\n\n` +
    `export function sheetValue(\n  slug: string,\n  row: number,\n  col: number,\n): string | undefined {\n` +
    `  return VALUES[slug]?.[\`\${row}:\${col}\`];\n}\n\n` +
    `export function sheetFormula(\n  slug: string,\n  row: number,\n  col: number,\n): string | undefined {\n` +
    `  return FORMULAS[slug]?.[\`\${row}:\${col}\`];\n}\n\n` +
    `export function sheetInk(\n  slug: string,\n  row: number,\n  col: number,\n): string | undefined {\n` +
    `  return INK[slug]?.[\`\${row}:\${col}\`];\n}\n\n` +
    `export function sheetImages(slug: string): SheetImage[] {\n` +
    `  return IMAGES[slug] ?? [];\n}\n\n` +
    `export function sheetValidations(slug: string): SheetValidation[] {\n` +
    `  return VALIDATIONS[slug] ?? [];\n}\n`;

  if (!reportOnly) {
    for (const rel of OUT_FILES) {
      const p = join(ROOT, rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, body);
    }
    for (const dir of PUBLIC_DIRS) {
      const p = join(ROOT, dir);
      mkdirSync(p, { recursive: true });
      for (const [name, data] of mediaOut) writeFileSync(join(p, name), data);
    }
  }
  const manifest = arg("--manifest");
  if (manifest) {
    mkdirSync(dirname(resolve(manifest)), { recursive: true });
    writeFileSync(
      resolve(manifest),
      JSON.stringify(
        {
          source: xlsx,
          slugs: SLUGS,
          values: Object.fromEntries(
            Object.entries(full).map(([k, v]) => [k, v.values]),
          ),
          formulas: Object.fromEntries(
            Object.entries(full).map(([k, v]) => [k, v.formulas]),
          ),
        },
        null,
        0,
      ),
    );
  }
  process.stderr.write(`distinct strings: ${distinctStrings.size}\n`);
  process.stderr.write(
    `images:\n${imageLog.map((l) => `  ${l}`).join("\n")}\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
