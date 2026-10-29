"use client";

import { useState } from "react";
import { Button, Card, Input, Status, Tabs, Toggle } from "./components";
import { PageHeader } from "./layouts";
import "./settings-surface.css";

export type SettingsProfile = {
  name: string;
  email: string;
  role: string;
};

export type PreferenceItemView = {
  key: string;
  label: string;
  description?: string;
  enabled: boolean;
};

export type PreferenceGroupView = {
  id: string;
  title: string;
  description?: string;
  items: PreferenceItemView[];
};

export type SettingsSurfaceProps = {
  profile: SettingsProfile;
  preferenceGroups: PreferenceGroupView[];
  saving?: boolean;
  notice?: string;
  error?: string;
  onSaveName?: (name: string) => void;
  onPreferenceChange?: (key: string, enabled: boolean) => void;
};

/**
 * Tabbed settings surface (profile + preference groups). Pure and
 * controlled: the caller owns state and persistence, so the same file runs
 * on the standalone demo data and on the server-backed workspace route.
 */
export function SettingsSurface({
  profile,
  preferenceGroups,
  saving = false,
  notice,
  error,
  onSaveName,
  onPreferenceChange,
}: SettingsSurfaceProps) {
  const [tab, setTab] = useState("profile");
  const [draftName, setDraftName] = useState(profile.name);

  return (
    <div className="v8-settings">
      <PageHeader
        title="Settings"
        description="Your profile and notification preferences."
      />
      <Tabs
        label="Settings sections"
        value={tab}
        onValueChange={setTab}
        items={[
          {
            value: "profile",
            label: "Profile",
            content: (
              <Card className="v8-settings__group">
                <h2 className="v8-settings__heading">Profile</h2>
                <Input
                  label="Display name"
                  value={draftName}
                  onChange={(event) =>
                    setDraftName(event.currentTarget.value)
                  }
                  disabled={saving}
                />
                <dl className="v8-settings__facts">
                  <div className="v8-settings__fact">
                    <dt>Email</dt>
                    <dd>{profile.email}</dd>
                  </div>
                  <div className="v8-settings__fact">
                    <dt>Role</dt>
                    <dd>{profile.role}</dd>
                  </div>
                </dl>
                <div className="v8-settings__actions">
                  <Button
                    onClick={() => onSaveName?.(draftName)}
                    disabled={saving || draftName.trim().length === 0}
                  >
                    Save profile
                  </Button>
                </div>
              </Card>
            ),
          },
          {
            value: "notifications",
            label: "Notifications",
            content: (
              <>
                {preferenceGroups.map((group) => (
                  <Card key={group.id} className="v8-settings__group">
                    <h2 className="v8-settings__heading">{group.title}</h2>
                    {group.description && (
                      <p className="v8-settings__group-description">
                        {group.description}
                      </p>
                    )}
                    {group.items.map((item) => (
                      <Toggle
                        key={item.key}
                        label={item.label}
                        description={item.description}
                        checked={item.enabled}
                        disabled={saving}
                        onCheckedChange={(checked) =>
                          onPreferenceChange?.(item.key, checked)
                        }
                      />
                    ))}
                  </Card>
                ))}
              </>
            ),
          },
        ]}
      />
      {notice && (
        <Status tone="positive" className="v8-settings__status">
          {notice}
        </Status>
      )}
      {error && (
        <Status tone="danger" className="v8-settings__status">
          {error}
        </Status>
      )}
    </div>
  );
}
