import { access, readFile } from "node:fs/promises";
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
  if (
    specifier === "./plans/phase-planning" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("./phase-planning.ts", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (
    specifier === "./plans/training/amara-example" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("./training/amara-example.ts", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (
    specifier === "./targets/model" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("../targets/model.ts", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (
    specifier === "./athlete/overview-widgets" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("../athlete/overview-widgets.ts", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (
    specifier === "./athlete/timeline" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("../athlete/timeline.ts", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (
    specifier === "./athlete-profile-demo" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("../athlete-profile-demo.ts", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (
    specifier === "./client-app-demo" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("../client-app-demo.ts", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (
    specifier === "./training-log-demo" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("../training-log-demo.ts", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (specifier.startsWith("@/")) {
    const path = new URL(specifier.slice(2), sourceRoot);
    const url = pathToFileURL(fileURLToPath(path)).href;
    if (/\.[a-z0-9]+$/i.test(url)) return { url, shortCircuit: true };
    for (const extension of [".ts", ".tsx", ".mjs", ".js", ".json"]) {
      try {
        await access(fileURLToPath(`${url}${extension}`));
        return { url: `${url}${extension}`, shortCircuit: true };
      } catch {
        // Try the next extension.
      }
    }
    return { url, shortCircuit: true };
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
