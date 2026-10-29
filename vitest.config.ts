import path from "node:path";

import { defineConfig } from "vitest/config";

const ROOT = import.meta.dirname;

export default defineConfig({
  // tsconfig uses `jsx: "preserve"` for Next — the DOM harness needs real
  // JSX transformation in the unit pipeline only (rolldown oxc transform).
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [
    {
      // Two import roots share this test run. Root code maps "@/*" to the
      // repository root; the frontend subtree is its own app whose "@/*"
      // maps to frontend/src/* and whose own node_modules sit at identical
      // versions. Mounting the frontend twin under jsdom needs one react
      // and one next copy (a second instance breaks hooks and vi.mock only
      // covers one copy), so bare specifiers imported from anywhere under
      // frontend/ resolve against the root install first.
      name: "twin-resolution",
      enforce: "pre",
      async resolveId(source, importer, options) {
        const frontendImporter = importer?.includes("/frontend/src/");
        if (source.startsWith("@/")) {
          const rest = source.slice(2);
          if (frontendImporter) {
            const frontend = await this.resolve(
              path.resolve(ROOT, "frontend/src", rest),
              importer,
              { ...options, skipSelf: true },
            );
            if (frontend) return frontend;
          }
          return this.resolve(path.resolve(ROOT, rest), importer, {
            ...options,
            skipSelf: true,
          });
        }
        if (
          !importer?.includes("/frontend/") ||
          source.startsWith(".") ||
          source.startsWith("/") ||
          source.startsWith("\0")
        )
          return null;
        return (
          (await this.resolve(source, path.join(ROOT, "package.json"), {
            ...options,
            skipSelf: true,
          })) ?? null
        );
      },
    },
  ],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
  },
});
