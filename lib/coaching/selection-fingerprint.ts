import { createHash } from "node:crypto";

/**
 * Shared positional-selection fingerprint contract (P-016 convention, reused
 * by P-020A). Canonical SHA-256 of an ordered identity list (or several lists
 * joined in fixed order, `\x00` group separator, `\n` per entry). The
 * fingerprint is a CONSISTENCY token only — it proves the browser's
 * positional selection was made against the same authorized list the server
 * re-resolves at submit time. It never replaces authorization.
 */
export function computeSelectionFingerprint(...groups: string[][]): string {
  const hash = createHash("sha256");
  for (const [gi, group] of groups.entries()) {
    if (gi > 0) hash.update("\x00");
    for (const id of group) hash.update(`${id}\n`);
  }
  return hash.digest("hex");
}
