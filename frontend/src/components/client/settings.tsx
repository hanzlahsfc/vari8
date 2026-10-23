"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Input,
  SegmentedControl,
  Status,
  Toggle,
} from "@/components/vari8/components";
import type { ClientSettings } from "./demo/fixtures";
import type { ParsedDemo } from "./demo/state";
import { useDemoSlice } from "./demo/store";
import { ClientScreen, DemoGate } from "./shell";

const NOTIFICATION_LABELS: {
  key: keyof ClientSettings["notifications"];
  label: string;
}[] = [
  { key: "sessions", label: "Session reminders" },
  { key: "nutrition", label: "Nutrition reminders" },
  { key: "messages", label: "Message alerts" },
];

export function SettingsScreen({ demo }: { demo: ParsedDemo }) {
  const [settings, setSettings] = useDemoSlice("settings");
  const [draft, setDraft] = useState<ClientSettings>(settings.saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.saved);

  const save = () => {
    setSettings({ saved: draft });
  };
  const discard = () => setDraft(settings.saved);

  return (
    <ClientScreen
      title="Settings"
      description="Demo only. Nothing here is persisted."
    >
      <DemoGate demo={demo} empty="No settings yet.">
        <Card>
          <div className="client-card-stack">
            <Input
              label="Display name"
              value={draft.displayName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDraft((d) => ({ ...d, displayName: e.target.value }))
              }
            />
            <SegmentedControl
              label="Weight unit"
              value={draft.units.weight}
              onValueChange={(weight) =>
                setDraft((d) => ({
                  ...d,
                  units: { ...d.units, weight: weight as "kg" | "lb" },
                }))
              }
              options={[
                { value: "kg", label: "kg" },
                { value: "lb", label: "lb" },
              ]}
            />
            <SegmentedControl
              label="Distance unit"
              value={draft.units.distance}
              onValueChange={(distance) =>
                setDraft((d) => ({
                  ...d,
                  units: { ...d.units, distance: distance as "km" | "mi" },
                }))
              }
              options={[
                { value: "km", label: "km" },
                { value: "mi", label: "mi" },
              ]}
            />
            <div className="client-card-stack">
              {NOTIFICATION_LABELS.map(({ key, label }) => (
                <Toggle
                  key={key}
                  label={label}
                  checked={draft.notifications[key]}
                  onCheckedChange={(checked) =>
                    setDraft((d) => ({
                      ...d,
                      notifications: { ...d.notifications, [key]: checked },
                    }))
                  }
                />
              ))}
            </div>
            <div className="client-set-row">
              <Button variant="primary" onClick={save} disabled={!dirty}>
                Save
              </Button>
              <Button variant="ghost" onClick={discard} disabled={!dirty}>
                Discard changes
              </Button>
              {dirty && <Status tone="warning">Unsaved changes</Status>}
            </div>
          </div>
        </Card>
        <Card>
          <div className="client-kv">
            <span>Saved name</span>
            <span>{settings.saved.displayName}</span>
          </div>
          <div className="client-kv">
            <span>Saved units</span>
            <span>
              {settings.saved.units.weight} · {settings.saved.units.distance}
            </span>
          </div>
        </Card>
      </DemoGate>
    </ClientScreen>
  );
}
