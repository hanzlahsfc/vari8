import {
  requireSessionUser,
  requireWorkspaceAccess,
} from "@/lib/auth/route-guard";

import { CreateOnboardingForm } from "./create-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "New Onboarding Form" };

/**
 * P-008 5C-1 — create an onboarding form definition.
 *
 * Session gate first (unauthenticated → `/login`), then a per-page WRITE
 * authorization re-resolves the current membership/role/workspace on every
 * request — the parent layout grant is never reused as authority. Denied
 * roles, foreign workspaces and malformed segments fail closed to the
 * repo-standard non-disclosing HTTP 403; the mutation itself is enforced
 * again inside the `createForm` server action through the boundary.
 */
export default async function NewOnboardingFormPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { session } = await requireSessionUser();
  await requireWorkspaceAccess(session, {
    resource: "onboardingFormTemplates",
    action: "write",
    workspaceId,
  });

  return (
    <div className="catalog-page" data-testid="new-onboarding-form-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Workspace</p>
        <h1 className="app-title">New onboarding form</h1>
        <p className="app-lede">
          Name the form definition. Fields are added in the editor after
          creation.
        </p>
      </header>
      <CreateOnboardingForm workspaceId={workspaceId} />
    </div>
  );
}
