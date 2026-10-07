// @vitest-environment jsdom

// P-014 — WorkspaceNav "Parameters" and "Templates" entries: visible only
// for WORKSPACE_OWNER/COACH and only when ENABLE_COACHING_TEMPLATES=1.
// Cosmetic visibility only — routes re-authorize and flag-off routes 404.

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

const WS = "ws_test";
const PARAMS_HREF = `/workspace/${WS}/parameters`;
const TEMPLATES_HREF = `/workspace/${WS}/templates`;

afterEach(() => {
  cleanup();
  delete process.env.ENABLE_COACHING_TEMPLATES;
});

describe("P-014 workspace nav — Parameters and Templates entries", () => {
  it.each(["WORKSPACE_OWNER", "COACH"] as const)(
    "shows both entries for %s when the flag is enabled",
    (role) => {
      process.env.ENABLE_COACHING_TEMPLATES = "1";
      const { container } = render(
        <WorkspaceNav workspaceId={WS} role={role} />,
      );
      expect(
        container.querySelector(`a[href="${PARAMS_HREF}"]`)?.textContent,
      ).toBe("Parameters");
      expect(
        container.querySelector(`a[href="${TEMPLATES_HREF}"]`)?.textContent,
      ).toBe("Templates");
    },
  );

  it.each(["WORKSPACE_OWNER", "COACH"] as const)(
    "hides both entries for %s when the flag is off",
    (role) => {
      const { container } = render(
        <WorkspaceNav workspaceId={WS} role={role} />,
      );
      expect(container.querySelector(`a[href="${PARAMS_HREF}"]`)).toBeNull();
      expect(container.querySelector(`a[href="${TEMPLATES_HREF}"]`)).toBeNull();
    },
  );

  it.each(["ASSISTANT_COACH", "SUPPORT", "CLIENT"] as const)(
    "hides both entries for %s even when the flag is on",
    (role) => {
      process.env.ENABLE_COACHING_TEMPLATES = "1";
      const { container } = render(
        <WorkspaceNav workspaceId={WS} role={role} />,
      );
      expect(container.querySelector(`a[href="${PARAMS_HREF}"]`)).toBeNull();
      expect(container.querySelector(`a[href="${TEMPLATES_HREF}"]`)).toBeNull();
    },
  );
});
