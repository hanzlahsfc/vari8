import type { SourceRecords, WidgetInstance } from "./model";

export type AdaptiveWidgetProps = {
  widget: WidgetInstance;
  records: SourceRecords;
  /** Outer geometry is retained for layout/debugging; composition uses the body. */
  width: number;
  height: number;
  /** Explicit canvas span keeps three-column summaries stable on wide desktops. */
  columnSpan?: number;
  bodyWidth: number;
  bodyHeight: number;
  clientPreview: boolean;
  onRecordsChange: (records: SourceRecords) => void;
  onDetail: (key: string) => void;
  onPeriodChange?: (period: string) => void;
};

/** First paint/SSR estimate only. ResizeObserver replaces it with the real box. */
export function initialBodyBudget(width: number, height: number) {
  return {
    width: Math.max(1, width - 34),
    height: Math.max(1, height - 70),
  };
}

export function widgetDetailKey(widget: WidgetInstance) {
  const { kind, settings: s } = widget;
  switch (kind) {
    case "BN21":
      return `metric:${s.source}`;
    case "BN01":
      return "bodyweight";
    case "BN08":
      return `additional:BN08:${s.unit}:${s.option}:${s.period}`;
    case "BN15":
      return s.source;
    case "BN19":
      return `additional:BN19:${s.fields[0] || "protein"}:${encodeURIComponent(s.source)}:${s.period}`;
    case "TL26":
      return "workouts";
    case "TL28":
      return s.source;
    case "TL06":
      return "steps";
    case "TL11":
      return `additional:TL11:${s.unit}:${s.period}`;
    case "TL14":
      return "recovery";
    case "TL21":
      return "habits";
    case "TL22":
      return `additional:TL22:${s.period}:${s.fields.join(",")}`;
    case "CU01":
      return "additional:CU01:phase,focus,successCue";
    case "CU02":
      return `additional:CU02:${s.fields.join(",")}`;
    case "CU09":
      return `additional:CU09:${s.period}:${s.fields.join(",")}`;
    case "CU10":
      return `additional:CU10:${s.fields[0] || "phase-end"}`;
    case "CU03":
      return "tasks";
    case "CU04":
      return "checkins";
    case "CU06":
      return "feedback";
    case "CU16":
      return `destination:${s.fields[0] || "Tracker"}`;
  }
}
