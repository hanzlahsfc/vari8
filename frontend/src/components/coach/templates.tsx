"use client";
import { Popover } from "@base-ui/react/popover";
import {
  Check,
  Copy,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input as Vari8Input } from "../vari8/components";
import { EditorHeader } from "../vari8/layouts";
import { clientSetupCustomized } from "./client-setup";
import {
  assignTemplate,
  clone,
  formatDate,
  newTemplate,
  type Route,
  type Template,
  TODAY,
  uid,
} from "./model";
import { SetupEditor } from "./setup-editor";
import { SetupPreviewDialog, type SetupSection } from "./setup-preview";
import { useCoach } from "./store";
import { templateSetup } from "./template-setup";
import {
  Avatar,
  Button,
  Dialog,
  Empty,
  PageTitle,
  SearchBox,
  Surface,
} from "./ui";

export function AssignDialog({
  template,
  onClose,
  initialClient,
}: {
  template: Template;
  onClose: () => void;
  initialClient?: string;
}) {
  const { state, setState, toast, navigate } = useCoach();
  const [search, setSearch] = useState("");
  const [clientId, setClient] = useState(initialClient ?? "");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const configuration = templateSetup(template);
  const selectedClient = state.clients.find(
    (client) => client.id === clientId && !client.archived,
  );
  const customized = selectedClient
    ? clientSetupCustomized(selectedClient, state.templates)
    : false;
  const assign = () => {
    if (!selectedClient) return;
    setState((s) => assignTemplate(s, clientId, template, configuration.id));
    toast(`Assigned to ${selectedClient.name}`);
    onClose();
    navigate({
      section: "clients",
      client: clientId,
      plan: "setup",
      tab: "Plans",
    });
  };
  return (
    <Dialog title="Assign template" onClose={onClose}>
      <p className="cd-muted">
        Apply {template.name} to one athlete. Their plans, entries and history
        stay with them.
      </p>
      <p className="cd-muted">
        {configuration.nutrition} · {configuration.views.join(" · ")}
        {configuration.habits ? " · Habit Tracker" : ""}. Reassignment retains
        all client plans and history; configured modules are shown and other
        modules are hidden.
      </p>
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Find an athlete"
      />
      <div className="cd-picker-list">
        {state.clients
          .filter(
            (c) =>
              !c.archived &&
              c.name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((c) => (
            <label key={c.id} className="cd-picker-row">
              <input
                type="radio"
                name="assignment-client"
                checked={clientId === c.id}
                onChange={() => {
                  setClient(c.id);
                  setConfirmReplace(false);
                }}
              />
              <Avatar client={c} small />
              <span>
                <strong>{c.name}</strong>
                <small>
                  {c.assignment?.snapshot.name ?? "No template assigned"}
                </small>
              </span>
            </label>
          ))}
      </div>
      {customized && selectedClient && (
        <p className="cd-assignment-warning" role="alert">
          This replaces {selectedClient.name}’s customized setup. Plans and
          history stay.
        </p>
      )}
      <div className="cd-dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        {customized && !confirmReplace ? (
          <Button primary onClick={() => setConfirmReplace(true)}>
            Continue
          </Button>
        ) : (
          <Button
            primary
            disabled={
              !state.clients.some((c) => c.id === clientId && !c.archived)
            }
            onClick={assign}
          >
            <Check size={16} />
            {customized ? "Replace & assign" : "Assign & personalize"}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
export function TemplateLibrary({ embedded = false }: { embedded?: boolean }) {
  const { state, setState, navigate, toast } = useCoach();
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [preview, setPreview] = useState<Template | null>(null);
  const [assign, setAssign] = useState<Template | null>(null);
  const [rename, setRename] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const libraryRef = useRef<HTMLDivElement>(null);
  const list = state.templates.filter((t) =>
    `${t.name} ${t.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  const add = () => {
    const t = newTemplate(uid("template"));
    setState((s) => ({ ...s, editorDrafts: { ...s.editorDrafts, [t.id]: t } }));
    navigate({ section: "templates", editor: t.id });
  };
  const duplicate = (t: Template) => {
    const copy = clone(t);
    copy.id = uid("template");
    copy.name = `${t.name} copy`;
    copy.updated = TODAY;
    setState((s) => ({ ...s, templates: [...s.templates, copy] }));
    setMenu(null);
    toast("Independent copy created");
  };
  const remove = (t: Template) => {
    const index = state.templates.findIndex((x) => x.id === t.id);
    setState((s) => ({
      ...s,
      templates: s.templates.filter((x) => x.id !== t.id),
    }));
    setMenu(null);
    toast(`${t.name} deleted. Assigned client setups are retained.`, () =>
      setState((s) => ({
        ...s,
        templates: [
          ...s.templates.slice(0, index),
          t,
          ...s.templates.slice(index),
        ].filter((x, i, a) => a.findIndex((t) => t.id === x.id) === i),
      })),
    );
  };
  return (
    <>
      {embedded ? (
        <div className="cd-library-panel-head">
          <div>
            <h2>Client setups</h2>
            <p>A thoughtful starting point for every athlete.</p>
          </div>
          <Button primary onClick={add}>
            <Plus size={17} />
            Add template
          </Button>
        </div>
      ) : (
        <PageTitle
          title="Templates"
          description="A thoughtful starting point for every athlete."
          actions={
            <Button primary onClick={add}>
              <Plus size={17} />
              Add template
            </Button>
          }
        />
      )}
      <div className="cd-library-toolbar">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search templates"
        />
        <span className="cd-muted">
          {list.length} saved template{list.length !== 1 ? "s" : ""}
        </span>
      </div>
      {Object.values(state.editorDrafts).length > 0 && (
        <div className="cd-draft-resume">
          {Object.values(state.editorDrafts).map((t) => (
            <Button
              key={t.id}
              onClick={() => navigate({ section: "templates", editor: t.id })}
            >
              <Pencil size={13} />
              Resume draft: {t.name}
            </Button>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <Surface>
          <Empty
            title={
              search ? "No matching templates" : "Your library starts here"
            }
            action={
              <Button primary onClick={search ? () => setSearch("") : add}>
                {search ? "Clear search" : "Add template"}
              </Button>
            }
          >
            Build a reusable configuration for your athletes.
          </Empty>
        </Surface>
      ) : (
        <div className="cd-library-list" ref={libraryRef}>
          {list.map((t) => {
            const count = state.clients.filter(
              (c) => c.assignment?.templateId === t.id,
            ).length;
            const v = templateSetup(t);
            return (
              <article className="cd-template-card" key={t.id}>
                <header className="cd-template-card-head">
                  <h2>{t.name}</h2>
                  <Popover.Root
                    modal={false}
                    open={menu === t.id}
                    onOpenChange={(open) =>
                      setMenu((current) =>
                        open ? t.id : current === t.id ? null : current,
                      )
                    }
                  >
                    <Popover.Trigger
                      render={
                        <button
                          type="button"
                          className="cd-icon-button"
                          aria-label={`More actions for ${t.name}`}
                        />
                      }
                    >
                      <MoreHorizontal size={20} />
                    </Popover.Trigger>
                    <Popover.Portal container={libraryRef}>
                      <Popover.Positioner
                        className="cd-menu-positioner"
                        side="bottom"
                        align="end"
                        sideOffset={6}
                        collisionPadding={8}
                        collisionAvoidance={{
                          side: "flip",
                          align: "shift",
                          fallbackAxisSide: "start",
                        }}
                        positionMethod="absolute"
                      >
                        <Popover.Popup
                          className="cd-menu"
                          aria-label={`More actions for ${t.name}`}
                          initialFocus
                          finalFocus
                        >
                          <Button onClick={() => duplicate(t)}>
                            <Copy size={15} />
                            Duplicate
                          </Button>
                          <Button
                            onClick={() => {
                              setRename(t);
                              setName(t.name);
                              setMenu(null);
                            }}
                          >
                            <Pencil size={15} />
                            Rename
                          </Button>
                          <Button onClick={() => remove(t)}>
                            <Trash2 size={15} />
                            Delete
                          </Button>
                        </Popover.Popup>
                      </Popover.Positioner>
                    </Popover.Portal>
                  </Popover.Root>
                </header>
                <p className="cd-template-desc">
                  {t.description || "Your custom coaching configuration."}
                </p>
                <div className="cd-template-tags">
                  {v.views.map((view) => (
                    <span key={view}>{view}</span>
                  ))}
                  {v.habits && <span>Habits</span>}
                  <span>{v.nutrition}</span>
                </div>
                <div className="cd-template-meta">
                  <span>
                    <Users size={13} />
                    {count} assigned
                  </span>
                  <span>Edited {formatDate(t.updated)}</span>
                </div>
                <footer className="cd-template-actions">
                  <Button primary onClick={() => setPreview(t)}>
                    <Eye size={14} />
                    Preview
                  </Button>
                  <Button onClick={() => setAssign(t)}>
                    <Users size={14} />
                    Assign
                  </Button>
                  <Button
                    onClick={() =>
                      navigate({ section: "templates", editor: t.id })
                    }
                  >
                    <Pencil size={14} />
                    Edit
                  </Button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
      {preview && (
        <SetupPreviewDialog
          template={preview}
          variantId={templateSetup(preview).id}
          onClose={() => setPreview(null)}
        />
      )}
      {assign && (
        <AssignDialog template={assign} onClose={() => setAssign(null)} />
      )}
      {rename && (
        <Dialog title="Rename template" onClose={() => setRename(null)}>
          <Vari8Input
            label="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
          <div className="cd-dialog-actions">
            <Button onClick={() => setRename(null)}>Cancel</Button>
            <Button
              primary
              disabled={!name.trim()}
              onClick={() => {
                setState((s) => ({
                  ...s,
                  templates: s.templates.map((t) =>
                    t.id === rename.id
                      ? { ...t, name: name.trim(), updated: TODAY }
                      : t,
                  ),
                }));
                setRename(null);
              }}
            >
              Save name
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
export function TemplateEditor({ id }: { id: string }) {
  const { state, setState, navigate, guard, toast, route } = useCoach();
  const saved = state.templates.find((template) => template.id === id);
  const fresh = useMemo(() => newTemplate(id), [id]);
  const draft = state.editorDrafts[id] ?? saved ?? fresh;
  const [preview, setPreview] = useState(false);
  const [previewSection, setPreviewSection] = useState<SetupSection>("Tabs");
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState<Route | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const variant = templateSetup(draft);
  const dirty = !saved || JSON.stringify(draft) !== JSON.stringify(saved);
  const update = (fn: (template: Template) => Template) =>
    setState((s) => ({
      ...s,
      editorDrafts: { ...s.editorDrafts, [id]: fn(clone(draft)) },
    }));
  const save = useCallback(() => {
    const setup = templateSetup(draft);
    if (
      !draft.name.trim() ||
      setup.questions.some(
        (question) =>
          !question.label.trim() ||
          (question.type === "Choice" && !question.options.trim()),
      ) ||
      (setup.roadmapPhases !== false &&
        !(setup.phaseOptions ?? []).some((option) => option.trim()))
    ) {
      setError(
        "Add a template name, question labels, choice options and phase options before saving.",
      );
      return;
    }
    const next = clone({ ...draft, name: draft.name.trim(), updated: TODAY });
    setState((s) => {
      const drafts = { ...s.editorDrafts };
      delete drafts[id];
      return {
        ...s,
        templates: s.templates.some((template) => template.id === id)
          ? s.templates.map((template) =>
              template.id === id ? next : template,
            )
          : [...s.templates, next],
        editorDrafts: drafts,
      };
    });
    setError("");
    toast("Template saved to your library");
    if (route.client) {
      guard.current = null;
      navigate({ section: "clients", client: route.client, tab: "Plans" });
    }
  }, [draft, id, setState, toast, route.client, guard, navigate]);
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
      const drafts = { ...s.editorDrafts };
      delete drafts[id];
      return { ...s, editorDrafts: drafts };
    });
    navigate(
      route.client
        ? { section: "clients", client: route.client, tab: "Plans" }
        : { section: "templates" },
    );
  };
  const header = (
    <>
      <EditorHeader
        className="cd-template-editor-header"
        onBack={() =>
          navigate(
            route.client
              ? { section: "clients", client: route.client, tab: "Plans" }
              : { section: "templates" },
          )
        }
        backLabel="Templates"
        context="Template editor"
        title={draft.name || "Untitled template"}
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
              Save template
            </Button>
          </div>
        }
      />
      <div className="cd-editor-draft-actions">
        <Button
          size="sm"
          disabled={!dirty || !saved}
          onClick={() => {
            if (!saved) return;
            const previous = clone(draft);
            update(() => clone(saved));
            toast("Saved settings restored", () =>
              setState((s) => ({
                ...s,
                editorDrafts: { ...s.editorDrafts, [id]: previous },
              })),
            );
          }}
        >
          <RotateCcw size={14} />
          Restore saved
        </Button>
        <Button size="sm" onClick={() => setDiscarding(true)}>
          {saved ? "Discard & return" : "Cancel template"}
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
        variantId={variant.id}
        onChange={update}
        mode="template"
        headerSlot={header}
        section={previewSection}
        onSectionChange={setPreviewSection}
      />
      {preview && (
        <SetupPreviewDialog
          template={draft}
          variantId={variant.id}
          section={previewSection}
          onClose={() => setPreview(false)}
        />
      )}
      {(leaving || discarding) && (
        <Dialog
          title={discarding ? "Discard this draft?" : "Leave the editor?"}
          onClose={() => {
            setLeaving(null);
            setDiscarding(false);
          }}
        >
          <p className="cd-muted">
            {discarding
              ? "Return to your last saved template settings. Your athletes’ assignments stay as they are."
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
