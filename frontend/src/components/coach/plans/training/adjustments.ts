import type { TimelineEvent } from "../../athlete/timeline";
import { type CoachState, uid } from "../../model";
import { addLocalDays, mondayOf } from "../../targets/model";
import {
  resolveTrainingWeek,
  type TrainingAdjustment,
  type TrainingAdjustmentRules,
  type TrainingPlan,
  type TrainingSession,
} from "../types";

/**
 * The same plan with only the adjustments whose date range overlaps a
 * calendar (Mon–Sun) week. Display weeks and plan weeks can drift when a plan
 * starts mid-week; this keeps the visible week aligned with its dates.
 */
export function planForDisplayWeek(
  plan: TrainingPlan,
  week: number,
): TrainingPlan {
  const start = addLocalDays(mondayOf(plan.startDate), (week - 1) * 7);
  const end = addLocalDays(start, 6);
  const adjustments = (plan.adjustments ?? []).filter(
    (adjustment) => adjustment.startDate <= end && adjustment.endDate >= start,
  );
  return adjustments.length === (plan.adjustments ?? []).length
    ? plan
    : { ...plan, adjustments };
}

const kindLabel = (kind: TrainingAdjustment["kind"]) =>
  kind === "intro" ? "Intro week" : "Deload";

/** Short summary used by timeline rows and client banners. */
export function adjustmentSummary(
  adjustment: TrainingAdjustment,
  intensity?: "off" | "rir" | "rpe",
): string {
  if (adjustment.mode === "none") return "No training";
  if (adjustment.mode === "manual") return "Adapted manually";
  const parts: string[] = [];
  const setsDelta = adjustment.rules?.setsDelta ?? -1;
  if (setsDelta < 0) {
    const count = Math.abs(Math.round(setsDelta));
    parts.push(`-${count} set${count === 1 ? "" : "s"}`);
  }
  if (intensity === "rir" && adjustment.rules?.rirDelta) {
    parts.push(`RIR +${adjustment.rules.rirDelta}`);
  }
  if (intensity === "rpe" && adjustment.rules?.rpeDelta) {
    parts.push(`RPE -${adjustment.rules.rpeDelta}`);
  }
  return parts.length ? `Adapted: ${parts.join(", ")}` : "No change";
}

/** Full sentence used by the training editor and client logbook banners. */
export function adjustmentBannerText(
  adjustment: TrainingAdjustment,
  intensity?: "off" | "rir" | "rpe",
): string {
  const label = adjustment.kind === "intro" ? "Intro week" : "Deload week";
  if (adjustment.mode === "none") return `${label} - no training this week`;
  if (adjustment.mode === "manual")
    return `${label} - sessions set up manually`;
  const parts: string[] = [];
  const setsDelta = adjustment.rules?.setsDelta ?? -1;
  if (setsDelta < 0) {
    const count = Math.abs(Math.round(setsDelta));
    parts.push(`-${count} set${count === 1 ? "" : "s"} per exercise`);
  }
  if (intensity === "rir" && adjustment.rules?.rirDelta) {
    parts.push(`RIR +${adjustment.rules.rirDelta}`);
  }
  if (intensity === "rpe" && adjustment.rules?.rpeDelta) {
    parts.push(`RPE -${adjustment.rules.rpeDelta}`);
  }
  return `${label} - adapted automatically (${parts.join(", ")})`;
}

function normalizeRules(
  rules: TrainingAdjustmentRules | undefined,
): TrainingAdjustmentRules {
  const raw = rules?.setsDelta;
  const setsDelta =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.min(0, Math.trunc(raw))
      : -1;
  const next: TrainingAdjustmentRules = { setsDelta };
  const rir = rules?.rirDelta;
  if (typeof rir === "number" && Number.isFinite(rir) && rir >= 0)
    next.rirDelta = Math.trunc(rir);
  const rpe = rules?.rpeDelta;
  if (typeof rpe === "number" && Number.isFinite(rpe) && rpe >= 0)
    next.rpeDelta = Math.trunc(rpe);
  return next;
}

/** Seed manual weeks from the plain overrides so ids survive the copy. */
function prepareAdjustment(
  plan: TrainingPlan,
  candidate: TrainingAdjustment,
): TrainingAdjustment {
  const existing = (plan.adjustments ?? []).find(
    (adjustment) => adjustment.id === candidate.id,
  );
  const basePlan: TrainingPlan = { ...plan, adjustments: [] };
  const manual: Record<string, TrainingSession[]> = {};
  if (candidate.mode === "manual") {
    for (let week = candidate.fromWeek; week <= candidate.toWeek; week += 1) {
      const key = String(week);
      const source =
        existing?.manual?.[key] ??
        candidate.manual?.[key] ??
        resolveTrainingWeek(basePlan, week);
      manual[key] = structuredClone(source);
    }
  }
  return {
    ...candidate,
    rules:
      candidate.mode === "rules" ? normalizeRules(candidate.rules) : undefined,
    manual: candidate.mode === "manual" ? manual : undefined,
    note: candidate.note?.trim() || undefined,
  };
}

function updatePlanAdjustments(
  plan: TrainingPlan,
  candidate: TrainingAdjustment,
): TrainingPlan {
  const adjustment = prepareAdjustment(plan, candidate);
  return {
    ...plan,
    adjustments: [
      ...(plan.adjustments ?? []).filter(
        (existing) => existing.id !== adjustment.id,
      ),
      adjustment,
    ],
  };
}

function removePlanAdjustments(
  plan: TrainingPlan,
  adjustmentId: string,
): TrainingPlan {
  const adjustments = (plan.adjustments ?? []).filter(
    (adjustment) => adjustment.id !== adjustmentId,
  );
  if (adjustments.length === (plan.adjustments ?? []).length) return plan;
  if (adjustments.length) return { ...plan, adjustments };
  const { adjustments: _removed, ...rest } = plan;
  return rest;
}

/**
 * Create or update the plan adjustment on the active training content (and the
 * matching draft, so the editor sees it) plus its mirrored timeline event in a
 * single state update. Nutrition is untouched.
 */
export function saveTrainingAdjustment(
  state: CoachState,
  clientId: string,
  candidate: TrainingAdjustment,
): CoachState {
  const client = state.clients.find((entry) => entry.id === clientId);
  if (!client) return state;
  const life = client.plans?.training;
  const activeVersion = life?.active;
  const active = activeVersion?.content;
  const draft =
    active && life?.draft && life.draft.id === active.id
      ? life.draft
      : undefined;
  const training =
    life && activeVersion
      ? {
          ...life,
          active: {
            ...activeVersion,
            content: updatePlanAdjustments(activeVersion.content, candidate),
          },
          ...(draft ? { draft: updatePlanAdjustments(draft, candidate) } : {}),
        }
      : life;
  const events = client.timelineEvents ?? [];
  const existingEvent = events.find(
    (event) => event.adjustmentId === candidate.id,
  );
  const event: TimelineEvent = {
    id: existingEvent?.id ?? uid("timeline"),
    kind: candidate.kind,
    startDate: candidate.startDate,
    endDate: candidate.endDate,
    note: candidate.note?.trim() || kindLabel(candidate.kind),
    adjustmentId: candidate.id,
  };
  const timelineEvents = existingEvent
    ? events.map((entry) => (entry.id === event.id ? event : entry))
    : [...events, event];
  return {
    ...state,
    clients: state.clients.map((entry) =>
      entry.id === clientId
        ? {
            ...entry,
            plans:
              training && client.plans
                ? { ...client.plans, training }
                : entry.plans,
            timelineEvents,
          }
        : entry,
    ),
  };
}

/** Remove the adjustment from active/draft content and its mirrored event. */
export function removeTrainingAdjustment(
  state: CoachState,
  clientId: string,
  adjustmentId: string,
): CoachState {
  const client = state.clients.find((entry) => entry.id === clientId);
  if (!client) return state;
  const life = client.plans?.training;
  const activeVersion = life?.active;
  const active = activeVersion?.content;
  const draft =
    active && life?.draft && life.draft.id === active.id
      ? life.draft
      : undefined;
  const training =
    life && activeVersion
      ? {
          ...life,
          active: {
            ...activeVersion,
            content: removePlanAdjustments(activeVersion.content, adjustmentId),
          },
          ...(draft
            ? { draft: removePlanAdjustments(draft, adjustmentId) }
            : {}),
        }
      : life;
  const events = client.timelineEvents ?? [];
  const timelineEvents = events.filter(
    (event) => event.adjustmentId !== adjustmentId,
  );
  if (training === life && timelineEvents.length === events.length)
    return state;
  return {
    ...state,
    clients: state.clients.map((entry) =>
      entry.id === clientId
        ? {
            ...entry,
            plans:
              training && client.plans
                ? { ...client.plans, training }
                : entry.plans,
            timelineEvents,
          }
        : entry,
    ),
  };
}
