// W2-T5 coach attention triage. CU19 mount condition.
// @vitest-environment jsdom

/**
 * The dashboard builder must mount the CU19 widget through the coaching
 * dispatcher and render the derived triage rows with their reasons. The
 * assertions read what the coach reads: the client name and the reason
 * string the roster produces.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CoachingWidgetContent } from "@/components/canvas/coach/builder/coaching-content";
import type {
  SourceRecords,
  WidgetInstance,
} from "@/components/canvas/coach/builder/model";
import type { AdaptiveWidgetProps } from "@/components/canvas/coach/builder/widget-geometry";

afterEach(cleanup);

function props(
  records: Partial<SourceRecords>,
  clientPreview = false,
): AdaptiveWidgetProps {
  const widget: WidgetInstance = {
    id: "w-triage",
    kind: "CU19",
    settings: {
      title: "Needs attention",
      source: "roster:attention",
      summary: "enabled",
      period: "",
      target: false,
      size: "Tall",
      fields: [],
      option: "default",
      unit: "",
    },
  };
  return {
    widget,
    records: records as SourceRecords,
    bodyWidth: 360,
    bodyHeight: 240,
    clientPreview,
    onRecordsChange: () => {},
  } as unknown as AdaptiveWidgetProps;
}

const triage = [
  {
    clientId: "c-1",
    name: "Theo Grant",
    reasons: ["check-in overdue"],
    priority: 4,
    attentionCount: 1,
  },
];

describe("CU19 mount", () => {
  it("renders the client and the roster reason", () => {
    render(<CoachingWidgetContent {...props({ triage })} />);
    expect(screen.getByText("Theo Grant")).toBeTruthy();
    expect(screen.getByText("check-in overdue")).toBeTruthy();
  });

  it("renders the cleared state when no client needs attention", () => {
    render(<CoachingWidgetContent {...props({ triage: [] })} />);
    expect(
      screen.getByText("No clients need attention right now."),
    ).toBeTruthy();
    expect(screen.queryByText("Theo Grant")).toBeNull();
  });

  it("never surfaces roster rows on the client preview surface", () => {
    render(<CoachingWidgetContent {...props({ triage }, true)} />);
    expect(screen.queryByText("Theo Grant")).toBeNull();
  });
});
