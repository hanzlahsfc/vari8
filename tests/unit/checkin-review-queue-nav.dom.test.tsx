// @vitest-environment jsdom

// CHECK-IN-OVERVIEW-I1 — WorkspaceNav "Check-In Reviews" entry: visible
// only for WORKSPACE_OWNER/COACH/ASSISTANT_COACH AND only when
// ENABLE_CHECK_INS resolves on. Cosmetic visibility only — the route
// re-authorizes server-side and flag-off is a 404.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import { WorkspaceNav } from "../../components/workspace-nav";

afterEach(() => {
  cleanup();
  delete process.env.ENABLE_CHECK_INS;
});

const WS = "ws_test";
const HREF = `/workspace/${WS}/checkins/review-queue`;

describe("CHECK-IN-OVERVIEW-I1 workspace nav — Check-In Reviews entry", () => {
  it.each(["WORKSPACE_OWNER", "COACH", "ASSISTANT_COACH"] as const)(
    "shows the link for %s when the flag is enabled",
    (role) => {
      process.env.ENABLE_CHECK_INS = "1";
      const { container } = render(
        <WorkspaceNav workspaceId={WS} role={role} />,
      );
      const link = container.querySelector(`a[href="${HREF}"]`);
      expect(link).not.toBeNull();
      expect(link?.textContent).toBe("Check-In Reviews");
    },
  );

  it.each(["WORKSPACE_OWNER", "COACH", "ASSISTANT_COACH"] as const)(
    "hides the link for %s when the flag is off",
    (role) => {
      delete process.env.ENABLE_CHECK_INS;
      const { container } = render(
        <WorkspaceNav workspaceId={WS} role={role} />,
      );
      expect(container.querySelector(`a[href="${HREF}"]`)).toBeNull();
    },
  );

  it.each(["CLIENT", "SUPPORT"] as const)(
    "hides the link for %s even when enabled",
    (role) => {
      process.env.ENABLE_CHECK_INS = "1";
      const { container } = render(
        <WorkspaceNav workspaceId={WS} role={role} />,
      );
      expect(container.querySelector(`a[href="${HREF}"]`)).toBeNull();
    },
  );
});
