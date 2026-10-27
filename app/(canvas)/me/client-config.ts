import { templateDefinitionSlots } from "@/lib/db-types/template-slots";
import type { ClientPlans } from "@/components/canvas/coach/plans/types";
import type { SupplementPlan } from "@/components/canvas/coach/supplements/model";
import type { ActivityTargetVersion } from "@/components/canvas/coach/targets/model";

/**
 * Card w2-c1: the real client shell resolves the coach's variant from the
 * signed-in client's active template version definition. The optional
 * `modules` slot on that definition (lib/db-types/template-slots.ts) mirrors
 * the canvas Variant: when a coach published views/habits they are
 * authoritative; a definition that predates the slot keeps every section the
 * registry knows, because nothing was ever disabled on it.
 *
 * These helpers are pure so the section contract is unit-testable; the page
 * supplies the definition JSON and the data-presence counts.
 */

export type ClientAppConfig = {
  views: string[];
  habits: boolean;
  nutrition: "Meal plan" | "IIFYM";
};

const DEFAULT_CLIENT_VIEWS = [
  "Dashboard",
  "Tracker",
  "Nutrition",
  "Timeline / Roadmap",
  "Training Program",
  "Check-In",
];

export function clientConfigFromDefinition(
  definition: unknown,
): ClientAppConfig {
  const parsed = templateDefinitionSlots.safeParse(
    typeof definition === "object" && definition !== null ? definition : {},
  );
  const slots = parsed.success ? parsed.data : {};
  return {
    views: slots.modules?.views ?? [...DEFAULT_CLIENT_VIEWS],
    habits: slots.modules?.habits ?? false,
    nutrition: slots.nutritionMode === "IIFYM" ? "IIFYM" : "Meal plan",
  };
}

/**
 * Plan-part presence for `clientAppSections`: only existence and count matter
 * (the section registry checks `supplements !== undefined` and
 * `activityTargets.length`), so the real rows are fetched by the remote
 * section components themselves, not here.
 */
export function clientPlansPresence(presence: {
  hasSupplementPlan?: boolean;
  activityTargetCount?: number;
}): Pick<ClientPlans, "supplements" | "activityTargets"> {
  return {
    supplements: presence.hasSupplementPlan
      ? ({
          id: "remote",
          clientId: "",
          name: "",
          items: [],
          savedAt: "",
        } as SupplementPlan)
      : undefined,
    activityTargets: Array.from(
      { length: presence.activityTargetCount ?? 0 },
      () => ({ id: "remote", effectiveFrom: "" }) as ActivityTargetVersion,
    ),
  };
}
