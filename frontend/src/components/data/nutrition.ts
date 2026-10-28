/**
 * w2-c4 frontend twin of `components/canvas/data/nutrition.ts`: the same
 * wire shapes and read contract for the own iifym-plans surface. The
 * standalone preview has no backend, so a call here resolves to the
 * server when one shares the origin and rejects otherwise - the screen
 * renders its error state, matching the canvas failure convention.
 */

export type IifymTargetValueWire =
  | { kind: "fixed"; value: number }
  | { kind: "range"; min: number; max: number }
  | { kind: "minimum"; value: number };

export type IifymTargetsWire = {
  style: "calories" | "macros";
  calories?: IifymTargetValueWire;
  protein?: IifymTargetValueWire;
  carbs?: IifymTargetValueWire;
  fat?: IifymTargetValueWire;
};

export type IifymOptionWire = {
  id: string;
  label: string;
  targets: IifymTargetsWire;
};

export type IifymScheduleWire =
  | { mode: "manual"; selectedVariantId: string }
  | { mode: "weekly"; days: Partial<Record<string, string>> }
  | {
      mode: "cycle";
      anchorDate: string;
      steps: { variantId: string; days: number }[];
    };

export type IifymPayloadWire = {
  options: IifymOptionWire[];
  name?: string;
  startDate?: string;
  schedule?: IifymScheduleWire;
};

export type OwnIifymPlanWire = {
  current: {
    versionSeq: number;
    effectiveDate: string;
    effectiveTimezone: string;
    payload: IifymPayloadWire;
  } | null;
  upcoming: {
    versionSeq: number;
    effectiveDate: string;
    effectiveTimezone: string;
  } | null;
};

/** GET iifym-plans - the caller's own published macro target version. */
export async function fetchOwnIifymPlan(
  workspaceId: string,
): Promise<OwnIifymPlanWire> {
  const response = await fetch(
    `/api/v1/workspaces/${workspaceId}/iifym-plans`,
    { credentials: "same-origin" },
  );
  if (!response.ok) throw new Error(`iifym-plans ${response.status}`);
  return (await response.json()) as OwnIifymPlanWire;
}
