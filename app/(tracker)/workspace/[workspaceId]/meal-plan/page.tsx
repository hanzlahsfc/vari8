import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isMealPlansEnabled } from "@/lib/mealplan/gate";
import { readOwnMealPlanFromAction } from "@/lib/mealplan/boundary";
import { collectMealPlanFoodIds } from "@/lib/mealplan/payload";
import { loadNutritionFoodMap } from "@/lib/nutrition/foods";

import { MealPlanVersionView } from "@/components/mealplan/plan-version-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Meal Plan" };

/**
 * MEAL-PLAN-I1 (decision 115) — client meal-plan view. Own-scope only:
 * the server resolves the CURRENT published version
 * (`activationInstant <= now`, then `effectiveDate DESC, versionSeq
 * DESC`) identically for coach and client — the browser's timezone is
 * never consulted. Three truthful states: current plan / "starts {date}
 * ({tz})" / "No meal plan yet". View-only — no write path exists.
 * Feature gate first.
 */
export default async function ClientMealPlanPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if (!isMealPlansEnabled()) notFound();

  const { workspaceId } = await params;
  const { userId } = await requireSessionUser();
  const result = await readOwnMealPlanFromAction(
    { user: { id: userId } },
    { workspaceId },
  );

  // Catalog foods for the published payload's portion references —
  // totals come from the shared canvas math (D29).
  const foods =
    result.ok && result.value.current !== null
      ? await loadNutritionFoodMap(
          collectMealPlanFoodIds(result.value.current.payload),
        )
      : undefined;

  return (
    <div className="tracker-page" data-testid="client-mealplan-page">
      <header className="tracker-page__header">
        <p className="tracker-page__eyebrow">Workspace</p>
        <h1 className="app-title">Meal plan</h1>
        <p className="app-lede">
          Your current meal plan as published by your coach.
        </p>
      </header>

      {!result.ok ? (
        <p className="daily-errors" role="alert" data-testid="mealplan-error">
          {result.message}
        </p>
      ) : result.value.current !== null ? (
        <div data-testid="mealplan-current">
          <p className="app-lede">
            Effective {result.value.current.effectiveDate} (
            {result.value.current.effectiveTimezone})
          </p>
          {result.value.upcoming !== null ? (
            <p className="app-lede" data-testid="mealplan-next">
              A new version starts {result.value.upcoming.effectiveDate} (
              {result.value.upcoming.effectiveTimezone})
            </p>
          ) : null}
          <MealPlanVersionView
            payload={result.value.current.payload}
            testidPrefix="mealplan-current"
            foods={foods}
          />
        </div>
      ) : result.value.upcoming !== null ? (
        <p className="app-lede" data-testid="mealplan-upcoming">
          Your meal plan starts {result.value.upcoming.effectiveDate} (
          {result.value.upcoming.effectiveTimezone})
        </p>
      ) : (
        <p className="app-lede" data-testid="mealplan-empty">
          No meal plan yet.
        </p>
      )}
    </div>
  );
}
