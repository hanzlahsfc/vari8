import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig uses `jsx: "preserve"` for Next — the DOM harness needs real
  // JSX transformation in the unit pipeline only (rolldown oxc transform).
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      // "@/*" tsconfig path — needed for tests importing app/* entrypoints.
      "@": path.resolve(import.meta.dirname),
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/*.spec.ts",
    ],
  },
});
