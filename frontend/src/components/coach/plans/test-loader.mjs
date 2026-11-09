import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceRoot = new URL("../../../", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
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
    specifier === "./client-app-demo" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("../client-app-demo.ts", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (
    specifier === "./library" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("../library.ts", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (
    specifier === "./library-demo" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("../library-demo.ts", import.meta.url).href,
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
    specifier === "./athlete-data-demo" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("../athlete-data-demo.ts", import.meta.url).href,
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
    specifier === "./athlete/overview-widgets" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("../athlete/overview-widgets.ts", import.meta.url).href,
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
    specifier === "./athlete/timeline-config" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("../athlete/timeline-config.ts", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (
    specifier === "./athlete/tracker-layout" &&
    context.parentURL?.startsWith("data:text/javascript")
  ) {
    return {
      url: new URL("../athlete/tracker-layout.ts", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (specifier.startsWith("@/")) {
    const path = new URL(specifier.slice(2), sourceRoot);
    const file = fileURLToPath(path);
    if (!/\.[a-z]+$/.test(file) && !existsSync(file))
      for (const ext of [".ts", ".tsx", ".js", ".json"])
        if (existsSync(file + ext))
          return {
            url: pathToFileURL(file + ext).href,
            shortCircuit: true,
          };
    return { url: pathToFileURL(file).href, shortCircuit: true };
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
