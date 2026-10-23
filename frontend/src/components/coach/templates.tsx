"use client";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Checkbox,
  SegmentedControl,
  Input as Vari8Input,
  Select as Vari8Select,
} from "../vari8/components";
import { TextArea } from "../vari8/inputs";
import {
  bindDashboardUnits,
  CoachDashboardEditor,
} from "./builder/coach-dashboard";
import { ClientPreview } from "./client-preview";
import { FormPreview } from "./form-preview";
import {
  ALL_PARAMETERS,
  assignTemplate,
  CORE_VIEWS,
  type CoachClient,
  clone,
  type FieldConfig,
  formatDate,
  newTemplate,
  PARAMETERS,
  type Question,
  type Route,
  type Template,
  TODAY,
  TRAINING_FIELDS,
  uid,
  type Variant,
} from "./model";
import {
  DEFAULT_TRAINING_DEFAULTS,
  DEFAULT_TRAINING_OPTIONS,
  type TrainingOptionKey,
  type TrainingOptions,
} from "./plans/training-options";
import { useCoach } from "./store";
import { trackerOverviewIds } from "./tracker-setup";
import "./tracker-config.css";
import "./plans/training-options.css";
import { EditorHeader, Section } from "../vari8/layouts";
import {
  DEFAULT_PHASE_OPTIONS,
  templateSetup,
  WEEKLY_VOLUME_BREAKDOWN,
} from "./template-setup";
import {
  Avatar,
  Button,
  Dialog,
  Empty,
  IconButton,
  PageTitle,
  SearchBox,
  Select,
  Surface,
  Toggle,
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
  const configuration = templateSetup(template);
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
                onChange={() => setClient(c.id)}
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
      <div className="cd-dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          primary
          disabled={
            !state.clients.some((c) => c.id === clientId && !c.archived)
          }
          onClick={() => {
            setState((s) =>
              assignTemplate(s, clientId, template, configuration.id),
            );
            toast(
              `Assigned to ${state.clients.find((c) => c.id === clientId)?.name}`,
            );
            onClose();
            navigate({
              section: "clients",
              client: clientId,
              plan: "setup",
              tab: "Plans",
            });
          }}
        >
          <Check size={16} />
          Assign & personalize
        </Button>
      </div>
    </Dialog>
  );
}
export function PreviewDialog({
  template,
  client,
  initialTab,
  onClose,
}: {
  template: Template;
  client?: CoachClient;
  initialTab?: string;
  onClose: () => void;
}) {
  return (
    <Dialog full title="Client preview" onClose={onClose}>
      <ClientPreview
        template={template}
        client={client}
        initialTab={initialTab}
      />
    </Dialog>
  );
}
export function TemplateLibrary() {
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
        <PreviewDialog template={preview} onClose={() => setPreview(null)} />
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
const EDITOR_SECTIONS = [
  "Tabs",
  "Dashboard",
  "Tracker",
  "Timeline / Roadmap",
  "Nutrition",
  "Training",
  "Check-In",
  "Habits",
];
const PREVIEW_TAB_BY_SECTION: Record<string, string> = {
  Dashboard: "Dashboard",
  Tracker: "Tracker",
  "Timeline / Roadmap": "Timeline / Roadmap",
  Nutrition: "Nutrition",
  Training: "Training Program",
  "Check-In": "Check-In",
  Habits: "Habits",
};
export function TemplateEditor({ id }: { id: string }) {
  const { state, setState, navigate, guard, toast, route } = useCoach();
  const saved = state.templates.find((t) => t.id === id);
  const fresh = useMemo(() => newTemplate(id), [id]);
  const draft = state.editorDrafts[id] ?? saved ?? fresh;
  const [section, setSection] = useState("Tabs");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState<Route | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const variant = templateSetup(draft);
  const dirty = !saved || JSON.stringify(draft) !== JSON.stringify(saved);
  const update = (fn: (t: Template) => Template) =>
    setState((s) => ({
      ...s,
      editorDrafts: { ...s.editorDrafts, [id]: fn(clone(draft)) },
    }));
  const updateVariant = (fn: (v: Variant) => Variant) =>
    update((t) => ({
      ...t,
      variants: t.variants.map((v) =>
        v.id === variant.id
          ? (() => {
              const next = fn(v);
              return next.dashboard
                ? {
                    ...next,
                    dashboard: bindDashboardUnits(next.dashboard, next),
                  }
                : next;
            })()
          : v,
      ),
    }));
  const save = useCallback(() => {
    const cfg = templateSetup(draft);
    if (
      !draft.name.trim() ||
      cfg.questions.some(
        (q) => !q.label.trim() || (q.type === "Choice" && !q.options.trim()),
      ) ||
      (cfg.roadmapPhases !== false &&
        !(cfg.phaseOptions ?? []).some((option) => option.trim()))
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
        templates: s.templates.some((t) => t.id === id)
          ? s.templates.map((t) => (t.id === id ? next : t))
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
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
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
      const d = { ...s.editorDrafts };
      delete d[id];
      return { ...s, editorDrafts: d };
    });
    navigate(
      route.client
        ? { section: "clients", client: route.client, tab: "Plans" }
        : { section: "templates" },
    );
  };
  return (
    <div className="cd-editor">
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
          <div className="cd-template-editor-actions">
            <Vari8Input
              label="Template name"
              value={draft.name}
              maxLength={80}
              onChange={(e) => update((t) => ({ ...t, name: e.target.value }))}
            />
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
          </div>
        }
      />
      {error && (
        <p role="alert" className="cd-error">
          {error}
        </p>
      )}
      <div
        className="cd-editor-layout"
        data-dashboard={section === "Dashboard"}
      >
        <aside className="cd-editor-nav">
          <nav aria-label="Template configuration">
            {EDITOR_SECTIONS.map((s, i) => (
              <button
                type="button"
                className={section === s ? "active" : ""}
                aria-current={section === s ? "page" : undefined}
                onClick={() => setSection(s)}
                key={s}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                {s}
              </button>
            ))}
          </nav>
          <div className="cd-editor-nav-bottom">
            <Button
              disabled={!dirty || !saved}
              onClick={() => {
                if (saved) {
                  const previous = clone(draft);
                  update(() => clone(saved));
                  toast("Saved settings restored", () =>
                    setState((s) => ({
                      ...s,
                      editorDrafts: { ...s.editorDrafts, [id]: previous },
                    })),
                  );
                }
              }}
            >
              <RotateCcw size={14} />
              Restore saved
            </Button>
            <Button onClick={() => setDiscarding(true)}>
              {saved ? "Discard & return" : "Cancel template"}
            </Button>
          </div>
        </aside>
        <Surface className="cd-config-surface">
          <Section
            className="cd-config-section"
            title={section}
            actions={<SlidersHorizontal size={19} aria-hidden="true" />}
          >
            {section === "Tabs" && (
              <>
                <TextArea
                  label="Description"
                  value={draft.description}
                  rows={2}
                  onChange={(e) =>
                    update((t) => ({ ...t, description: e.target.value }))
                  }
                  placeholder="Who is this template for?"
                />
                <h3>Client tabs</h3>
                <div className="cd-view-settings">
                  {CORE_VIEWS.map((v) => (
                    <Toggle
                      key={v}
                      label={v}
                      checked={variant.views.includes(v)}
                      onChange={(checked) =>
                        updateVariant((vr) => ({
                          ...vr,
                          views: checked
                            ? [...vr.views, v]
                            : vr.views.filter((x) => x !== v),
                        }))
                      }
                    />
                  ))}
                  <Toggle
                    label="Habits"
                    checked={variant.habits}
                    onChange={(habits) =>
                      updateVariant((v) => ({ ...v, habits }))
                    }
                  />
                </div>
              </>
            )}
            {section === "Dashboard" && (
              <DashboardConfig variant={variant} update={updateVariant} />
            )}
            {section === "Tracker" && (
              <TrackerConfig variant={variant} update={updateVariant} />
            )}
            {section === "Timeline / Roadmap" && (
              <RoadmapConfig variant={variant} update={updateVariant} />
            )}
            {section === "Nutrition" && (
              <>
                <p className="cd-muted">
                  Choose the nutrition experience. Meal count, labels, times,
                  foods, swaps, targets and training/rest-day schedules are
                  personalized in each athlete’s client setup.
                </p>
                <SegmentedControl
                  label="Nutrition mode"
                  value={variant.nutrition}
                  onValueChange={(nutrition) =>
                    updateVariant((x) => ({
                      ...x,
                      nutrition: nutrition as typeof x.nutrition,
                    }))
                  }
                  options={[
                    { value: "Meal plan", label: "Meal plan" },
                    { value: "IIFYM", label: "IIFYM · macro targets" },
                  ]}
                />
                <div className="cd-info-line">
                  Client setup owns the prescription. This template controls its
                  presentation.
                </div>
              </>
            )}
            {section === "Training" && (
              <TrainingConfig variant={variant} update={updateVariant} />
            )}
            {section === "Check-In" && (
              <QuestionnaireConfig variant={variant} update={updateVariant} />
            )}
            {section === "Habits" && (
              <>
                <Toggle
                  label="Include Habit Tracker"
                  checked={variant.habits}
                  onChange={(habits) =>
                    updateVariant((v) => ({ ...v, habits }))
                  }
                />
                <h3>Separate logging preview</h3>
                {variant.habits ? (
                  <div className="cd-habit-preview">
                    <span className="cd-check-circle">
                      <Check size={16} />
                    </span>
                    <div>
                      <strong>Evening walk</strong>
                      <small>Daily · 20 minutes · 5 / 7 completed</small>
                      <p>Create a calm transition into the evening.</p>
                    </div>
                  </div>
                ) : (
                  <Empty title="Habit Tracker is hidden">
                    Enable it to include separate habit logging.
                  </Empty>
                )}
                <p className="cd-muted">
                  Define each athlete’s actual habits, frequency, goals and
                  reasons in client setup.
                </p>
                <Toggle
                  disabled={!variant.habits}
                  label="Include habit status in check-ins"
                  checked={
                    variant.habits && variant.summaries.includes("habits")
                  }
                  onChange={(checked) =>
                    updateVariant((v) => ({
                      ...v,
                      summaries: checked
                        ? [...new Set([...v.summaries, "habits"])]
                        : v.summaries.filter((x) => x !== "habits"),
                    }))
                  }
                />
              </>
            )}
          </Section>
        </Surface>
      </div>
      {preview && (
        <PreviewDialog
          template={draft}
          initialTab={PREVIEW_TAB_BY_SECTION[section]}
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
    </div>
  );
}
function reorder<T>(items: T[], from: number, to: number) {
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(Math.max(0, Math.min(to, result.length)), 0, item);
  return result;
}
function OrderButtons({
  index,
  length,
  move,
}: {
  index: number;
  length: number;
  move: (to: number) => void;
}) {
  return (
    <span className="cd-order-buttons">
      <IconButton
        label="Move up"
        size="sm"
        disabled={index === 0}
        onClick={() => move(index - 1)}
      >
        <ArrowUp size={13} />
      </IconButton>
      <IconButton
        label="Move down"
        size="sm"
        disabled={index === length - 1}
        onClick={() => move(index + 1)}
      >
        <ArrowDown size={13} />
      </IconButton>
    </span>
  );
}
function DashboardConfig({
  variant,
  update,
}: {
  variant: Variant;
  update: (fn: (v: Variant) => Variant) => void;
}) {
  return (
    <CoachDashboardEditor
      variant={variant}
      onChange={(dashboard) => update((v) => ({ ...v, dashboard }))}
    />
  );
}
function TrackerConfig({
  variant,
  update,
}: {
  variant: Variant;
  update: (fn: (v: Variant) => Variant) => void;
}) {
  const [search, setSearch] = useState("");
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({});
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState<Record<string, boolean>>({});
  const removedFieldConfigs = useRef<Record<string, FieldConfig>>({});
  const id = useId();
  const normalizedSearch = search.trim().toLowerCase();
  const cycleTrackingEnabled =
    variant.cycleTrackingEnabled ??
    variant.fields.some(
      (field) =>
        PARAMETERS.find((parameter) => parameter.id === field.id)?.group ===
        "Cycle tracking",
    );
  const selectableParameters = PARAMETERS.filter(
    (parameter) =>
      parameter.id !== "cycle-day" &&
      parameter.group.toLowerCase() !== "training" &&
      (cycleTrackingEnabled || parameter.group !== "Cycle tracking"),
  );
  const groups = [...new Set(selectableParameters.map((p) => p.group))];
  const matchingParameters = selectableParameters.filter((parameter) =>
    `${parameter.name} ${parameter.group}`
      .toLowerCase()
      .includes(normalizedSearch),
  );
  const visibleFields = variant.fields.filter((field) =>
    selectableParameters.some((parameter) => parameter.id === field.id),
  );
  const visibleFieldIds = new Set(visibleFields.map((field) => field.id));
  const numericFields = visibleFields.filter((field) => {
    const parameter = selectableParameters.find((item) => item.id === field.id);
    return parameter && !parameter.inputType;
  });
  const normalizedHighlights = trackerOverviewIds(variant);
  const addHighlight = (fieldId: string) => {
    update((v) => {
      const current = trackerOverviewIds(v);
      if (current.includes(fieldId) || current.length >= 4) return v;
      return { ...v, trackerHighlights: [...current, fieldId] };
    });
  };
  const removeHighlight = (fieldId: string) =>
    update((v) => ({
      ...v,
      trackerHighlights: trackerOverviewIds(v).filter(
        (item) => item !== fieldId,
      ),
    }));
  const addParameter = (parameterId: string) => {
    const parameter = selectableParameters.find(
      (item) => item.id === parameterId,
    );
    if (!parameter || visibleFieldIds.has(parameterId)) return;
    const retained = removedFieldConfigs.current[parameterId];
    const field: FieldConfig = retained
      ? {
          ...retained,
          ...(retained.options ? { options: [...retained.options] } : {}),
        }
      : {
          id: parameter.id,
          unit: parameter.units[0] ?? "",
          ...(parameter.options ? { options: [...parameter.options] } : {}),
        };
    update((v) => ({
      ...v,
      fields: v.fields.some((item) => item.id === parameter.id)
        ? v.fields
        : [...v.fields, field],
    }));
    delete removedFieldConfigs.current[parameterId];
  };
  const removeParameter = (parameterId: string) => {
    const removed = variant.fields.find((field) => field.id === parameterId);
    if (removed) {
      removedFieldConfigs.current[parameterId] = {
        ...removed,
        ...(removed.options ? { options: [...removed.options] } : {}),
      };
    }
    update((v) => ({
      ...v,
      fields: v.fields.filter((field) => field.id !== parameterId),
      roadmap: v.roadmap.filter((row) => row.source !== parameterId),
      widgets: v.widgets.filter((widget) => widget.source !== parameterId),
      trackerHighlights: trackerOverviewIds(v).filter(
        (fieldId) => fieldId !== parameterId,
      ),
    }));
    setOptionDrafts((drafts) => {
      const next = { ...drafts };
      delete next[parameterId];
      return next;
    });
  };
  return (
    <div className="cd-tracker-config">
      <p className="cd-muted cd-tracker-intro">
        Set the daily log in the order athletes will use it. Their history stays
        available when a field is removed.
      </p>
      <section
        className="cd-tracker-section"
        aria-labelledby="cd-tracker-fields-title"
      >
        <div className="cd-tracker-section-heading">
          <div>
            <span className="cd-tracker-eyebrow">01 / TRACKER CONTENT</span>
            <h3 id="cd-tracker-fields-title">Daily fields</h3>
          </div>
          <span className="cd-tracker-count">
            {visibleFields.length} active
          </span>
        </div>
        {visibleFields.length ? (
          <div className="cd-tracker-selected-list">
            {visibleFields.map((field, index) => {
              const parameter = selectableParameters.find(
                (item) => item.id === field.id,
              );
              if (!parameter) return null;
              const canConfigureUnit =
                parameter.units.length > 0 &&
                ![
                  "text",
                  "context",
                  "choice",
                  "multi-choice",
                  "location-rating",
                  "period-start",
                  "cycle-day",
                ].includes(parameter.inputType ?? "");
              const canConfigureChoices =
                parameter.inputType === "choice" ||
                parameter.inputType === "multi-choice";
              const hasSettings =
                canConfigureUnit ||
                canConfigureChoices ||
                parameter.id === "period-start";
              const isOpen = detailsOpen[field.id] ?? false;
              return (
                <article className="cd-tracker-selected-row" key={field.id}>
                  <div className="cd-tracker-row-main">
                    <span className="cd-tracker-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="cd-tracker-field-name">
                      <strong>{parameter.name}</strong>
                      <span>{parameter.group}</span>
                    </div>
                    <div className="cd-tracker-row-actions">
                      {hasSettings && (
                        <button
                          type="button"
                          className="cd-tracker-text-button"
                          aria-label={`Settings for ${parameter.name}`}
                          aria-expanded={isOpen}
                          onClick={() =>
                            setDetailsOpen((open) => ({
                              ...open,
                              [field.id]: !isOpen,
                            }))
                          }
                        >
                          {isOpen ? "Close settings" : "Settings"}
                          <ChevronDown size={13} aria-hidden="true" />
                        </button>
                      )}
                      <OrderButtons
                        index={index}
                        length={visibleFields.length}
                        move={(to) => {
                          const reorderedVisible = reorder(
                            visibleFields,
                            index,
                            to,
                          );
                          update((v) => {
                            let visibleIndex = 0;
                            return {
                              ...v,
                              fields: v.fields.map((item) =>
                                visibleFieldIds.has(item.id)
                                  ? reorderedVisible[visibleIndex++]
                                  : item,
                              ),
                            };
                          });
                        }}
                      />
                      <button
                        type="button"
                        className="cd-tracker-remove"
                        aria-label={`Remove ${parameter.name}`}
                        onClick={() => removeParameter(field.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="cd-tracker-field-settings">
                      {parameter.id === "period-start" && (
                        <p className="cd-tracker-cycle-note">
                          Cycle day is calculated automatically from period
                          starts.
                        </p>
                      )}
                      {canConfigureUnit && (
                        <Select
                          label={`Unit for ${parameter.name}`}
                          value={field.unit}
                          options={parameter.units}
                          onChange={(unit) =>
                            update((v) => ({
                              ...v,
                              fields: v.fields.map((item) =>
                                item.id === field.id ? { ...item, unit } : item,
                              ),
                              roadmap:
                                unit === "Word labels"
                                  ? v.roadmap.filter(
                                      (row) => row.source !== field.id,
                                    )
                                  : v.roadmap,
                            }))
                          }
                        />
                      )}
                      {canConfigureChoices && (
                        <TextArea
                          className="cd-tracker-options"
                          label="Choice labels"
                          rows={2}
                          value={
                            optionDrafts[field.id] ??
                            (field.options ?? parameter.options ?? []).join(
                              ", ",
                            )
                          }
                          onChange={(event) => {
                            const draft = event.target.value;
                            const options = [
                              ...new Set(
                                draft
                                  .split(/[\n,]/)
                                  .map((option) => option.trim())
                                  .filter(Boolean),
                              ),
                            ];
                            setOptionDrafts((drafts) => ({
                              ...drafts,
                              [field.id]: draft,
                            }));
                            update((v) => ({
                              ...v,
                              fields: v.fields.map((item) =>
                                item.id === field.id
                                  ? { ...item, options }
                                  : item,
                              ),
                            }));
                          }}
                          onBlur={() =>
                            setOptionDrafts((drafts) => {
                              const next = { ...drafts };
                              delete next[field.id];
                              return next;
                            })
                          }
                          aria-label={`Choice labels for ${parameter.name}`}
                          placeholder="Separate labels with commas"
                        />
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="cd-tracker-empty">
            No daily fields yet. Add a parameter below to start the log.
          </p>
        )}
        <button
          type="button"
          className="cd-tracker-library-toggle"
          aria-expanded={libraryOpen}
          onClick={() => setLibraryOpen((open) => !open)}
        >
          <span className="cd-tracker-add-mark">
            <Plus size={15} />
          </span>
          <span>
            <strong>Add parameter</strong>
            <small>Browse the health input library</small>
          </span>
          <ChevronDown size={15} className="cd-tracker-group-chevron" />
        </button>
        {libraryOpen && (
          <div className="cd-tracker-library">
            <div className="cd-tracker-search">
              <SearchBox
                value={search}
                onChange={setSearch}
                placeholder="Search parameters or categories"
              />
              <span className="cd-muted" aria-live="polite">
                {
                  matchingParameters.filter(
                    (parameter) => !visibleFieldIds.has(parameter.id),
                  ).length
                }{" "}
                available
              </span>
            </div>
            <div className="cd-tracker-catalog">
              {groups.map((group, groupIndex) => {
                const items = selectableParameters.filter(
                  (parameter) =>
                    parameter.group === group &&
                    `${parameter.name} ${parameter.group}`
                      .toLowerCase()
                      .includes(normalizedSearch) &&
                    !visibleFieldIds.has(parameter.id),
                );
                const expanded = normalizedSearch
                  ? true
                  : (groupOpen[group] ?? false);
                const groupId = `${id}-group-${groupIndex}`;
                return items.length ? (
                  <section className="cd-tracker-library-group" key={group}>
                    <button
                      type="button"
                      className="cd-tracker-group-toggle"
                      aria-expanded={expanded}
                      aria-controls={groupId}
                      onClick={() =>
                        setGroupOpen((current) => ({
                          ...current,
                          [group]: !expanded,
                        }))
                      }
                    >
                      <span className="cd-tracker-group-title">{group}</span>
                      <span className="cd-tracker-group-count">
                        {items.length} available
                      </span>
                      <ChevronDown
                        size={15}
                        className="cd-tracker-group-chevron"
                      />
                    </button>
                    <div id={groupId} hidden={!expanded}>
                      {items.map((parameter) => (
                        <div
                          className="cd-tracker-library-item"
                          key={parameter.id}
                        >
                          <span>
                            <strong>{parameter.name}</strong>
                            <small>
                              {parameter.inputType === "choice" ||
                              parameter.inputType === "multi-choice"
                                ? "Choice"
                                : typeof parameter.sample === "number"
                                  ? "Numeric"
                                  : (parameter.inputType ?? "Daily entry")}
                            </small>
                          </span>
                          <button
                            type="button"
                            className="cd-tracker-add-button"
                            onClick={() => addParameter(parameter.id)}
                          >
                            Add <Plus size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null;
              })}
              {matchingParameters.filter(
                (parameter) => !visibleFieldIds.has(parameter.id),
              ).length === 0 && (
                <p className="cd-tracker-empty">
                  No matching available parameters.
                </p>
              )}
            </div>
            <Toggle
              label="Include cycle tracking"
              detail="Cycle day is calculated from period starts. Existing cycle settings stay saved while hidden."
              checked={cycleTrackingEnabled}
              onChange={(enabled) =>
                update((v) => {
                  const hasCycleFields = v.fields.some(
                    (field) =>
                      PARAMETERS.find((parameter) => parameter.id === field.id)
                        ?.group === "Cycle tracking",
                  );
                  return {
                    ...v,
                    cycleTrackingEnabled: enabled,
                    fields:
                      enabled && !hasCycleFields
                        ? [
                            ...v.fields,
                            {
                              id: "bleeding-level",
                              unit:
                                PARAMETERS.find(
                                  (parameter) =>
                                    parameter.id === "bleeding-level",
                                )?.units[0] ?? "",
                              options: [
                                ...(PARAMETERS.find(
                                  (parameter) =>
                                    parameter.id === "bleeding-level",
                                )?.options ?? []),
                              ],
                            },
                            { id: "period-start", unit: "date" },
                          ]
                        : v.fields,
                  };
                })
              }
            />
          </div>
        )}
      </section>
      <section
        className="cd-tracker-overview"
        aria-labelledby="cd-tracker-overview-title"
      >
        <div className="cd-tracker-section-heading">
          <div>
            <span className="cd-tracker-eyebrow">02 / AT A GLANCE</span>
            <h3 id="cd-tracker-overview-title">Daily overview</h3>
          </div>
          <span className="cd-tracker-count">
            {normalizedHighlights.length} / 4
          </span>
        </div>
        <p className="cd-tracker-help">
          Choose up to four numeric or rating fields to pin above the daily log.
        </p>
        {normalizedHighlights.length ? (
          <div className="cd-tracker-highlight-list">
            {normalizedHighlights.map((fieldId, index) => {
              const parameter = ALL_PARAMETERS.find(
                (item) => item.id === fieldId,
              );
              if (!parameter) return null;
              return (
                <div className="cd-tracker-highlight-row" key={fieldId}>
                  <span className="cd-tracker-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <strong>{parameter.name}</strong>
                  <div className="cd-tracker-highlight-actions">
                    <OrderButtons
                      index={index}
                      length={normalizedHighlights.length}
                      move={(to) =>
                        update((v) => {
                          const chosen = trackerOverviewIds(v);
                          return {
                            ...v,
                            trackerHighlights: reorder(chosen, index, to),
                          };
                        })
                      }
                    />
                    <button
                      type="button"
                      className="cd-tracker-remove"
                      aria-label={`Remove ${parameter.name} from daily overview`}
                      onClick={() => removeHighlight(fieldId)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="cd-tracker-empty">
            No overview metrics selected. Add up to four below, or leave this
            section empty.
          </p>
        )}
        <div className="cd-tracker-overview-add">
          <Select
            label="Add overview metric"
            value=""
            disabled={
              normalizedHighlights.length >= 4 ||
              numericFields.every((field) =>
                normalizedHighlights.includes(field.id),
              )
            }
            options={[
              { value: "", label: "Choose a numeric or rating field…" },
              ...numericFields
                .filter((field) => !normalizedHighlights.includes(field.id))
                .map((field) => ({
                  value: field.id,
                  label:
                    ALL_PARAMETERS.find(
                      (parameter) => parameter.id === field.id,
                    )?.name ?? field.id,
                })),
            ]}
            onChange={addHighlight}
          />
        </div>
      </section>
    </div>
  );
}
function RoadmapConfig({
  variant,
  update,
}: {
  variant: Variant;
  update: (fn: (v: Variant) => Variant) => void;
}) {
  const compatible = variant.fields.filter(
    (f) =>
      ALL_PARAMETERS.find((p) => p.id === f.id)?.calculations.length &&
      f.unit !== "Word labels",
  );
  const phases = variant.roadmapPhases !== false;
  const phaseInputRef = useRef<HTMLInputElement>(null);
  const [phaseText, setPhaseText] = useState(() =>
    (variant.phaseOptions ?? DEFAULT_PHASE_OPTIONS).join(", "),
  );
  useEffect(() => {
    if (document.activeElement !== phaseInputRef.current)
      setPhaseText((variant.phaseOptions ?? DEFAULT_PHASE_OPTIONS).join(", "));
  }, [variant.phaseOptions]);
  const commitPhaseText = (raw: string) => {
    setPhaseText(raw);
    update((v) => ({
      ...v,
      phaseOptions: [
        ...new Set(
          raw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ],
    }));
  };
  const normalizePhaseText = () =>
    setPhaseText(
      [
        ...new Set(
          phaseText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ].join(", "),
    );
  return (
    <>
      <p className="cd-muted">
        Choose a tracked parameter, then a compatible weekly calculation. Actual
        values come from the athlete’s recorded weeks.
      </p>
      {compatible.length === 0 && (
        <Empty title="No compatible fields">
          Select numeric tracker fields to unlock weekly roadmap metrics.
        </Empty>
      )}
      {compatible.map((f) => {
        const p = ALL_PARAMETERS.find((p) => p.id === f.id);
        const r = variant.roadmap.find((r) => r.source === f.id);
        if (!p) return null;
        return (
          <div className="cd-roadmap-setting" key={f.id}>
            <Toggle
              label={p.name}
              checked={!!r}
              onChange={(checked) =>
                update((v) => ({
                  ...v,
                  roadmap: checked
                    ? [
                        ...v.roadmap,
                        {
                          source: f.id,
                          calculation: p.calculations[0],
                          comparison: false,
                        },
                      ]
                    : v.roadmap.filter((r) => r.source !== f.id),
                }))
              }
            />
            {r && (
              <>
                <Select
                  label={`Calculation for ${p.name}`}
                  value={r.calculation}
                  options={p.calculations.map((calculation) => ({
                    value: calculation,
                    label:
                      (
                        {
                          Trend: "Change over week",
                          Adherence: "Days on target (%)",
                        } as Record<string, string>
                      )[calculation] ?? calculation,
                  }))}
                  onChange={(calculation) =>
                    update((v) => ({
                      ...v,
                      roadmap: v.roadmap.map((r) =>
                        r.source === f.id
                          ? {
                              ...r,
                              calculation,
                              comparison: calculation === "Target vs actual",
                            }
                          : r,
                      ),
                    }))
                  }
                />
                <p className="cd-caption">
                  {
                    (
                      {
                        "Weekly average":
                          "Mean of recorded daily values for the Monday–Sunday week; missing days are excluded.",
                        Trend:
                          "Difference between the first and last recorded values of the week.",
                        "Target vs actual":
                          "Weekly average compared with the athlete’s configured target.",
                        Adherence:
                          "Percentage of recorded days meeting the athlete’s daily minimum target.",
                      } as Record<string, string>
                    )[r.calculation]
                  }
                </p>
              </>
            )}
          </div>
        );
      })}
      <Toggle
        label="Include phase selection"
        detail="Adds a phase selector and its available options to the roadmap."
        checked={phases}
        onChange={(roadmapPhases) => update((v) => ({ ...v, roadmapPhases }))}
      />
      {phases && (
        <Vari8Input
          label="Phase options · comma separated"
          ref={phaseInputRef}
          value={phaseText}
          maxLength={500}
          placeholder="Fat loss, Maintenance, Muscle gain, Recovery"
          onChange={(e) => commitPhaseText(e.target.value)}
          onBlur={normalizePhaseText}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              normalizePhaseText();
            }
          }}
        />
      )}
      <h3>Activity planning</h3>
      <p className="cd-caption">
        Prescription columns resolved from each client’s saved activity targets.
        They do not need a matching daily tracker field.
      </p>
      {(
        [
          ["steps", "Steps target"],
          ["cardio", "Cardio target"],
        ] as const
      ).map(([metric, label]) => (
        <Toggle
          key={metric}
          label={label}
          detail={
            metric === "steps"
              ? "Shows the dated steps/day prescription in each weekly row."
              : "Shows the dated sessions/week × min/session prescription in each weekly row."
          }
          checked={(variant.roadmapActivityTargets ?? []).includes(metric)}
          onChange={(checked) =>
            update((v) => {
              const selected = new Set(v.roadmapActivityTargets ?? []);
              if (checked) selected.add(metric);
              else selected.delete(metric);
              const ordered = (["steps", "cardio"] as const).filter((m) =>
                selected.has(m),
              );
              return {
                ...v,
                roadmapActivityTargets: ordered.length
                  ? [...ordered]
                  : undefined,
              };
            })
          }
        />
      ))}
      <p className="cd-caption">
        Open Preview client to see the weekly table built from actual recorded
        weeks.
      </p>
    </>
  );
}
function TrainingConfig({
  variant,
  update,
}: {
  variant: Variant;
  update: (fn: (v: Variant) => Variant) => void;
}) {
  const t = variant.training;
  return (
    <>
      <p className="cd-muted">
        Configure prescription fields. Exercises, program type and week count
        belong to the athlete’s setup.
      </p>
      <div className="cd-check-grid">
        {TRAINING_FIELDS.map((f) => (
          <Checkbox
            key={f}
            label={f}
            checked={t.fields.includes(f)}
            onCheckedChange={(checked) =>
              update((v) => ({
                ...v,
                training: {
                  ...v.training,
                  fields: checked
                    ? [...v.training.fields, f]
                    : v.training.fields.filter((x) => x !== f),
                },
              }))
            }
          />
        ))}
      </div>
      <TrainingOptionsConfig variant={variant} update={update} />
      <Toggle
        label="Display training volume"
        detail="Counts primary working sets per muscle group per week."
        checked={t.volume}
        onChange={(volume) =>
          update((v) => ({ ...v, training: { ...v.training, volume } }))
        }
      />
      {t.volume && (
        <>
          <div className="cd-setting-row">
            <span>Volume breakdown</span>
            <strong>{WEEKLY_VOLUME_BREAKDOWN}</strong>
          </div>
          <Select
            label="Volume presentation"
            value={t.presentation}
            options={["Table", "Heatmap"]}
            onChange={(presentation) =>
              update((v) => ({
                ...v,
                training: { ...v.training, presentation },
              }))
            }
          />
          <p className="cd-caption">
            Open Preview client to see the full program and configured volume
            view.
          </p>
        </>
      )}
    </>
  );
}

const TRAINING_OPTION_FIELDS: {
  key: TrainingOptionKey;
  label: string;
  field: string;
  description: string;
}[] = [
  {
    key: "setType",
    label: "Set type",
    field: "Set type",
    description: "Labels coaches can choose for each set.",
  },
  {
    key: "progression",
    label: "Progression",
    field: "Progression notes",
    description: "Reusable guidance attached to an exercise.",
  },
  {
    key: "tempo",
    label: "Tempo",
    field: "Tempo",
    description: "Common tempo prescriptions for the program.",
  },
  {
    key: "rest",
    label: "Rest",
    field: "Rest / pause",
    description: "Rest intervals available in the set editor.",
  },
];

function cleanTrainingOptions(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function TrainingOptionsConfig({
  variant,
  update,
}: {
  variant: Variant;
  update: (fn: (v: Variant) => Variant) => void;
}) {
  const [draftValues, setDraftValues] = useState<
    Partial<Record<TrainingOptionKey, Record<number, string>>>
  >({});
  const [activeKey, setActiveKey] = useState<TrainingOptionKey | null>(null);
  const options: TrainingOptions = {
    ...DEFAULT_TRAINING_OPTIONS,
    ...variant.training.options,
  };
  const defaults = {
    ...DEFAULT_TRAINING_DEFAULTS,
    ...variant.training.defaults,
  };
  const writeOptions = (
    key: TrainingOptionKey,
    nextOptions: string[],
    preferredDefault?: string,
  ) => {
    const normalized = cleanTrainingOptions(nextOptions);
    update((v) => {
      const current = {
        ...DEFAULT_TRAINING_DEFAULTS,
        ...v.training.defaults,
      };
      const nextDefault = normalized.includes(current[key])
        ? current[key]
        : (normalized[0] ?? "");
      return {
        ...v,
        training: {
          ...v.training,
          options: {
            ...DEFAULT_TRAINING_OPTIONS,
            ...v.training.options,
            [key]: normalized,
          },
          defaults: {
            ...current,
            [key]: preferredDefault ?? nextDefault,
          },
        },
      };
    });
  };

  const enabledFields = TRAINING_OPTION_FIELDS.filter(({ field }) =>
    variant.training.fields.includes(field),
  );
  const active = TRAINING_OPTION_FIELDS.find(({ key }) => key === activeKey);
  const renderEditor = ({
    key,
    label,
    description,
  }: (typeof TRAINING_OPTION_FIELDS)[number]) => {
    const values = options[key];
    const currentValues = cleanTrainingOptions(
      values.map((value, index) => draftValues[key]?.[index] ?? value),
    );
    const selectedDefault = values.includes(defaults[key])
      ? defaults[key]
      : (values[0] ?? "");
    return (
      <section className="cd-training-option-group" key={key}>
        <header>
          <div>
            <h4>{label}</h4>
            <p>{description}</p>
          </div>
          {values.length > 0 && (
            <Vari8Select
              label={`${label} default`}
              value={selectedDefault}
              onValueChange={(nextValue) =>
                update((v) => ({
                  ...v,
                  training: {
                    ...v.training,
                    options: {
                      ...DEFAULT_TRAINING_OPTIONS,
                      ...v.training.options,
                    },
                    defaults: {
                      ...DEFAULT_TRAINING_DEFAULTS,
                      ...v.training.defaults,
                      [key]: nextValue,
                    },
                  },
                }))
              }
              options={values.map((value) => ({ value, label: value }))}
            />
          )}
        </header>
        <div className="cd-training-option-rows">
          {values.map((value, index) => (
            <div className="cd-training-option-row" key={`${key}-${value}`}>
              <Vari8Input
                label={`${label} option ${index + 1}`}
                className="cd-training-option-input"
                value={draftValues[key]?.[index] ?? value}
                maxLength={100}
                onChange={(event) =>
                  setDraftValues((current) => ({
                    ...current,
                    [key]: {
                      ...current[key],
                      [index]: event.target.value,
                    },
                  }))
                }
                onBlur={(event) => {
                  const next = [...values];
                  const typed = event.currentTarget.value.trim();
                  if (!typed && values.length > 1) next.splice(index, 1);
                  else next[index] = typed || value;
                  const normalized = cleanTrainingOptions(next);
                  writeOptions(key, normalized);
                  setDraftValues((current) => {
                    return { ...current, [key]: {} };
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
              <button
                type="button"
                className="cd-training-option-remove"
                aria-label={`Remove ${label.toLowerCase()} option ${value}`}
                disabled={values.length === 1}
                onClick={() => {
                  writeOptions(
                    key,
                    currentValues.filter((option) => option !== value),
                  );
                  setDraftValues((current) => ({
                    ...current,
                    [key]: {},
                  }));
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {values.length === 0 && (
            <p className="cd-training-option-empty">
              Add a choice to make this field available in the set editor.
            </p>
          )}
          <Button
            className="cd-training-option-add"
            onClick={() => {
              const base = "New option";
              let label = base;
              let index = 2;
              while (currentValues.includes(label))
                label = `${base} ${index++}`;
              writeOptions(
                key,
                [...currentValues, label],
                selectedDefault || label,
              );
              setDraftValues((current) => ({
                ...current,
                [key]: {},
              }));
            }}
          >
            <Plus size={14} />
            Add choice
          </Button>
        </div>
      </section>
    );
  };

  return (
    <section
      className="cd-training-options"
      aria-label="Training field choices"
    >
      <div className="cd-training-option-compact-list">
        {enabledFields.map(({ key, label, description }) => (
          <div className="cd-training-option-compact-row" key={key}>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <Button onClick={() => setActiveKey(key)}>Configure</Button>
          </div>
        ))}
        {!enabledFields.length && (
          <p className="cd-caption">
            Enable a prescription field above to configure its choices.
          </p>
        )}
      </div>
      {active && (
        <Dialog
          title={`${active.label} choices`}
          onClose={() => setActiveKey(null)}
          wide
        >
          <p className="cd-muted">
            Saved with this template. Existing client assignments keep their
            current configuration until you assign an updated template.
          </p>
          {renderEditor(active)}
        </Dialog>
      )}
    </section>
  );
}
function QuestionnaireConfig({
  variant,
  update,
}: {
  variant: Variant;
  update: (fn: (v: Variant) => Variant) => void;
}) {
  const [mode, setMode] = useState("Full form");
  const patch = (id: string, patch: Partial<Question>) =>
    update((v) => ({
      ...v,
      questions: v.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    }));
  return (
    <>
      <div className="cd-subheading">
        <p className="cd-muted">Build a clear weekly conversation.</p>
        <Button
          onClick={() =>
            update((v) => ({
              ...v,
              questions: [
                ...v.questions,
                {
                  id: uid("question"),
                  label: "New question",
                  type: "Long text",
                  required: false,
                  options: "",
                },
              ],
            }))
          }
        >
          <Plus size={14} />
          Add question
        </Button>
      </div>
      {variant.questions.map((q, i) => (
        <div className="cd-question-edit" key={q.id}>
          <div className="cd-subheading">
            <span className="cd-muted">Question {i + 1}</span>
            <div className="cd-actions">
              <OrderButtons
                index={i}
                length={variant.questions.length}
                move={(to) =>
                  update((v) => ({
                    ...v,
                    questions: reorder(v.questions, i, to),
                  }))
                }
              />
              <IconButton
                label="Duplicate question"
                onClick={() =>
                  update((v) => ({
                    ...v,
                    questions: [
                      ...v.questions.slice(0, i + 1),
                      { ...q, id: uid("question") },
                      ...v.questions.slice(i + 1),
                    ],
                  }))
                }
              >
                <Copy size={14} />
              </IconButton>
              <IconButton
                label="Remove question"
                onClick={() =>
                  update((v) => ({
                    ...v,
                    questions: v.questions.filter((x) => x.id !== q.id),
                  }))
                }
              >
                <Trash2 size={14} />
              </IconButton>
            </div>
          </div>
          <Vari8Input
            label="Question label"
            value={q.label}
            onChange={(e) => patch(q.id, { label: e.target.value })}
          />
          <Select
            label={`Question ${i + 1} type`}
            value={q.type}
            options={[
              "Short text",
              "Long text",
              "Numeric",
              "Rating",
              "Choice",
              "Visual upload",
            ]}
            onChange={(type) =>
              patch(q.id, {
                type: type as Question["type"],
                options: type === "Rating" ? "1–10" : "",
              })
            }
          />
          {q.type === "Choice" && (
            <Vari8Input
              label="Choices, separated by commas"
              value={q.options}
              onChange={(e) => patch(q.id, { options: e.target.value })}
              placeholder="Good, Okay, Difficult"
            />
          )}
          {q.type === "Rating" && (
            <Select
              label="Rating scale"
              value={q.options || "1–10"}
              options={["1–10", "1–5", "Word labels"]}
              onChange={(options) => patch(q.id, { options })}
            />
          )}
          <Toggle
            label={`Required: ${q.label}`}
            checked={q.required}
            onChange={(required) => patch(q.id, { required })}
          />
        </div>
      ))}
      <h3>Included summaries</h3>
      <div className="cd-check-grid">
        {[
          ...variant.fields
            .filter((f) =>
              ["weight", "calories", "sleep", "steps", "protein"].includes(
                f.id,
              ),
            )
            .map((f) => ({
              id: f.id,
              label: ALL_PARAMETERS.find((p) => p.id === f.id)?.name ?? f.id,
            })),
          ...(variant.habits ? [{ id: "habits", label: "Habit status" }] : []),
        ].map((s) => (
          <Checkbox
            key={s.id}
            label={s.label}
            checked={variant.summaries.includes(s.id)}
            onCheckedChange={(checked) =>
              update((v) => ({
                ...v,
                summaries: checked
                  ? [...v.summaries, s.id]
                  : v.summaries.filter((x) => x !== s.id),
              }))
            }
          />
        ))}
      </div>
      <div className="cd-subheading">
        <h3>Questionnaire preview</h3>
        <Select
          label="Preview form"
          value={mode}
          options={["Full form", "Custom update"]}
          onChange={setMode}
        />
      </div>
      <FormPreview variant={variant} custom={mode === "Custom update"} />
    </>
  );
}
