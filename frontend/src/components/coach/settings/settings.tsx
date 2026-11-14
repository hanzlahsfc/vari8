"use client";
import { useEffect, useState } from "react";
import { useCoach } from "../store";
import { AppearanceSettings } from "./appearance";
import { BrandingSettings } from "./branding";
import { DataSettings } from "./data";
import { NotificationsSettings } from "./notifications";
import { ProfileSettings } from "./profile";
import {
  isSettingsTab,
  SETTINGS_TABS,
  SettingsBackButton,
  type SettingsTab,
} from "./shell";
import "./settings.css";

function useNarrowSettings() {
  const [narrow, setNarrow] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

export function SettingsWorkspace() {
  const { route, navigate } = useCoach();
  const narrow = useNarrowSettings();
  const requested = route.tab && isSettingsTab(route.tab) ? route.tab : null;
  // Desktop always shows a category (Profile by default); the phone shows
  // the category list until the coach drills in.
  const tab: SettingsTab | null = narrow ? requested : (requested ?? "profile");
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
        {tab === "notifications" && <NotificationsSettings />}
        {tab === "data" && <DataSettings />}
      </div>
    </div>
  );
}
