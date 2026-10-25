"use client";

import type { ReactNode } from "react";

import { TrackingView as SharedTrackingView } from "@/components/canvas/coach/client-tracker-preview/tracking-view";
import {
  categories,
  parameters,
  type TrackerConfig,
  type TrackerEntry,
} from "./model";
import "./shared-tracker.css";

type TrackingViewProps = {
  config: TrackerConfig;
  entries: TrackerEntry[];
  clientName: string;
  clientInitials: string;
  asOf: string;
  onConfigure?: () => void;
  onUpdateValue: (date: string, id: string, value: number | null) => void;
  comments: Record<string, string>;
  onSaveComment: (date: string, id: string, text: string) => void;
  /**
   * Remote mode (card 05a): `config` already carries the server's parameter
   * definitions, the caller supplies text values and the surface's own
   * grouping, and the client never sees the coach-notes mode or the template
   * configurator.
   */
  remote?: boolean;
  parameterGroups?: Record<string, string>;
  textValues?: Record<string, string>;
  /** Issue #169: the day/week target readout, resolved for the selected date. */
  renderTargets?: (context: {
    date: string;
    view: "Today" | "Week";
  }) => ReactNode;
  onUpdateText?: (date: string, id: string, value: string) => void;
};

const NO_TEXT_VALUES: Record<string, string> = {};
const NOOP_UPDATE_TEXT = () => {};
const PARAMETER_GROUPS = Object.fromEntries(
  parameters.map((parameter) => [
    parameter.id,
    categories.find((category) => category.id === parameter.categoryId)
      ?.label ?? parameter.categoryId,
  ]),
);
const SHARED_PARAMETERS = parameters;

export function TrackingView({
  config,
  entries,
  clientName,
  clientInitials,
  asOf,
  onConfigure,
  onUpdateValue,
  comments,
  onSaveComment,
  remote = false,
  parameterGroups,
  textValues,
  onUpdateText,
  renderTargets,
}: TrackingViewProps) {
  return (
    <div className="coach-root ct-shared-tracker">
      <SharedTrackingView
        config={
          remote
            ? config
            : { ...config, parameterDefinitions: SHARED_PARAMETERS }
        }
        entries={entries}
        onUpdateValue={onUpdateValue}
        textValues={remote ? (textValues ?? NO_TEXT_VALUES) : NO_TEXT_VALUES}
        onUpdateText={
          remote ? (onUpdateText ?? NOOP_UPDATE_TEXT) : NOOP_UPDATE_TEXT
        }
        comments={comments}
        onSaveComment={onSaveComment}
        clientName={clientName}
        clientInitials={clientInitials}
        asOf={asOf}
        parameterGroups={
          remote ? (parameterGroups ?? {}) : PARAMETER_GROUPS
        }
        onConfigure={remote ? undefined : onConfigure}
        allowCoachMode={remote ? undefined : true}
        persistenceHint={remote ? "Saved to your workspace" : "Local tracker"}
        renderTargets={renderTargets}
      />
    </div>
  );
}
