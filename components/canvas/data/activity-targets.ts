// Activity-targets domain provider. Issue #169 (Stage 5 card 07). Remote:
// reads and writes go through the shared /api/v1 client (http.ts) to the thin
// route over lib/activity-targets/*. The wire metric carries the tracker key
// verbatim ('steps' | 'cardioMin'); the canvas model uses 'cardio', the
// mapping lives only here.

import type {
  ActivityChange,
  ActivityTargetVersion,
  CardioTarget,
  StepsTarget,
} from "../coach/targets/model";
import { apiFetch } from "./http";

// Wire shapes mirror lib/activity-targets/service.ts; duplicated here so the
// canvas never imports server modules.
export type ActivityTargetVersionWire = {
  id: string;
  metric: "steps" | "cardioMin";
  kind: "MINIMUM" | "MAXIMUM" | "RANGE" | "FIXED" | "CARDIO" | null;
  stepMin: number | null;
  stepMax: number | null;
  sessionsPerWeek: number | null;
  minutesPerSession: number | null;
  effectiveFrom: string;
  stoppedAt: string | null;
  revision: number;
};

export type ActivityTargetsViewWire = {
  clientProfileId: string;
  versions: ActivityTargetVersionWire[];
};

export type ActivityTargetWriteWire =
  | { kind: "MINIMUM"; stepMin: number }
  | { kind: "MAXIMUM"; stepMax: number }
  | { kind: "RANGE"; stepMin: number; stepMax: number }
  | { kind: "FIXED"; stepMin: number }
  | { kind: "CARDIO"; sessionsPerWeek: number; minutesPerSession: number }
  | null;

const path = (workspaceId: string, clientProfileId: string) =>
  `/workspaces/${workspaceId}/clients/${clientProfileId}/activity-targets`;

/** GET activity-targets: staff scope reads `clientProfileId`, own scope the caller's profile. */
export function fetchActivityTargets(
  workspaceId: string,
  clientProfileId: string,
): Promise<ActivityTargetsViewWire> {
  return apiFetch<ActivityTargetsViewWire>(path(workspaceId, clientProfileId));
}

/** PUT activity-targets: one day-effective version write (staff only). */
export function saveActivityTargetRemote(
  workspaceId: string,
  clientProfileId: string,
  input: {
    metric: "steps" | "cardioMin";
    effectiveFrom: string;
    target: ActivityTargetWriteWire;
    confirmSameDay?: boolean;
  },
): Promise<{ id: string; revision: number }> {
  return apiFetch<{ id: string; revision: number }>(
    path(workspaceId, clientProfileId),
    { method: "PUT", body: input },
  );
}

// Wire -> canvas: one row is one version; a null-kind row is a stop.
function targetFromWire(
  version: ActivityTargetVersionWire,
): StepsTarget | CardioTarget | null {
  switch (version.kind) {
    case null:
      return null;
    case "MINIMUM":
      return { kind: "minimum", value: version.stepMin ?? Number.NaN };
    case "MAXIMUM":
      return { kind: "maximum", value: version.stepMax ?? Number.NaN };
    case "FIXED":
      return { kind: "fixed", value: version.stepMin ?? Number.NaN };
    case "RANGE":
      return {
        kind: "range",
        min: version.stepMin ?? Number.NaN,
        max: version.stepMax ?? Number.NaN,
      };
    case "CARDIO":
      return {
        sessionsPerWeek: version.sessionsPerWeek ?? Number.NaN,
        minutesPerSession: version.minutesPerSession ?? Number.NaN,
      };
  }
}

export function versionsFromWire(
  versions: ActivityTargetVersionWire[],
): ActivityTargetVersion[] {
  return versions.map((version) =>
    version.metric === "steps"
      ? {
          id: version.id,
          effectiveFrom: version.effectiveFrom,
          metric: "steps",
          target: targetFromWire(version) as StepsTarget | null,
        }
      : {
          id: version.id,
          effectiveFrom: version.effectiveFrom,
          metric: "cardio",
          target: targetFromWire(version) as CardioTarget | null,
        },
  );
}

// Canvas -> wire: a change's metric maps to the tracker key; target null is
// the stop write.
export function changeToWrite(change: ActivityChange): {
  metric: "steps" | "cardioMin";
  target: ActivityTargetWriteWire;
} {
  if (change.metric === "cardio") {
    return {
      metric: "cardioMin",
      target:
        change.target === null
          ? null
          : {
              kind: "CARDIO",
              sessionsPerWeek: change.target.sessionsPerWeek,
              minutesPerSession: change.target.minutesPerSession,
            },
    };
  }
  const target = change.target;
  if (target === null) return { metric: "steps", target: null };
  switch (target.kind) {
    case "minimum":
      return {
        metric: "steps",
        target: { kind: "MINIMUM", stepMin: target.value },
      };
    case "maximum":
      return {
        metric: "steps",
        target: { kind: "MAXIMUM", stepMax: target.value },
      };
    case "fixed":
      return {
        metric: "steps",
        target: { kind: "FIXED", stepMin: target.value },
      };
    case "range":
      return {
        metric: "steps",
        target: { kind: "RANGE", stepMin: target.min, stepMax: target.max },
      };
  }
}
