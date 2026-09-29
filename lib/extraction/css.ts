/**
 * Minimal CSS declaration extractor.
 *
 * Google Sheets puts per-cell-class rules (`.s0{...}`, `.s16{...}`) in an inline
 * `<style>` block, and base rules (`.waffle`, `.row-header`, ...) in
 * `resources/sheet.css`. Only simple class selectors are captured; compound or
 * descendant selectors are ignored.
 */

export type ClassDeclarations = Record<string, string>;

function parseDeclarations(block: string): ClassDeclarations {
  const declarations: ClassDeclarations = {};
  for (const part of block.split(";")) {
    const index = part.indexOf(":");
    if (index < 0) continue;
    const property = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (property.length > 0 && value.length > 0) {
      declarations[property] = value;
    }
  }
  return declarations;
}

export function parseCssDeclarations(
  css: string,
  wanted?: ReadonlySet<string>,
): Record<string, ClassDeclarations> {
  const result: Record<string, ClassDeclarations> = {};
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(css)) !== null) {
    const declarations = parseDeclarations(match[2]);
    if (Object.keys(declarations).length === 0) continue;
    for (const rawSelector of match[1].split(",")) {
      // Use the subject compound (the last one before a combinator) so scoped
      // rules like ".ritz .waffle .s25" and "td.s25" resolve to "s25".
      const lastCompound =
        rawSelector
          .trim()
          .split(/[\s>+~]+/)
          .pop() ?? "";
      const classes = [...lastCompound.matchAll(/\.([A-Za-z0-9_-]+)/g)].map(
        (m) => m[1],
      );
      for (const name of classes) {
        if (wanted && !wanted.has(name)) continue;
        result[name] = { ...(result[name] ?? {}), ...declarations };
      }
    }
  }
  return result;
}

/** Return the subset of a pre-parsed class map limited to `used` classes. */
export function pickClasses(
  allClasses: Record<string, ClassDeclarations>,
  used: ReadonlySet<string>,
): Record<string, ClassDeclarations> {
  const result: Record<string, ClassDeclarations> = {};
  for (const name of [...used].sort()) {
    if (allClasses[name]) result[name] = allClasses[name];
  }
  return result;
}
