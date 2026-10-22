import { resolve } from "node:path";
import type { NextConfig } from "next";

const playgroundUnavailable = resolve(
  process.cwd(),
  "src/components/vari8/playground-unavailable.ts",
);
const playgroundSource = resolve(
  process.cwd(),
  "src/components/vari8/playground.tsx",
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  webpack(config, { dev }) {
    if (!dev) {
      // Keep the development-only client graph out of every production compiler.
      config.resolve.alias = {
        ...config.resolve.alias,
        "@/components/vari8/playground$": playgroundUnavailable,
        [`${playgroundSource}$`]: playgroundUnavailable,
        [`${playgroundSource.slice(0, -4)}$`]: playgroundUnavailable,
      };
    }

    return config;
  },
};

export default nextConfig;
