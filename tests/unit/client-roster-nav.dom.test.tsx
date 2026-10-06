// @vitest-environment jsdom

// P-010 — WorkspaceNav "Clients" visibility pin (jsdom + testing-library).
// `next/link` is mocked to a plain anchor so the server component renders
// standalone. Cosmetic visibility only — the route itself re-authorizes.
// P-010-R2: CLIENT resolves `clientProfiles/read` → `own`, so the item carries
// an explicit staff-role pin; the route-level CLIENT denial stays covered by
// the E2E spec.

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

  // P-010-R2: the roster is a STAFF-only surface. CLIENT resolves
  // `clientProfiles/read` → `own`, so the generic scope filter alone would
  // render the link — the item must carry an explicit staff-role pin.
  it("hides the Clients link for CLIENT (staff-only surface)", () => {
    const { container } = render(
      <WorkspaceNav workspaceId={WS} role="CLIENT" />,
    );
    expect(
      container.querySelector(`a[href="/workspace/${WS}/clients"]`),
    ).toBeNull();
  });
});
