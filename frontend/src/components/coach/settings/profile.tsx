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
        maxLength={120}
        onCommit={(name) => {
          patch({ profile: { name: name.trim() || DEFAULT_COACH_NAME } });
          mark();
        }}
      />
      <CommittedInput
        label="Title"
        value={profile?.title ?? DEFAULT_COACH_TITLE}
        maxLength={80}
        placeholder="Prep coach"
        onCommit={(title) => {
          patch({
            profile: {
              name: profile?.name ?? DEFAULT_COACH_NAME,
              title: title.trim() || undefined,
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
        label="Availability note"
        value={
          state.preferences.availabilityNote ?? state.preferences.availability
        }
        maxLength={120}
        placeholder="Weekdays · 09:00–18:00"
        onCommit={(availabilityNote) => {
          patch({ availabilityNote: availabilityNote.trim() || undefined });
          mark();
        }}
      />
    </SettingsCard>
  );
}
