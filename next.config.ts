import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // S1-H: enables `forbidden()` (from `next/navigation`) so the workspace shell
  // renders `app/forbidden.tsx` with a real HTTP 403 for authorization denials.
  experimental: { authInterrupts: true },
};

export default nextConfig;
