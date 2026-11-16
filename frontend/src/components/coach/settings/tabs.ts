export const SETTINGS_TABS = [
  { id: "profile", label: "Profile" },
  { id: "branding", label: "Branding" },
  { id: "appearance", label: "Appearance" },
  { id: "region", label: "Region & units" },
  { id: "availability", label: "Availability" },
  { id: "rules", label: "Coaching rules" },
  { id: "messages", label: "Messages" },
  { id: "notifications", label: "Notifications" },
  { id: "data", label: "Data" },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];
export const isSettingsTab = (value: string): value is SettingsTab =>
  SETTINGS_TABS.some((tab) => tab.id === value);
export const settingsTabLabel = (id: string) =>
  SETTINGS_TABS.find((tab) => tab.id === id)?.label;

/** Which category renders for a `?tab=` value: phones show the category
 * list until a valid tab is picked (`null`); any other layout defaults to
 * Profile so the nav, breadcrumb and content always agree. */
export function resolveSettingsTab(
  tab: string | undefined,
  narrow: boolean,
): SettingsTab | null {
  const requested = tab && isSettingsTab(tab) ? tab : null;
  return narrow ? requested : (requested ?? "profile");
}
