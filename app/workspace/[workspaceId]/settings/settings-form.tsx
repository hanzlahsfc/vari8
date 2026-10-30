"use client";

import { useCallback, useEffect, useState } from "react";

import {
  SettingsSurface,
  type PreferenceGroupView,
} from "@/components/canvas/vari8/settings-surface";

/**
 * W2-T1: wires the shared settings surface to
 * /api/v1/workspaces/:workspaceId/settings. The surface is pure and
 * controlled; this wrapper owns fetch, save and the response-driven state so
 * the visible value is always what the server answered, not local optimism.
 */

type SettingsResponse = {
  profile: { name: string | null; email: string; role: string };
  preferences: { key: string; enabled: boolean }[];
};

const GROUPS: {
  id: string;
  title: string;
  description: string;
  items: { key: string; label: string; description: string }[];
}[] = [
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
      },
      {
        key: "attention.priority_messages",
        label: "Priority message attention",
        description: "Messages from priority clients count toward attention.",
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
      },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  coach: "Coach",
  client: "Client",
};

function toGroups(data: SettingsResponse): PreferenceGroupView[] {
  const byKey = new Map(data.preferences.map((p) => [p.key, p.enabled]));
  return GROUPS.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      enabled: byKey.get(item.key) ?? true,
    })),
  }));
}

export function SettingsForm({
  workspaceId,
  appVersion,
}: {
  workspaceId: string;
  appVersion?: string;
}) {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/workspaces/${workspaceId}/settings`, {
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return (await res.json()) as SettingsResponse;
      })
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        if (!cancelled) setError("Settings could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const save = useCallback(
    async (patch: {
      name?: string;
      preferences?: { key: string; enabled: boolean }[];
    }) => {
      setSaving(true);
      setNotice("");
      setError("");
      try {
        const res = await fetch(`/api/v1/workspaces/${workspaceId}/settings`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        setSettings((await res.json()) as SettingsResponse);
        setNotice("Settings saved.");
      } catch {
        setError("Settings could not be saved.");
      } finally {
        setSaving(false);
      }
    },
    [workspaceId],
  );

  if (error && !settings)
    return <p role="alert">Settings could not be loaded.</p>;
  if (!settings) return <p aria-busy="true">Loading settings...</p>;

  return (
    <SettingsSurface
      profile={{
        name: settings.profile.name ?? "",
        email: settings.profile.email,
        role: ROLE_LABELS[settings.profile.role] ?? settings.profile.role,
      }}
      preferenceGroups={toGroups(settings)}
      appVersion={appVersion}
      saving={saving}
      notice={notice}
      error={error}
      onSaveName={(name) => void save({ name })}
      onPreferenceChange={(key, enabled) =>
        void save({ preferences: [{ key, enabled }] })
      }
    />
  );
}
