// @vitest-environment jsdom

// P-016 — WorkspaceNav "Client Setup" entry: visible only for
// WORKSPACE_OWNER/COACH/ASSISTANT_COACH AND only when ENABLE_CLIENT_SETUP=1.
// Cosmetic visibility only — the route re-authorizes and the flag-off route
// is a 404.

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
  delete process.env.ENABLE_CLIENT_SETUP;
});

const WS = "ws_test";
const HREF = `/workspace/${WS}/client-setup`;

describe("P-016 workspace nav — Client Setup entry", () => {
  it.each(["WORKSPACE_OWNER", "COACH", "ASSISTANT_COACH"] as const)(
    "shows the link for %s when the flag is enabled",
    (role) => {
      process.env.ENABLE_CLIENT_SETUP = "1";
      const { container } = render(
        <WorkspaceNav workspaceId={WS} role={role} />,
      );
      const link = container.querySelector(`a[href="${HREF}"]`);
      expect(link).not.toBeNull();
      expect(link?.textContent).toBe("Client Setup");
    },
  );

  it.each(["WORKSPACE_OWNER", "COACH", "ASSISTANT_COACH"] as const)(
    "hides the link for %s when the flag is off",
    (role) => {
      delete process.env.ENABLE_CLIENT_SETUP;
      const { container } = render(
        <WorkspaceNav workspaceId={WS} role={role} />,
      );
      expect(container.querySelector(`a[href="${HREF}"]`)).toBeNull();
    },
  );

  it.each(["CLIENT", "SUPPORT"] as const)(
    "hides the link for %s even when enabled",
    (role) => {
      process.env.ENABLE_CLIENT_SETUP = "1";
      const { container } = render(
        <WorkspaceNav workspaceId={WS} role={role} />,
      );
      expect(container.querySelector(`a[href="${HREF}"]`)).toBeNull();
    },
  );
});
