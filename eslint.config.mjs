import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // eslint-config-next@16 bundles eslint-plugin-react-hooks v6, whose new
    // recommended rules flag pre-existing code (10 findings across 6 files).
    // PR-03b fixed those findings at their root causes; the rules are back
    // at error so the codebase cannot regress.
    rules: {
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/refs": "error",
      "react-hooks/purity": "error",
      "react-hooks/immutability": "error",
    },
  },
  {
    // PR-01: the canvas trees are Lilly's frontend carried unchanged (the D32
    // parity source; Biome gates the original in frontend/). The React
    // Compiler hook rules flag 65 pre-existing findings there; they report as
    // warnings in these two trees only, until a canvas cleanup lane fixes them.
    files: ["components/canvas/**", "lib/canvas/**"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/use-memo": "warn",
    },
  },
  {
    ignores: [
      "node_modules/**",
      "frontend/**",
      ".next/**",
      "out/**",
      // Generated reference adapters and capture artifacts are runtime evidence.
      "tools/parity/out/**",
      // Immutable packaged evidence only: generated adapter copies preserved
      // byte-accurately for provenance (never executed by the runner — each run
      // regenerates its adapter into tools/parity/out/) and receipt/log data.
      "tools/parity/reference/combined/*/adapter/**",
      "tools/parity/reference/combined/*/receipts/**",
      "build/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
      // ICM lane artifacts (reports, evidence, verifier probes) — not
      // product code; e.g. probe sources carry intentional `any`.
      "icm/**/evidence/",
    ],
  },
];

export default eslintConfig;
