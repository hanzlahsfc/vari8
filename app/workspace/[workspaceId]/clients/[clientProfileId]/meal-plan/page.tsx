import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isMealPlansEnabled } from "@/lib/mealplan/gate";
import { readStaffMealPlanFromAction } from "@/lib/mealplan/boundary";
import { collectMealPlanFoodIds } from "@/lib/mealplan/payload";
import { loadNutritionFoodMap } from "@/lib/nutrition/foods";
import { prisma } from "@/lib/db";

import { MealPlanEditor } from "@/components/mealplan/meal-plan-editor";
import { MealPlanVersionHistory } from "@/components/mealplan/version-history";

export const dynamic = "force-dynamic";

export const metadata = { title: "Client Meal Plan" };

/**
 * MEAL-PLAN-I1 (decision 115) — staff per-client meal-plan surface.
 * Assigned coaches AND explicitly assigned owners author the shared
 * draft and publish immutable effective-dated versions; unassigned
 * owners keep workspace-wide READ only; assistants read within assigned
 * scope; SUPPORT and PLATFORM_ADMIN (dual-role inclusive) are denied.
 * Every write re-authorizes inside its own serialized transaction —
 * `canWrite` here shapes the UI only.
 *
 * Feature gate first: an off/untrusted resolver returns 404 before any
 * session/database work.
 */
export default async function StaffClientMealPlanPage({
  params,
}: {
  params: Promise<{ workspaceId: string; clientProfileId: string }>;
}) {
  if (!isMealPlansEnabled()) notFound();

  const { workspaceId, clientProfileId } = await params;
  const { userId } = await requireSessionUser();
  if (
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    workspaceId.length > 128 ||
    typeof clientProfileId !== "string" ||
    clientProfileId.length === 0 ||
    clientProfileId.length > 128
  )
    notFound();

  const result = await readStaffMealPlanFromAction(
    { user: { id: userId } },
    { workspaceId, clientProfileId },
  );

  // The client name is tenant data: read it only after the authorizing
  // boundary call, so a denied response cannot carry it (RSC-NAME-LEAK).
  const client = result.ok
    ? await prisma.clientProfile.findFirst({
        where: { id: clientProfileId, workspaceId },
        select: { name: true },
      })
    : null;

  // Catalog foods for the draft's portion references so the shared
  // nutrition math (D29) renders the same totals the canvas computes.
  const draftFoods =
    result.ok && result.value.plan !== null
      ? await loadNutritionFoodMap(
          collectMealPlanFoodIds(result.value.plan.draft),
        )
      : undefined;

  return (
    <div className="tracker-page" data-testid="staff-mealplan-page">
      <header className="tracker-page__header">
        <p className="tracker-page__eyebrow">
          <Link href={`/workspace/${workspaceId}/clients`}>Clients</Link>
        </p>
        <h1 className="app-title">
          Meal plan{client ? ` — ${client.name}` : ""}
        </h1>
        <p className="app-lede">
          Coach-entered meals and nutrition values. Values are displayed exactly
          as entered — nothing is calculated.
        </p>
      </header>

      {!result.ok ? (
        <p className="daily-errors" role="alert" data-testid="mealplan-error">
          {result.message}
        </p>
      ) : (
        <>
          <MealPlanEditor
            workspaceId={workspaceId}
            clientProfileId={clientProfileId}
            plan={result.value.plan}
            canWrite={result.value.canWrite}
            foods={draftFoods ? [...draftFoods.values()] : undefined}
          />
          <MealPlanVersionHistory
            workspaceId={workspaceId}
            clientProfileId={clientProfileId}
            initialVersions={result.value.versions}
            initialCursor={result.value.nextCursor}
            currentVersionId={result.value.currentVersionId}
            upcoming={result.value.upcoming}
          />
        </>
      )}
    </div>
  );
}
