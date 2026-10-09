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
      {
        // Phase 3.2: same bearer-token-in-URL protection for the reset
        // consume route, plus an explicit no-store belt on the dynamic
        // page's existing no-cache behavior. Route-scoped; no global change.
        source: "/reset",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        // P-022: the staff DailyEntry review route serves health data — an
        // explicit no-store on the route path covers the page GET and the
        // Server Action POST (path sources match all methods). No global
        // change; sibling routes are unaffected.
        source: "/workspace/:workspaceId/clients/:clientProfileId/daily",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        // P-023: the client onboarding submission routes may carry own
        // answer content — explicit no-store on both leaves covers the page
        // GETs and the Server Action POST. Route-scoped; no global change.
        source: "/workspace/:workspaceId/onboarding",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/workspace/:workspaceId/onboarding/:assignmentId",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
