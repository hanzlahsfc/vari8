"use client";

/**
 * Client setup page.
 *
 * Reads and writes only `client.assignment.snapshot`, never the library
 * template. The same reusable `SetupEditor` powers the surface; this host owns
 * the draft, save, leave guard and template drift/reset actions.
 */

import { Eye, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EditorHeader } from "../vari8/layouts";
import {
  clientSetupTemplate,
  resetSections,
  sectionDiffs,
} from "./client-setup";
import {
  type CoachClient,
  clone,
  formatDate,
  type Route,
  type Template,
  type Variant,
} from "./model";
import { SetupEditor } from "./setup-editor";
import { SetupPreviewDialog, type SetupSection } from "./setup-preview";
import { useCoach } from "./store";
import { templateSetup } from "./template-setup";
import { Button, Dialog, Empty, PageTitle } from "./ui";

type ResetRequest = { sections: SetupSection[]; all: boolean } | null;

export function ClientSetupPage({ client }: { client: CoachClient }) {
  const { state, setState, navigate, guard, toast } = useCoach();
  const [preview, setPreview] = useState(false);
  const [previewSection, setPreviewSection] = useState<SetupSection>("Tabs");
  const [review, setReview] = useState(false);
  const [resetRequest, setResetRequest] = useState<ResetRequest>(null);
  const [leaving, setLeaving] = useState<Route | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState("");

  const assignment = client.assignment;
  const savedSnapshot = assignment?.snapshot;
  const variantId =
    assignment?.variantId ?? savedSnapshot?.defaultVariant ?? "";
  const draft = savedSnapshot
    ? (state.clientSetupDrafts[client.id] ?? savedSnapshot)
    : undefined;
  const libraryTemplate = clientSetupTemplate(client, state.templates);
  const libraryVariant = libraryTemplate
    ? templateSetup(libraryTemplate, variantId)
    : undefined;
  const draftVariant = useMemo(
    () => (draft ? templateSetup(draft, variantId) : undefined),
    [draft, variantId],
  );
  const diffs = useMemo(
    () =>
      draftVariant && libraryVariant
        ? sectionDiffs(draftVariant, libraryVariant)
        : [],
    [draftVariant, libraryVariant],
  );
  const dirty =
    !!draft &&
    !!savedSnapshot &&
    JSON.stringify(draft) !== JSON.stringify(savedSnapshot);
  const templateUpdated = libraryTemplate
    ? libraryTemplate.updated > (savedSnapshot?.updated ?? "")
    : false;
  const profileRoute: Route = { section: "clients", client: client.id };

  const update = (fn: (template: Template) => Template) =>
    setState((s) => ({
      ...s,
      clientSetupDrafts: {
        ...s.clientSetupDrafts,
        [client.id]: fn(clone(draft as Template)),
      },
    }));

  const updateVariant = (fn: (variant: Variant) => Variant) =>
    update((current) => ({
      ...current,
      variants: current.variants.map((variant) =>
        variant.id === variantId ? fn(variant) : variant,
      ),
    }));

  const save = useCallback(() => {
    if (!draft || !savedSnapshot || !assignment) return;
    const setup = templateSetup(draft, variantId);
    if (
      !setup.name.trim() ||
      setup.questions.some(
        (question) =>
          !question.label.trim() ||
          (question.type === "Choice" && !question.options.trim()),
      ) ||
      (setup.roadmapPhases !== false &&
        !(setup.phaseOptions ?? []).some((option) => option.trim()))
    ) {
      setError(
        "Add question labels, choice options and phase options before saving.",
      );
      return;
    }
    const next = clone({ ...draft, name: draft.name.trim() });
    const remaining = libraryVariant
      ? sectionDiffs(templateSetup(next, variantId), libraryVariant)
      : [];
    if (libraryTemplate && remaining.length === 0)
      next.updated = libraryTemplate.updated;
    setState((s) => {
      const drafts = { ...s.clientSetupDrafts };
      delete drafts[client.id];
      return {
        ...s,
        clientSetupDrafts: drafts,
        clients: s.clients.map((item) =>
          item.id === client.id && item.assignment
            ? {
                ...item,
                assignment: { ...item.assignment, snapshot: next },
              }
            : item,
        ),
      };
    });
    setError("");
    toast("Client setup saved");
  }, [
    assignment,
    client.id,
    draft,
    libraryTemplate,
    libraryVariant,
    savedSnapshot,
    setState,
    toast,
    variantId,
  ]);

  useEffect(() => {
    guard.current = (next) => {
      if (!dirty) return true;
      setLeaving(next);
      return false;
    };
    const before = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener("beforeunload", before);
    window.addEventListener("keydown", key);
    return () => {
      guard.current = null;
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("keydown", key);
    };
  }, [dirty, guard, save]);

  const discard = () => {
    guard.current = null;
    setState((s) => {
      const drafts = { ...s.clientSetupDrafts };
      delete drafts[client.id];
      return { ...s, clientSetupDrafts: drafts };
    });
    navigate(profileRoute);
  };

  const applyTemplateSections = (sections: SetupSection[]) => {
    if (!libraryVariant) return;
    updateVariant((variant) =>
      resetSections(variant, libraryVariant, sections),
    );
  };

  if (!assignment || !draft || !draftVariant)
    return (
      <>
        <PageTitle
          title={`Setup for ${client.name}`}
          back={() => navigate(profileRoute)}
        />
        <Empty
          title="Assign a setup first"
          action={
            <Button
              primary
              onClick={() =>
                navigate({
                  section: "clients",
                  client: client.id,
                  plan: "setup",
                  tab: "Plans",
                })
              }
            >
              Open client setup
            </Button>
          }
        >
          Choose a saved template from the client profile before personalizing
          their tool.
        </Empty>
      </>
    );

  const templateName = libraryTemplate?.name ?? draft.name;
  const header = (
    <>
      <EditorHeader
        className="cd-client-setup-header"
        onBack={() => navigate(profileRoute)}
        backLabel="Profile"
        context={`Client setup · ${client.name}`}
        title={`Setup for ${client.name}`}
        status={
          <span className="cd-save-state">
            {dirty
              ? "Unsaved draft · kept on this device"
              : "All changes saved"}
          </span>
        }
        actions={
          <div className="cd-actions">
            <Button onClick={() => setPreview(true)}>
              <Eye size={16} />
              Preview
            </Button>
            <Button primary onClick={save}>
              <Save size={16} />
              Save changes
            </Button>
          </div>
        }
      />
      <div className="cd-client-setup-basis">
        <span>
          Based on <strong>{templateName}</strong>
        </span>
        {diffs.length > 0 && (
          <span className="cd-customized-chip v8-overline">Customized</span>
        )}
        {!libraryTemplate && (
          <span className="cd-setup-missing-template">
            Template no longer in your library
          </span>
        )}
      </div>
      {libraryTemplate && templateUpdated && (
        <div className="cd-setup-template-note">
          <span>
            Template updated {formatDate(libraryTemplate.updated)}. Your client
            keeps their own setup.
          </span>
          {diffs.length > 0 && (
            <Button size="sm" onClick={() => setReview(true)}>
              Review changes
            </Button>
          )}
        </div>
      )}
      <div className="cd-editor-draft-actions">
        {diffs.length > 0 && libraryTemplate && (
          <Button
            size="sm"
            onClick={() => setResetRequest({ sections: diffs, all: true })}
          >
            <RotateCcw size={14} />
            Reset all to template
          </Button>
        )}
        <Button size="sm" disabled={!dirty} onClick={() => setDiscarding(true)}>
          Discard changes
        </Button>
      </div>
      {error && (
        <p role="alert" className="cd-error">
          {error}
        </p>
      )}
    </>
  );

  return (
    <>
      <SetupEditor
        template={draft}
        variantId={variantId}
        onChange={update}
        mode="client"
        sampleClient={client}
        headerSlot={header}
        customizedSections={diffs}
        onResetSection={(section) =>
          setResetRequest({ sections: [section], all: false })
        }
        section={previewSection}
        onSectionChange={setPreviewSection}
      />
      {preview && (
        <SetupPreviewDialog
          template={draft}
          variantId={variantId}
          sampleClient={client}
          section={previewSection}
          onClose={() => setPreview(false)}
        />
      )}
      {review && libraryTemplate && (
        <Dialog title="Template changes" onClose={() => setReview(false)} wide>
          <p className="cd-muted">
            These sections differ from {libraryTemplate.name}. Apply a template
            version to this client’s draft, then save. Plans and history stay.
          </p>
          {diffs.length ? (
            <ul className="cd-setup-review-list">
              {diffs.map((section) => (
                <li key={section}>
                  <span>
                    <strong>{section}</strong>
                    <small>Differs from the template</small>
                  </span>
                  <Button
                    size="sm"
                    onClick={() => applyTemplateSections([section])}
                  >
                    <SlidersHorizontal size={14} />
                    Apply template version
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cd-muted">All sections now match the template.</p>
          )}
          <div className="cd-dialog-actions">
            <Button onClick={() => setReview(false)}>Close</Button>
          </div>
        </Dialog>
      )}
      {resetRequest && (
        <Dialog
          title={
            resetRequest.all
              ? "Reset all setup sections?"
              : `Reset ${resetRequest.sections[0]} to the template?`
          }
          onClose={() => setResetRequest(null)}
        >
          <p className="cd-muted">
            {resetRequest.all
              ? `This replaces ${client.name}’s customized setup with the library template. Plans, training logs and tracker history stay. `
              : `This replaces only the ${resetRequest.sections[0]} section in ${client.name}’s draft. Other setup sections, plans and history stay. `}
            Save changes to apply it.
          </p>
          <div className="cd-dialog-actions">
            <Button onClick={() => setResetRequest(null)}>Keep editing</Button>
            <Button
              primary
              onClick={() => {
                applyTemplateSections(resetRequest.sections);
                setResetRequest(null);
              }}
            >
              <RotateCcw size={14} />
              {resetRequest.all ? "Reset all" : "Reset section"}
            </Button>
          </div>
        </Dialog>
      )}
      {(leaving || discarding) && (
        <Dialog
          title={discarding ? "Discard these changes?" : "Leave client setup?"}
          onClose={() => {
            setLeaving(null);
            setDiscarding(false);
          }}
        >
          <p className="cd-muted">
            {discarding
              ? `Return to ${client.name}’s last saved setup. Plans and history stay as they are.`
              : "Your unsaved draft can stay on this device, ready for when you come back."}
          </p>
          <div className="cd-dialog-actions">
            <Button
              onClick={() => {
                setLeaving(null);
                setDiscarding(false);
              }}
            >
              Keep editing
            </Button>
            <Button
              primary
              onClick={() => {
                if (discarding) discard();
                else if (leaving) {
                  guard.current = null;
                  navigate(leaving);
                }
              }}
            >
              {discarding ? "Discard & return" : "Leave & keep draft"}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
