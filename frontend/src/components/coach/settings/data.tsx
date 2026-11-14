"use client";
import { useState } from "react";
import { seedState } from "../model";
import { useCoach } from "../store";
import { Button, Dialog } from "../ui";
import { SettingRow, SettingsCard } from "./shell";

const STORAGE_BUDGET = 5 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function DataSettings() {
  const { state, setState, navigate, toast } = useCoach();
  const [confirmReset, setConfirmReset] = useState(false);
  const serialized = JSON.stringify(state);
  const imageBytes = [
    state.preferences.logo,
    state.preferences.brand?.logoLight,
    state.preferences.profile?.photo,
  ].reduce((sum, image) => sum + (image?.dataUrl.length ?? 0), 0);
  const exportWorkspace = () => {
    const blob = new Blob([serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vari8-workspace-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast("Workspace exported.");
  };
  return (
    <>
      <SettingsCard
        id="settings-data"
        title="Data"
        description="This workspace is stored in this browser only."
      >
        <SettingRow
          label="Storage used (estimate)"
          hint={`Estimate from the serialized workspace — about ${formatBytes(imageBytes)} of it is images (logos and photo).`}
        >
          <div className="cd-settings-storage">
            <span
              className="cd-settings-storage-bar"
              role="progressbar"
              aria-label="Estimated storage used"
              aria-valuemin={0}
              aria-valuemax={STORAGE_BUDGET}
              aria-valuenow={serialized.length}
            >
              <span
                style={{
                  width: `${Math.min(100, (serialized.length / STORAGE_BUDGET) * 100)}%`,
                }}
              />
            </span>
            <span className="cd-settings-storage-label">
              About {formatBytes(serialized.length)} of a typical ~
              {formatBytes(STORAGE_BUDGET)} browser budget
            </span>
          </div>
        </SettingRow>
        <SettingRow
          label="Export workspace"
          hint="Downloads a dated JSON copy of this workspace."
        >
          <Button onClick={exportWorkspace}>Export JSON</Button>
        </SettingRow>
        <SettingRow
          label="Reset demo workspace"
          hint="Resets this coach workspace to the starting examples."
        >
          <Button onClick={() => setConfirmReset(true)}>
            Reset coach workspace
          </Button>
        </SettingRow>
      </SettingsCard>
      {confirmReset && (
        <Dialog
          title="Reset demo workspace?"
          onClose={() => setConfirmReset(false)}
        >
          <p>
            Local templates, messages and feedback will return to their starting
            examples. This replaces the workspace saved in this browser.
          </p>
          <div className="cd-dialog-actions">
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              primary
              onClick={() => {
                setConfirmReset(false);
                setState(seedState());
                navigate({ section: "templates" });
                toast("Workspace reset to the demo examples.");
              }}
            >
              Reset workspace
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
