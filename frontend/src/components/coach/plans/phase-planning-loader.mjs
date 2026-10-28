import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceRoot = new URL("../../../", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const path = fileURLToPath(new URL(specifier.slice(2), sourceRoot));
    for (const suffix of ["", ".ts", ".tsx", ".js", ".json"]) {
      if (existsSync(`${path}${suffix}`))
        return {
          url: pathToFileURL(`${path}${suffix}`).href,
          shortCircuit: true,
        };
    }
  }
  if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // Let Node report unresolved non-TypeScript imports.
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
