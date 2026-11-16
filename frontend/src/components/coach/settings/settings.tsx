"use client";
import { useCoach } from "../store";
import { AppearanceSettings } from "./appearance";
import { AvailabilitySettings } from "./availability";
import { BrandingSettings } from "./branding";
import { DataSettings } from "./data";
import { MessagesSettings } from "./messages";
import { NotificationsSettings } from "./notifications";
import { ProfileSettings } from "./profile";
import { RegionSettings } from "./region";
import { RulesSettings } from "./rules";
import {
  resolveSettingsTab,
  SETTINGS_TABS,
  SettingsBackButton,
  type SettingsTab,
  useNarrowSettings,
} from "./shell";
import "./settings.css";

export function SettingsWorkspace() {
  const { route, navigate } = useCoach();
  const narrow = useNarrowSettings();
  // Desktop always shows a category (Profile by default); the phone shows
  // the category list until the coach drills in.
  const tab = resolveSettingsTab(route.tab, narrow);
  const openTab = (id: SettingsTab | null) =>
    navigate(id ? { section: "settings", tab: id } : { section: "settings" });
  return (
    <div className="cd-settings">
      <nav
        className="cd-settings-nav"
        aria-label="Settings categories"
        hidden={narrow && tab !== null}
      >
        <h1 className="cd-settings-title">Settings</h1>
        {SETTINGS_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="cd-settings-category"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => openTab(id)}
          >
            <span>{label}</span>
            <span className="cd-settings-category-arrow" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
      </nav>
      <div className="cd-settings-content" hidden={narrow && tab === null}>
        {tab && narrow && <SettingsBackButton onBack={() => openTab(null)} />}
        {tab === "profile" && <ProfileSettings />}
        {tab === "branding" && <BrandingSettings />}
        {tab === "appearance" && <AppearanceSettings />}
        {tab === "region" && <RegionSettings />}
        {tab === "availability" && <AvailabilitySettings />}
        {tab === "rules" && <RulesSettings />}
        {tab === "messages" && <MessagesSettings />}
        {tab === "notifications" && <NotificationsSettings />}
        {tab === "data" && <DataSettings />}
      </div>
    </div>
  );
}
