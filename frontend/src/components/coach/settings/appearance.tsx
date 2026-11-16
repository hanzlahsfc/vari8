"use client";
import { SegmentedControl } from "../../vari8/components";
import { useCoach } from "../store";
import {
  SettingRow,
  SettingsCard,
  usePatchPreferences,
  useSaved,
} from "./shell";

export function AppearanceSettings() {
  const { state } = useCoach();
  const patch = usePatchPreferences();
  const { saved, mark } = useSaved();
  const current = state.preferences.followSystemMode
    ? "system"
    : state.preferences.mode;
  return (
    <SettingsCard
      id="settings-appearance"
      title="Appearance"
      description="Only changes your workspace. Athletes choose light or dark in their own app."
      saved={saved}
    >
      <SettingRow label="Color mode">
        <SegmentedControl
          label="Color mode"
          value={current}
          onValueChange={(value) => {
            if (value === "system") {
              patch({ followSystemMode: true });
            } else {
              patch({
                followSystemMode: false,
                mode: value as "light" | "dark",
              });
            }
            mark();
          }}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "Match system" },
          ]}
        />
      </SettingRow>
    </SettingsCard>
  );
}
