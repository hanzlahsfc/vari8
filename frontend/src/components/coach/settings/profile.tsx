"use client";
import { useCoach } from "../store";
import {
  CommittedInput,
  ImageSlot,
  SettingRow,
  SettingsCard,
  usePatchPreferences,
  useSaved,
} from "./shell";

export const DEFAULT_COACH_NAME = "Liliana Mansfeld";
export const DEFAULT_COACH_TITLE = "Coach";

export function ProfileSettings() {
  const { state } = useCoach();
  const patch = usePatchPreferences();
  const { saved, mark } = useSaved();
  const profile = state.preferences.profile;
  return (
    <SettingsCard
      id="settings-profile"
      title="Profile"
      description="How you appear to athletes and in your workspace."
      saved={saved}
    >
      <CommittedInput
        label="Name"
        value={profile?.name ?? DEFAULT_COACH_NAME}
        normalize={(v) => v.trim() || DEFAULT_COACH_NAME}
        maxLength={120}
        onCommit={(name) => {
          patch({ profile: { name } });
          mark();
        }}
      />
      <CommittedInput
        label="Title"
        value={profile?.title ?? DEFAULT_COACH_TITLE}
        normalize={(v) => v.trim() || DEFAULT_COACH_TITLE}
        maxLength={80}
        placeholder="Prep coach"
        onCommit={(title) => {
          patch({
            profile: {
              name: profile?.name ?? DEFAULT_COACH_NAME,
              title: title === DEFAULT_COACH_TITLE ? undefined : title,
            },
          });
          mark();
        }}
      />
      <SettingRow
        label="Photo"
        hint="Square image, up to 2 MB. Your initials show while no photo is set."
      >
        <ImageSlot
          label="Coach photo"
          square
          image={profile?.photo}
          onChange={(photo) => {
            patch({
              profile: {
                name: profile?.name ?? DEFAULT_COACH_NAME,
                photo,
              },
            });
            mark();
          }}
        />
      </SettingRow>
      <CommittedInput
        label="Availability"
        hint="Shown beside your name in Messages."
        value={state.preferences.availability}
        normalize={(v) => v.trim() || "Weekdays · 09:00–18:00"}
        maxLength={120}
        placeholder="Weekdays · 09:00–18:00"
        onCommit={(availability) => {
          patch({ availability });
          mark();
        }}
      />
    </SettingsCard>
  );
}
