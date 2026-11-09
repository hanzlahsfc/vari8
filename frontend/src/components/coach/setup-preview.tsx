"use client";

import { Component, type ReactNode, useMemo, useRef, useState } from "react";
import { SegmentedControl } from "../vari8/components";
import { ClientPreview } from "./client-preview";
import { ClientProfileSurface } from "./clients";
import { CoachPreviewProvider } from "./coach-preview-provider";
import type { CoachClient, CoachState, Route, Template } from "./model";
import { buildPreviewState, type PreviewSandbox } from "./preview-sandbox";
import { useCoach } from "./store";
import { Dialog } from "./ui";
import "./setup-preview.css";

export type SetupSection =
  | "Tabs"
  | "Tracker"
  | "Timeline"
  | "Nutrition"
  | "Training"
  | "Check-In"
  | "Habits";

const PROFILE_TABS = [
  "Overview",
  "Timeline",
  "Tracker",
  "Plans",
  "Check-ins",
  "Notes & tasks",
];

/** The profile tab that matches the section currently being edited. */
export function setupSectionTab(section: SetupSection): string {
  switch (section) {
    case "Tracker":
      return "Tracker";
    case "Timeline":
      return "Timeline";
    case "Nutrition":
    case "Training":
      return "Plans";
    case "Check-In":
      return "Check-ins";
    default:
      return "Overview";
  }
}

/**
 * Keep the preview base stable while the host editor writes its draft into
 * `editorDrafts` on every keystroke. The dialog still receives the latest
 * draft; unrelated draft persistence does not reset the sandbox.
 */
function useStableCoachState(state: CoachState): CoachState {
  const ref = useRef(state);
  const previous = ref.current;
  if (state !== previous) {
    const keys = Object.keys(state) as (keyof CoachState)[];
    if (
      keys.some(
        (key) =>
          key !== "editorDrafts" &&
          key !== "clientSetupDrafts" &&
          state[key] !== previous[key],
      )
    )
      ref.current = state;
  }
  return ref.current;
}

function useSandbox(
  template: Template,
  variantId: string,
  sampleClient?: CoachClient,
): PreviewSandbox {
  const { state } = useCoach();
  const base = useStableCoachState(state);
  return useMemo(
    () => buildPreviewState(base, template, variantId, sampleClient),
    [base, template, variantId, sampleClient],
  );
}

class PreviewBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <p className="cd-setup-preview-error" role="status">
          Preview unavailable for this section.
        </p>
      );
    return this.props.children;
  }
}

/**
 * Full-viewport preview of the real coach profile.
 *
 * The dialog body is the page container: it uses the same `cd-main-clients`
 * column as the profile, so the header, tab bar and the wide tracker/timeline
 * centring measure against the dialog width exactly as they do on the page.
 */
export function SetupPreviewDialog({
  template,
  variantId,
  sampleClient,
  section,
  initialTab,
  onClose,
}: {
  template: Template;
  variantId: string;
  sampleClient?: CoachClient;
  section?: SetupSection;
  initialTab?: string;
  onClose: () => void;
}) {
  const sandbox = useSandbox(template, variantId, sampleClient);
  const route: Route = { section: "clients", client: sandbox.client.id };
  const initial = section
    ? setupSectionTab(section)
    : PROFILE_TABS.includes(initialTab ?? "")
      ? (initialTab as string)
      : "Overview";
  const [surface, setSurface] = useState<"coach" | "client">("coach");
  return (
    <CoachPreviewProvider state={sandbox.state} route={route}>
      <Dialog
        title={`Preview · ${sandbox.client.name}`}
        onClose={onClose}
        viewport
        flushBody
        className="cd-preview-dialog"
        headerAction={
          <SegmentedControl
            label="Preview surface"
            value={surface}
            onValueChange={(value) =>
              setSurface(value === "client" ? "client" : "coach")
            }
            options={[
              { value: "coach", label: "Coach" },
              { value: "client", label: "Client app" },
            ]}
          />
        }
      >
        <div className="cd-preview-workspace">
          <div className="cd-main cd-main-clients cd-preview-main">
            <PreviewBoundary>
              {surface === "coach" ? (
                <ClientProfileSurface
                  client={sandbox.client}
                  initialTab={initial}
                />
              ) : (
                <div className="cd-preview-client-app">
                  <ClientPreview template={template} client={sandbox.client} />
                </div>
              )}
            </PreviewBoundary>
          </div>
        </div>
      </Dialog>
    </CoachPreviewProvider>
  );
}
