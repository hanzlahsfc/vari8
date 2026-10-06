// @vitest-environment jsdom

// P-013 — WorkspaceNav "Onboarding Assignments" entry: visible only for
// WORKSPACE_OWNER/COACH/ASSISTANT_COACH AND only when
// ENABLE_ONBOARDING_ASSIGNMENTS=1. Cosmetic visibility only — the route
// re-authorizes and the flag-off route is a 404.

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
  delete process.env.ENABLE_ONBOARDING_ASSIGNMENTS;
});

const WS = "ws_test";
const HREF = `/workspace/${WS}/onboarding/assignments`;

describe("P-013 workspace nav — Onboarding Assignments entry", () => {
  it.each(["WORKSPACE_OWNER", "COACH", "ASSISTANT_COACH"] as const)(
    "shows the link for %s when the flag is enabled",
    (role) => {
      process.env.ENABLE_ONBOARDING_ASSIGNMENTS = "1";
      const { container } = render(
        <WorkspaceNav workspaceId={WS} role={role} />,
      );
      const link = container.querySelector(`a[href="${HREF}"]`);
      expect(link).not.toBeNull();
      expect(link?.textContent).toBe("Onboarding Assignments");
    },
  );

  it.each(["WORKSPACE_OWNER", "COACH", "ASSISTANT_COACH"] as const)(
    "hides the link for %s when the flag is off",
    (role) => {
      delete process.env.ENABLE_ONBOARDING_ASSIGNMENTS;
      const { container } = render(
        <WorkspaceNav workspaceId={WS} role={role} />,
      );
      expect(container.querySelector(`a[href="${HREF}"]`)).toBeNull();
    },
  );

  it.each(["CLIENT", "SUPPORT"] as const)(
    "hides the link for %s even when enabled",
    (role) => {
      process.env.ENABLE_ONBOARDING_ASSIGNMENTS = "1";
      const { container } = render(
        <WorkspaceNav workspaceId={WS} role={role} />,
      );
      expect(container.querySelector(`a[href="${HREF}"]`)).toBeNull();
    },
  );
});
