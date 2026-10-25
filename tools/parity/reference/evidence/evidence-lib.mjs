import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");
export const fileHash = (p) => sha256(fs.readFileSync(p));

export function verifyArtifactIndex(root, entries) {
  if (!Array.isArray(entries) || entries.length === 0)
    throw new Error("artifact index is empty or malformed");
  const base = path.resolve(root);
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      typeof entry.sha256 !== "string"
    )
      throw new Error("artifact index entry is malformed");
    const file = path.resolve(base, entry.path);
    if (!file.startsWith(base + path.sep))
      throw new Error(`artifact path escapes evidence root: ${entry.path}`);
    if (!fs.existsSync(file))
      throw new Error(`missing artifact: ${entry.path}`);
    const actual = fileHash(file);
    if (actual !== entry.sha256)
      throw new Error(`tampered artifact: ${entry.path}`);
  }
  return entries.length;
}
