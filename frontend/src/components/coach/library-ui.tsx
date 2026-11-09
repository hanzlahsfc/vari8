"use client";

import { Check, Copy, Eye, Pencil, Trash2, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Checkbox,
  Input as SharedInput,
  Tabs,
} from "@/components/vari8/components";
import { TextArea as SharedTextArea } from "@/components/vari8/inputs";
import { EditorHeader } from "@/components/vari8/layouts";
import type { MealPlan } from "../ethereal/mealplan/model";
import {
  applyPlanToClient,
  detachPlan,
  draftNeedsReplace,
  emptyPlanLibrary,
  instantiateFromLibrary,
  makeLibraryId,
  planRouteForKind,
  removeFromLibrary,
  saveToLibrary,
  templateNameFromPlan,
} from "./library";
import {
  type CoachClient,
  type CoachState,
  formatDate,
  type LibraryEntry,
  type LibraryKind,
  newVariant,
  type PlanLibrary,
  type Route,
  TODAY,
  type Variant,
} from "./model";
import {
  NutritionEditor,
  NutritionPlanPreview,
} from "./plans/nutrition/editor";
import { TrainingEditor, TrainingPrescription } from "./plans/training/editor";
import { resolveTrainingWeek, type TrainingPlan } from "./plans/types";
import { useCoach } from "./store";
import {
  SupplementEditor,
  type SupplementEditorHandle,
} from "./supplements/editor";
import type { SupplementPlan } from "./supplements/model";
import { SupplementPlanView } from "./supplements/plan-view";
import { assignedVariant, templateSetup } from "./template-setup";
import { TemplateLibrary } from "./templates";
import {
  Avatar,
  Button,
  Dialog,
  Empty,
  PageTitle,
  SearchBox,
  Status,
  Surface,
} from "./ui";
import "./library-ui.css";

type PlanContent = TrainingPlan | MealPlan | SupplementPlan;
type AnyEntry = LibraryEntry<PlanContent>;
export type LibraryPlanEntry = AnyEntry;

const KIND_LABEL: Record<LibraryKind, string> = {
  training: "Training",
  nutrition: "Nutrition",
  supplements: "Supplements",
};

const KIND_COPY: Record<LibraryKind, { title: string; description: string }> = {
  training: {
    title: "Training templates",
    description:
      "Reusable programs saved from client plans. Start a client from one, or preview the sessions first.",
  },
  nutrition: {
    title: "Nutrition templates",
    description:
      "Multi-variant meal plans saved from client plans. IIFYM clients keep their targets instead.",
  },
  supplements: {
    title: "Supplement templates",
    description:
      "Catalogue-backed stacks saved from client plans. Quantities, timing and status travel with the template.",
  },
};

function entriesOf(
  library: PlanLibrary | undefined,
  kind: LibraryKind,
): AnyEntry[] {
  return (library ?? emptyPlanLibrary())[kind] as AnyEntry[];
}

/**
 * The configuration that shapes the training editor. A template saved from a
 * client opens with that client's setup so the library editor shows the same
 * sections and controls as the client's own Plans editor.
 */
function libraryConfiguration(state: CoachState, entry: AnyEntry): Variant {
  const source = entry.sourceClientId
    ? state.clients.find((client) => client.id === entry.sourceClientId)
    : undefined;
  return (
    (source ? assignedVariant(source) : undefined) ??
    newVariant("template", "Template")
  );
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

function trainingStats(plan: TrainingPlan) {
  const sessions = resolveTrainingWeek(plan, 1);
  const exercises = sessions.reduce(
    (total, session) => total + session.exercises.length,
    0,
  );
  const sets = sessions.reduce(
    (total, session) =>
      total +
      session.exercises.reduce(
        (inner, exercise) => inner + exercise.sets.length,
        0,
      ),
    0,
  );
  return `${plural(sessions.length, "session")} · ${plural(exercises, "exercise")} · ${plural(sets, "set")}`;
}

function nutritionStats(plan: MealPlan) {
  const meals = plan.variants.reduce(
    (total, variant) => total + variant.meals.length,
    0,
  );
  const foods = plan.variants.reduce(
    (total, variant) =>
      total +
      variant.meals.reduce((inner, meal) => inner + meal.portions.length, 0),
    0,
  );
  return `${plural(plan.variants.length, "day plan")} · ${plural(meals, "meal")} · ${plural(foods, "food")}`;
}

function statsFor(kind: LibraryKind, entry: AnyEntry) {
  if (kind === "training") return trainingStats(entry.content as TrainingPlan);
  if (kind === "nutrition") return nutritionStats(entry.content as MealPlan);
  const plan = entry.content as SupplementPlan;
  return plural(plan.items.length, "product");
}

function TemplatePreviewDialog({
  kind,
  entry,
  onClose,
}: {
  kind: LibraryKind;
  entry: AnyEntry;
  onClose: () => void;
}) {
  const { state } = useCoach();
  return (
    <Dialog full title={`Preview · ${entry.name}`} onClose={onClose}>
      <p className="cd-muted">
        {entry.description ||
          "Preview only. Using this template creates a fresh draft."}
      </p>
      {kind === "training" ? (
        <TrainingPrescription
          value={entry.content as TrainingPlan}
          week={1}
          configuration={libraryConfiguration(state, entry)}
        />
      ) : kind === "nutrition" ? (
        <NutritionPlanPreview value={entry.content as MealPlan} allOptions />
      ) : (
        <SupplementPlanView plan={entry.content as SupplementPlan} />
      )}
      <div className="cd-dialog-actions">
        <Button onClick={onClose}>Close</Button>
      </div>
    </Dialog>
  );
}

function clientBlockedFor(
  kind: LibraryKind,
  client: CoachClient,
): string | undefined {
  if (!client.assignment) return "Assign a client setup first";
  const setup = templateSetup(
    client.assignment.snapshot,
    client.assignment.variantId,
  );
  if (kind === "training" && !setup.views.includes("Training Program"))
    return "Training is hidden in this setup";
  if (
    kind === "nutrition" &&
    !setup.views.some((view) => view === "Nutrition" || view === "Mealplan")
  )
    return "Nutrition is hidden in this setup";
  if (kind === "nutrition" && setup.nutrition === "IIFYM")
    return "This client uses IIFYM targets";
  return undefined;
}

export function UseForClientDialog({
  kind,
  entry,
  onClose,
}: {
  kind: LibraryKind;
  entry: AnyEntry;
  onClose: () => void;
}) {
  const { state, setState, navigate, toast } = useCoach();
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const clients = state.clients.filter(
    (client) =>
      !client.archived &&
      client.name.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = state.clients.find((client) => client.id === clientId);
  const blocked = selected ? clientBlockedFor(kind, selected) : undefined;
  const needsReplace =
    selected && !blocked ? draftNeedsReplace(state, selected.id, kind) : false;

  const apply = () => {
    if (!selected || blocked) return;
    const content = instantiateFromLibrary(entry, selected.id, TODAY);
    setState((current) =>
      applyPlanToClient(current, selected.id, kind, content),
    );
    toast(
      kind === "supplements"
        ? `Supplement plan created from “${entry.name}” for ${selected.name}.`
        : `Draft created from “${entry.name}” for ${selected.name}.`,
    );
    onClose();
    navigate({
      section: "clients",
      client: selected.id,
      plan: planRouteForKind(kind),
    });
  };

  return (
    <Dialog title={`Use “${entry.name}” for a client`} onClose={onClose}>
      <p className="cd-muted">
        {kind === "supplements"
          ? "Choose an athlete. Their saved supplement plan is replaced by this template."
          : "Choose an athlete. A new draft is created; their active plan stays in place until activation."}
      </p>
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Find an athlete"
      />
      <div className="cd-picker-list">
        {clients.map((client) => {
          const reason = clientBlockedFor(kind, client);
          return (
            <label
              key={client.id}
              className={`cd-picker-row${reason ? " cd-picker-row-disabled" : ""}`}
            >
              <input
                type="radio"
                name="library-client"
                checked={clientId === client.id}
                disabled={Boolean(reason)}
                onChange={() => {
                  setClientId(client.id);
                  setConfirm(false);
                }}
              />
              <Avatar client={client} small />
              <span>
                <strong>{client.name}</strong>
                <small>
                  {reason ??
                    client.assignment?.snapshot.name ??
                    "No template assigned"}
                </small>
              </span>
            </label>
          );
        })}
        {!clients.length && (
          <p className="cd-muted">No athletes match that search.</p>
        )}
      </div>
      {selected && needsReplace && !confirm && (
        <p className="cd-assignment-warning" role="status">
          {selected.name} has an unsaved draft. You can review it before
          replacing.
        </p>
      )}
      <div className="cd-dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        {needsReplace && !confirm ? (
          <Button
            primary
            disabled={!selected || Boolean(blocked)}
            onClick={() => setConfirm(true)}
          >
            Continue
          </Button>
        ) : (
          <Button
            primary
            disabled={!selected || Boolean(blocked)}
            onClick={apply}
          >
            <Check size={16} />
            {needsReplace ? "Replace draft & use" : "Use for client"}
          </Button>
        )}
      </div>
    </Dialog>
  );
}

export function SaveAsTemplateDialog({
  kind,
  plan,
  clientId,
  defaultName,
  open,
  onClose,
}: {
  kind: LibraryKind;
  plan: PlanContent;
  clientId: string;
  defaultName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { state, setState, toast } = useCoach();
  const sourceClient = state.clients.find((client) => client.id === clientId);
  // Templates never carry a client name: the suggestion drops the client's
  // first and full name, and the coach can edit it before saving.
  const suggestedName = templateNameFromPlan(
    defaultName,
    sourceClient?.name,
    `${KIND_LABEL[kind]} template`,
  );
  const sameSource = entriesOf(state.library, kind)
    .filter((entry) => entry.sourceClientId === clientId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const [name, setName] = useState(suggestedName);
  const [description, setDescription] = useState("");
  const [replace, setReplace] = useState(sameSource.length > 0);
  useEffect(() => {
    if (!open) return;
    setName(suggestedName);
    setDescription("");
    setReplace(sameSource.length > 0);
  }, [open, suggestedName, sameSource.length]);
  if (!open) return null;
  const existing = sameSource[0];
  return (
    <Dialog title="Save as template" onClose={onClose}>
      <p className="cd-muted">
        Keep this {KIND_LABEL[kind].toLowerCase()} plan as a reusable starting
        point. It is detached from {sourceClient?.name ?? "the client"}: no
        client link, archive or activation dates.
      </p>
      <SharedInput
        label="Template name"
        value={name}
        maxLength={80}
        onChange={(event) => setName(event.target.value)}
      />
      <SharedTextArea
        label="Description"
        value={description}
        maxLength={240}
        rows={3}
        onChange={(event) => setDescription(event.target.value)}
      />
      {existing && (
        <Checkbox
          label={`Replace existing “${existing.name}”`}
          description="This template was last saved from the same client plan."
          checked={replace}
          onCheckedChange={setReplace}
        />
      )}
      <p className="cd-caption">Notes written inside the plan are included.</p>
      <div className="cd-dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          primary
          disabled={!name.trim()}
          onClick={() => {
            setState((current) =>
              saveToLibrary(current, kind, plan, {
                name: name.trim(),
                description: description.trim(),
                replaceId: replace ? existing?.id : undefined,
              }),
            );
            toast("Saved to your library");
            onClose();
          }}
        >
          <Check size={16} />
          Save template
        </Button>
      </div>
    </Dialog>
  );
}

export function TemplatePickerDialog({
  kind,
  open,
  onClose,
  onUse,
}: {
  kind: LibraryKind;
  open: boolean;
  onClose: () => void;
  onUse: (entry: AnyEntry) => void;
}) {
  const { state } = useCoach();
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<AnyEntry | null>(null);
  const [selected, setSelected] = useState<AnyEntry | null>(null);
  const entries = entriesOf(state.library, kind);
  const filtered = entries.filter((entry) =>
    `${entry.name} ${entry.description}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  if (!open) return null;
  return (
    <>
      <Dialog
        title={`Start from ${KIND_LABEL[kind].toLowerCase()} template`}
        onClose={onClose}
      >
        <p className="cd-muted">
          Choose a saved template. It becomes this client's draft, with every
          internal id made fresh.
        </p>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search templates"
        />
        <div className="cd-picker-list">
          {filtered.map((entry) => (
            <label key={entry.id} className="cd-picker-row">
              <input
                type="radio"
                name={`library-pick-${kind}`}
                checked={selected?.id === entry.id}
                onChange={() => setSelected(entry)}
              />
              <span>
                <strong>{entry.name}</strong>
                <small>{entry.description || statsFor(kind, entry)}</small>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={(event) => {
                  event.preventDefault();
                  setPreview(entry);
                }}
              >
                <Eye size={14} />
                Preview
              </Button>
            </label>
          ))}
          {!filtered.length && (
            <Empty
              title={
                entries.length ? "No matching templates" : "No templates yet"
              }
            >
              {entries.length
                ? "Try another name or description."
                : "Save a client plan as a template first, then it will appear here."}
            </Empty>
          )}
        </div>
        <div className="cd-dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            primary
            disabled={!selected}
            onClick={() => selected && onUse(selected)}
          >
            Use template
          </Button>
        </div>
      </Dialog>
      {preview && (
        <TemplatePreviewDialog
          kind={kind}
          entry={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

function RenameEntryDialog({
  kind,
  entry,
  onClose,
}: {
  kind: LibraryKind;
  entry: AnyEntry;
  onClose: () => void;
}) {
  const { setState, toast } = useCoach();
  const [name, setName] = useState(entry.name);
  const [description, setDescription] = useState(entry.description);
  return (
    <Dialog title="Template details" onClose={onClose}>
      <SharedInput
        label="Template name"
        value={name}
        maxLength={80}
        onChange={(event) => setName(event.target.value)}
      />
      <SharedTextArea
        label="Description"
        value={description}
        maxLength={240}
        rows={3}
        onChange={(event) => setDescription(event.target.value)}
      />
      <div className="cd-dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          primary
          disabled={!name.trim()}
          onClick={() => {
            setState((current) => {
              const library = current.library ?? emptyPlanLibrary();
              return {
                ...current,
                library: {
                  ...library,
                  [kind]: library[kind].map((candidate) =>
                    candidate.id === entry.id
                      ? {
                          ...candidate,
                          name: name.trim(),
                          description: description.trim(),
                          updatedAt: TODAY,
                        }
                      : candidate,
                  ),
                },
              };
            });
            toast("Template details saved");
            onClose();
          }}
        >
          Save details
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * Template content editing. This is the client's Plans editor in every visual
 * respect — same `EditorHeader` chrome, same page column, same
 * `TrainingEditor` / `NutritionEditor` / `SupplementEditor` — mounted for a
 * detached library entry instead of a client plan.
 */
export function TemplateEntryPage({
  kind,
  entry,
  onClose,
}: {
  kind: LibraryKind;
  entry: AnyEntry;
  onClose: () => void;
}) {
  const { state, setState, toast, guard, navigate } = useCoach();
  const [value, setValue] = useState<PlanContent>(() =>
    structuredClone(entry.content),
  );
  const [savedValue] = useState(() => JSON.stringify(entry.content));
  const supplementRef = useRef<SupplementEditorHandle | null>(null);
  const [supplementDirty, setSupplementDirty] = useState(false);
  const [leaving, setLeaving] = useState<Route | null>(null);
  const dirty =
    kind === "supplements"
      ? supplementDirty
      : JSON.stringify(value) !== savedValue;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const configuration = libraryConfiguration(state, entry);

  // Same unsaved-work contract as the client plan editor.
  useEffect(() => {
    guard.current = (next) => {
      if (!dirtyRef.current) return true;
      setLeaving(next);
      return false;
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      guard.current = null;
      window.removeEventListener("beforeunload", unload);
    };
  }, [guard]);

  const close = () => {
    guard.current = null;
    onClose();
  };
  const persist = (next: PlanContent) => {
    setState((current) => {
      const library = current.library ?? emptyPlanLibrary();
      return {
        ...current,
        library: {
          ...library,
          [kind]: library[kind].map((candidate) =>
            candidate.id === entry.id
              ? {
                  ...candidate,
                  content: detachPlan(kind, next) as never,
                  updatedAt: TODAY,
                }
              : candidate,
          ),
        },
      };
    });
    toast("Template updated");
    close();
  };
  // The supplement editor keeps its own row drafts, so its save path commits
  // through `onSaved` and the page-level action asks it to save.
  const save = () => {
    if (kind === "supplements") supplementRef.current?.save();
    else persist(value);
  };
  return (
    <div
      className={`cp-workspace cd-library-editor${kind === "nutrition" ? " cp-workspace-wide" : ""}`}
    >
      <EditorHeader
        onBack={close}
        backLabel="Templates"
        context={`Templates · ${KIND_LABEL[kind]} template`}
        title={entry.name}
        status={<Status text="Template" />}
        actions={
          <>
            <Button onClick={close}>Discard</Button>
            <Button primary onClick={save} disabled={!dirty}>
              Save template
            </Button>
          </>
        }
      />
      <div className="cp-save-state" role="status">
        {dirty
          ? "Unsaved template changes"
          : "Editing this template only. Client plans already created from it stay untouched."}
      </div>
      {kind === "training" ? (
        <TrainingEditor
          value={value as TrainingPlan}
          onChange={(next) => setValue(next)}
          configuration={configuration}
        />
      ) : kind === "nutrition" ? (
        <NutritionEditor
          value={value as MealPlan}
          onChange={(next) => setValue(next)}
        />
      ) : (
        <SupplementEditor
          ref={supplementRef}
          plan={value as SupplementPlan}
          onDirtyChange={setSupplementDirty}
          onSaved={persist}
          saveLabel="Save template"
          library
        />
      )}
      <footer className="cp-footer">
        <p>
          {dirty
            ? "Save to keep these changes in the template."
            : "Changes here never reach plans already created from this template."}
        </p>
        <div className="cd-actions cd-wrap">
          <Button onClick={close}>Discard</Button>
          <Button primary onClick={save} disabled={!dirty}>
            Save template
          </Button>
        </div>
      </footer>
      {leaving && (
        <Dialog
          title="Leave with unsaved template changes?"
          onClose={() => setLeaving(null)}
        >
          <p>
            Changes to this template are discarded. Client plans already created
            from it are unaffected.
          </p>
          <div className="cd-dialog-actions">
            <Button onClick={() => setLeaving(null)}>Keep editing</Button>
            <Button
              onClick={() => {
                guard.current = null;
                const next = leaving;
                setLeaving(null);
                navigate(next);
              }}
            >
              Discard changes
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function DeleteEntryDialog({
  kind,
  entry,
  onClose,
}: {
  kind: LibraryKind;
  entry: AnyEntry;
  onClose: () => void;
}) {
  const { state, setState, toast } = useCoach();
  return (
    <Dialog title="Delete this template?" onClose={onClose}>
      <p className="cd-muted">
        “{entry.name}” is removed from your {KIND_LABEL[kind].toLowerCase()}{" "}
        library. Client plans already created from it are retained.
      </p>
      <div className="cd-dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="destructive"
          onClick={() => {
            const index = entriesOf(state.library, kind).findIndex(
              (candidate) => candidate.id === entry.id,
            );
            setState((current) => removeFromLibrary(current, kind, entry.id));
            toast(`“${entry.name}” deleted.`, () =>
              setState((current) => {
                const library = current.library ?? emptyPlanLibrary();
                const entries = [...library[kind]];
                entries.splice(
                  Math.min(index, entries.length),
                  0,
                  entry as never,
                );
                return { ...current, library: { ...library, [kind]: entries } };
              }),
            );
            onClose();
          }}
        >
          <Trash2 size={15} />
          Delete template
        </Button>
      </div>
    </Dialog>
  );
}

function LibraryPanel({
  kind,
  onEdit,
}: {
  kind: LibraryKind;
  onEdit: (entry: AnyEntry) => void;
}) {
  const { state, setState, navigate, toast } = useCoach();
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<AnyEntry | null>(null);
  const [useEntry, setUseEntry] = useState<AnyEntry | null>(null);
  const [rename, setRename] = useState<AnyEntry | null>(null);
  const [remove, setRemove] = useState<AnyEntry | null>(null);
  const entries = entriesOf(state.library, kind);
  const filtered = entries.filter((entry) =>
    `${entry.name} ${entry.description}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const copy = KIND_COPY[kind];
  const duplicate = (entry: AnyEntry) => {
    const copyEntry: AnyEntry = {
      ...entry,
      id: makeLibraryId(`library-${kind}`),
      name: `${entry.name} copy`,
      updatedAt: TODAY,
      content: structuredClone(entry.content),
    };
    setState((current) => {
      const library = current.library ?? emptyPlanLibrary();
      return {
        ...current,
        library: {
          ...library,
          [kind]: [...library[kind], copyEntry as never],
        },
      };
    });
    toast("Independent copy created");
  };
  return (
    <>
      <div className="cd-library-panel-head">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
      </div>
      <div className="cd-library-toolbar">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder={`Search ${KIND_LABEL[kind].toLowerCase()} templates`}
        />
        <span>
          {search
            ? `${filtered.length} of ${entries.length} templates`
            : `${entries.length} saved ${entries.length === 1 ? "template" : "templates"}`}
        </span>
      </div>
      {filtered.length === 0 ? (
        <Surface>
          <Empty
            title={
              search
                ? "No matching templates"
                : `No ${KIND_LABEL[kind].toLowerCase()} templates yet`
            }
            action={
              <Button
                primary
                onClick={
                  search
                    ? () => setSearch("")
                    : () => navigate({ section: "clients" })
                }
              >
                {search ? "Clear search" : "Open clients"}
              </Button>
            }
          >
            {search
              ? "Try another name or description."
              : `Save a ${KIND_LABEL[kind].toLowerCase()} plan as a template from a client's plan editor, and it will appear here.`}
          </Empty>
        </Surface>
      ) : (
        <div className="cd-library-list">
          {filtered.map((entry) => (
            <article className="cd-template-card" key={entry.id}>
              <header className="cd-template-card-head">
                <h2>{entry.name}</h2>
              </header>
              <p className="cd-template-desc">
                {entry.description || "Reusable template."}
              </p>
              <div className="cd-template-tags">
                <span>{KIND_LABEL[kind]}</span>
              </div>
              <div className="cd-template-meta">
                <span>{statsFor(kind, entry)}</span>
                <span>Edited {formatDate(entry.updatedAt)}</span>
              </div>
              <footer className="cd-template-actions">
                <Button primary onClick={() => setUseEntry(entry)}>
                  <Users size={14} />
                  Use for client
                </Button>
                <Button onClick={() => setPreview(entry)}>
                  <Eye size={14} />
                  Preview
                </Button>
                <Button onClick={() => onEdit(entry)}>
                  <Pencil size={14} />
                  Edit content
                </Button>
                <Button onClick={() => setRename(entry)}>Rename</Button>
                <Button onClick={() => duplicate(entry)}>
                  <Copy size={14} />
                  Duplicate
                </Button>
                <Button variant="ghost" onClick={() => setRemove(entry)}>
                  <Trash2 size={14} />
                  Delete
                </Button>
              </footer>
            </article>
          ))}
        </div>
      )}
      {preview && (
        <TemplatePreviewDialog
          kind={kind}
          entry={preview}
          onClose={() => setPreview(null)}
        />
      )}
      {useEntry && (
        <UseForClientDialog
          kind={kind}
          entry={useEntry}
          onClose={() => setUseEntry(null)}
        />
      )}
      {rename && (
        <RenameEntryDialog
          kind={kind}
          entry={rename}
          onClose={() => setRename(null)}
        />
      )}
      {remove && (
        <DeleteEntryDialog
          kind={kind}
          entry={remove}
          onClose={() => setRemove(null)}
        />
      )}
    </>
  );
}

export function TemplatesPage() {
  const [tab, setTab] = useState<"clients" | LibraryKind>("clients");
  const [editing, setEditing] = useState<{
    kind: LibraryKind;
    entry: AnyEntry;
  } | null>(null);
  if (editing)
    return (
      <TemplateEntryPage
        kind={editing.kind}
        entry={editing.entry}
        onClose={() => setEditing(null)}
      />
    );
  return (
    <>
      <PageTitle
        title="Templates"
        description="Saved starting points for every athlete: client setups and reusable plans."
      />
      <Tabs
        className="cd-library-tabs"
        label="Template libraries"
        value={tab}
        onValueChange={(value) => setTab(value as "clients" | LibraryKind)}
        items={[
          {
            value: "clients",
            label: "Client setups",
            content: <TemplateLibrary embedded />,
          },
          {
            value: "training",
            label: "Training",
            content: (
              <LibraryPanel
                kind="training"
                onEdit={(entry) => setEditing({ kind: "training", entry })}
              />
            ),
          },
          {
            value: "nutrition",
            label: "Nutrition",
            content: (
              <LibraryPanel
                kind="nutrition"
                onEdit={(entry) => setEditing({ kind: "nutrition", entry })}
              />
            ),
          },
          {
            value: "supplements",
            label: "Supplements",
            content: (
              <LibraryPanel
                kind="supplements"
                onEdit={(entry) => setEditing({ kind: "supplements", entry })}
              />
            ),
          },
        ]}
      />
    </>
  );
}
