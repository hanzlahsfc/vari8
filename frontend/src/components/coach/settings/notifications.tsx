"use client";
import { useCoach } from "../store";
import { Toggle } from "../ui";
import {
  SettingRow,
  SettingsCard,
  usePatchPreferences,
  useSaved,
} from "./shell";

export function NotificationsSettings() {
  const { state } = useCoach();
  const patch = usePatchPreferences();
  const { saved, mark } = useSaved();
  const notify = state.preferences.notify;
  return (
    <SettingsCard
      id="settings-notifications"
      title="Notifications"
      description="Shown inside this workspace only. No email or system notifications are sent."
      saved={saved}
    >
      <SettingRow
        label="Unread message badge"
        hint="Shows the unread count on Messages in the sidebar."
      >
        <Toggle
          label="Unread message badge"
          checked={state.preferences.notifications}
          onChange={(notifications) => {
            patch({ notifications });
            mark();
          }}
        />
      </SettingRow>
      <SettingRow
        label="Check-ins waiting badge"
        hint="Shows the pending count on Check-ins in the sidebar."
      >
        <Toggle
          label="Check-ins waiting badge"
          checked={notify?.checkIns !== false}
          onChange={(checkIns) => {
            patch({ notify: { checkIns } });
            mark();
          }}
        />
      </SettingRow>
      <SettingRow
        label="Priority messages first"
        hint="Sorts conversations with a priority flag to the top of Messages."
      >
        <Toggle
          label="Priority messages first"
          checked={state.preferences.priorityNotifications}
          onChange={(priorityNotifications) => {
            patch({ priorityNotifications });
            mark();
          }}
        />
      </SettingRow>
      <SettingRow
        label="Task reminders"
        hint="Shows reminder toasts for to-dos with a reminder time."
      >
        <Toggle
          label="Task reminders"
          checked={notify?.taskReminders !== false}
          onChange={(taskReminders) => {
            patch({ notify: { taskReminders } });
            mark();
          }}
        />
      </SettingRow>
    </SettingsCard>
  );
}
