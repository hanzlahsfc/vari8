import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // S1-H: enables `forbidden()` (from `next/navigation`) so the workspace shell
  // renders `app/forbidden.tsx` with a real HTTP 403 for authorization denials.
  experimental: { authInterrupts: true },
  async headers() {
    return [
      {
        // Phase 3.1: the invite bearer token lives in the URL query — never
        // let the document leak it through Referer to subresources or link
        // targets. Route-scoped (source: "/invite"); no global policy change.
        source: "/invite",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
