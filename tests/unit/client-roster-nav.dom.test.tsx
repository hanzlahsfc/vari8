// @vitest-environment jsdom

// P-010 — WorkspaceNav "Clients" visibility pin (jsdom + testing-library).
// `next/link` is mocked to a plain anchor so the server component renders
// standalone. Cosmetic visibility only — the route itself re-authorizes.
// Note: CLIENT also resolves `clientProfiles/read` → `own`, so the generic
// filter would show the link — but the workspace shell denies CLIENT via
// `workspaceSettings/read` before nav ever renders; that denial is pinned
// in the E2E spec, not here.

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

afterEach(cleanup);

const WS = "ws_test";

describe("P-010 workspace nav — Clients entry", () => {
  it.each(["WORKSPACE_OWNER", "COACH", "ASSISTANT_COACH"] as const)(
    "shows the Clients link for %s",
    (role) => {
      const { container } = render(
        <WorkspaceNav workspaceId={WS} role={role} />,
      );
      const link = container.querySelector(
        `a[href="/workspace/${WS}/clients"]`,
      );
      expect(link).not.toBeNull();
      expect(link?.textContent).toBe("Clients");
    },
  );

  it("hides the Clients link for SUPPORT", () => {
    const { container } = render(
      <WorkspaceNav workspaceId={WS} role="SUPPORT" />,
    );
    expect(
      container.querySelector(`a[href="/workspace/${WS}/clients"]`),
    ).toBeNull();
  });
});
