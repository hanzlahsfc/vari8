// CLI shim: validate a transition manifest file. Exit 0 valid, exit 2 invalid.
import { readFileSync } from "node:fs";
import { validateTransitionManifest } from "./transition-manifest.mjs";
const file = process.argv[2];
if (!file) {
  console.error("usage: transition-check.mjs <manifest.json>");
  process.exit(2);
}
try {
  validateTransitionManifest(JSON.parse(readFileSync(file, "utf8")));
  console.log("transition manifest valid");
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
