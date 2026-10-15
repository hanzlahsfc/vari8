"use client";

import { TrackingView as SharedTrackingView } from "@/components/coach/client-tracker-preview/tracking-view";
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
  onConfigure: () => void;
  onUpdateValue: (date: string, id: string, value: number | null) => void;
  comments: Record<string, string>;
  onSaveComment: (date: string, id: string, text: string) => void;
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
  onConfigure,
  onUpdateValue,
  comments,
  onSaveComment,
}: TrackingViewProps) {
  return (
    <div className="coach-root ct-shared-tracker">
      <SharedTrackingView
        config={{ ...config, parameterDefinitions: SHARED_PARAMETERS }}
        entries={entries}
        onUpdateValue={onUpdateValue}
        textValues={NO_TEXT_VALUES}
        onUpdateText={NOOP_UPDATE_TEXT}
        comments={comments}
        onSaveComment={onSaveComment}
        clientName="Maya Chen"
        clientInitials="MC"
        asOf="2026-10-08"
        parameterGroups={PARAMETER_GROUPS}
        onConfigure={onConfigure}
        allowCoachMode
        persistenceHint="Local tracker"
      />
    </div>
  );
}
