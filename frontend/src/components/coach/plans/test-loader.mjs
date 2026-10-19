import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceRoot = new URL("../../../", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (
    specifier === "./plans/domain" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("./domain.ts", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (specifier.startsWith("@/")) {
    const path = new URL(specifier.slice(2), sourceRoot);
    return { url: pathToFileURL(fileURLToPath(path)).href, shortCircuit: true };
  }
  if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // Preserve Node's own error for bare files, JSON, and directory imports.
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    const source = await readFile(fileURLToPath(url), "utf8");
    return {
      format: "module",
      source: `export default ${source.trim()};`,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
