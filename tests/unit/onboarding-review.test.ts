import { describe, expect, it } from "vitest";

/**
 * P-024 (decisions #86–#91 + the R2 binding contract) — unit surface for
 * the staff onboarding-submission review resource. The role matrix is the
 * settled #37 direction: owner workspace-read (no mark), coach assigned
 * read+mark, assistant assigned read-only, everyone else denied; the
 * resource joins PLATFORM_ADMIN_DENIED_RESOURCES so dual-role platform
 * admins are denied even through an ACTIVE membership.
 */
describe("onboardingSubmissionReviews — consent mapping (P-024)", () => {
  it("maps BASE_CONSENTS like its sibling protected resources", async () => {
    const { requiredConsentsFor, BASE_CONSENTS } =
      await import("../../lib/consent");
    expect(requiredConsentsFor("onboardingSubmissionReviews")).toEqual([
      ...BASE_CONSENTS,
    ]);
  });
});
