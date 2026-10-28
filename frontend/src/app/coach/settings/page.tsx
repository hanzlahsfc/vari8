"use client";

import { useEffect, useState } from "react";
import {
  SettingsSurface,
  type PreferenceGroupView,
  type SettingsProfile,
} from "@/components/vari8/settings-surface";
import { vari8Theme } from "@/lib/vari8-theme";

/**
 * Standalone demo mount for the settings surface (W2-T1). Holds the same
 * profile + notification preference shape the backend route serves, kept in
 * this browser's local storage like the rest of the coach workspace demo
 * state. The backend wiring lives in the full-stack repository; this page
 * only proves the surface itself.
 */

const STORAGE_KEY = "coach-settings-surface-v1";

const DEMO_PROFILE: SettingsProfile = {
  name: "Demo Coach",
  email: "coach@example.test",
  role: "coach",
};

const DEFAULT_GROUPS: PreferenceGroupView[] = [
  {
    id: "attention",
    title: "Attention",
    description:
      "Which conversations surface as needing your attention in the workspace.",
    items: [
      {
        key: "attention.unread_messages",
        label: "Unread message attention",
        description: "Unread client messages count toward attention.",
        enabled: true,
      },
      {
        key: "attention.priority_messages",
        label: "Priority message attention",
        description:
          "Messages from priority clients count toward attention.",
        enabled: true,
      },
    ],
  },
  {
    id: "delivery",
    title: "Email delivery",
    description: "Which notifications are sent to you by email.",
    items: [
      {
        key: "email.messages",
        label: "New client message",
        description: "Email me when a client sends a message.",
        enabled: true,
      },
    ],
  },
];

type StoredSettings = {
  name: string;
  enabled: Record<string, boolean>;
};

function loadStored(): StoredSettings | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSettings>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : DEMO_PROFILE.name,
      enabled:
        parsed.enabled && typeof parsed.enabled === "object"
          ? (parsed.enabled as Record<string, boolean>)
          : {},
    };
  } catch {
    return null;
  }
}

export default function CoachSettingsDemoPage() {
  const [profile, setProfile] = useState(DEMO_PROFILE);
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const stored = loadStored();
    if (!stored) return;
    setProfile((p) => ({ ...p, name: stored.name }));
    setGroups((gs) =>
      gs.map((group) => ({
        ...group,
        items: group.items.map((item) =>
          item.key in stored.enabled
            ? { ...item, enabled: stored.enabled[item.key] }
            : item,
        ),
      })),
    );
  }, []);

  const persist = (name: string, gs: PreferenceGroupView[]) => {
    const enabled: Record<string, boolean> = {};
    for (const group of gs)
      for (const item of group.items) enabled[item.key] = item.enabled;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name, enabled }),
    );
  };

  return (
    <main
      className="v8-theme"
      data-mode="dark"
      style={{ ...vari8Theme({ mode: "dark", accent: "#EB91B8" }), padding: "2rem" }}
    >
      <SettingsSurface
        profile={profile}
        preferenceGroups={groups}
        notice={notice}
        onSaveName={(name) => {
          setProfile((p) => ({ ...p, name }));
          persist(name, groups);
          setNotice("Profile saved.");
        }}
        onPreferenceChange={(key, enabled) => {
          const next = groups.map((group) => ({
            ...group,
            items: group.items.map((item) =>
              item.key === key ? { ...item, enabled } : item,
            ),
          }));
          setGroups(next);
          persist(profile.name, next);
          setNotice("Preferences saved.");
        }}
      />
    </main>
  );
}
