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
    ignores: [
      "node_modules/**",
      "frontend/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
