"use client";
import { TimePicker } from "../../vari8/inputs";
import { checkInDeadline } from "../model";
import { useCoach, useDisplay } from "../store";
import { Button, Select } from "../ui";
import {
  SettingRow,
  SettingsCard,
  usePatchPreferences,
  useSaved,
} from "./shell";

export function RulesSettings() {
  const { state } = useCoach();
  const patch = usePatchPreferences();
  const { saved, mark } = useSaved();
  const rules = state.preferences.rules;
  const hourFormat = useDisplay().hourCycle;
  return (
    <SettingsCard
      id="settings-rules"
      title="Coaching rules"
      description="The cutoff for overdue check-ins and your feedback target."
      saved={saved}
    >
      <SettingRow
        label="Check-in deadline"
        hint="A check-in counts as overdue once this time passes on its day, in your time zone. Athletes see “Due today by” this time."
      >
        <TimePicker
          label="Check-in deadline"
          value={checkInDeadline(state.preferences)}
          hourFormat={hourFormat}
          onValueChange={(checkInDeadline) => {
            if (checkInDeadline) {
              patch({ rules: { checkInDeadline } });
              mark();
            }
          }}
        />
      </SettingRow>
      <SettingRow
        label="Feedback target"
        hint="Shows “Reply due in …” on submitted check-ins awaiting feedback. Working-day targets count only your working hours. Coach-facing only."
      >
        <Select
          label="Feedback target"
          value={rules?.feedbackTarget ?? "48h"}
          onChange={(feedbackTarget) => {
            patch({
              rules: {
                feedbackTarget: feedbackTarget as
                  | "24h"
                  | "48h"
                  | "2-working-days"
                  | "none",
              },
            });
            mark();
          }}
          options={[
            { value: "24h", label: "24 h" },
            { value: "48h", label: "48 h" },
            { value: "2-working-days", label: "2 working days" },
            { value: "none", label: "No target" },
          ]}
        />
      </SettingRow>
      <Button
        onClick={() => {
          patch({
            rules: { checkInDeadline: "23:59", feedbackTarget: "48h" },
          });
          mark();
        }}
      >
        Reset to defaults
      </Button>
    </SettingsCard>
  );
}
