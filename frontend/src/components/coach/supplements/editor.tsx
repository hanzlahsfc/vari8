"use client";

import {
  ArrowDown,
  ArrowUp,
  Eye,
  Plus,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Input as SharedInput,
  Select as SharedSelect,
} from "@/components/vari8/components";
import { SearchableSelect } from "@/components/vari8/inputs";
import { SaveAsTemplateDialog } from "../library-ui";
import { type CoachClient, type Route, uid } from "../model";
import { emptyClientPlans } from "../plans/types";
import { useCoach } from "../store";
import { Button, Dialog, IconButton, Surface } from "../ui";
import {
  productById,
  productOptionLabel,
  productsForBrand,
  supplementBrands,
} from "./catalogue";
import {
  blankDraft,
  draftOf,
  type ItemDraft,
  positiveNumber,
  rowErrors,
  savedItem,
} from "./draft";
import { groupByTiming, timingKey } from "./group-by-timing";
import {
  dosageForQuantity,
  SUPPLEMENT_STATUSES,
  type SupplementItem,
  type SupplementPlan,
} from "./model";
import { SupplementPlanView } from "./plan-view";
import { ProductPageLink } from "./product-page-link";
import "./supplements.css";

const formatAmount = (amount: number) =>
  Number(amount.toFixed(2)).toLocaleString("en-US");

const TIMING_PRESETS = [
  "On waking",
  "With breakfast",
  "Pre-workout",
  "Intra-workout",
  "Post-workout",
  "With lunch",
  "With dinner",
  "Before bed",
];

function SupplementRow({
  draft,
  index,
  canMoveUp,
  canMoveDown,
  timingOptionsId,
  showErrors,
  update,
  commitTiming,
  move,
  remove,
}: {
  draft: ItemDraft;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  timingOptionsId: string;
  showErrors: boolean;
  update: (patch: Partial<ItemDraft>) => void;
  commitTiming: (timing: string, keepFocus?: boolean) => void;
  move: (dir: -1 | 1) => void;
  remove: () => void;
}) {
  const snapshot =
    draft.product &&
    draft.product.id === draft.productId &&
    draft.product.brand === draft.brand
      ? draft.product
      : null;
  const live = snapshot ? productById(snapshot.id) : undefined;
  // Saved snapshot stays readable even when the live catalogue moved on; its
  // own label is offered for the selected id rather than refreshed metadata.
  const snapshotStale =
    snapshot &&
    (!live ||
      live.name !== snapshot.name ||
      live.declaredAmount !== snapshot.declaredAmount ||
      live.declaredUnit !== snapshot.declaredUnit ||
      live.referenceQuantity !== snapshot.referenceQuantity ||
      live.quantityUnit !== snapshot.quantityUnit);
  const productOptions = draft.brand
    ? productsForBrand(draft.brand).map((p) => ({
        value: p.id,
        label:
          snapshotStale && snapshot && p.id === snapshot.id
            ? snapshot.name
            : productOptionLabel(p),
      }))
    : [];
  if (snapshot && !productOptions.some((o) => o.value === snapshot.id))
    productOptions.push({ value: snapshot.id, label: snapshot.name });
  const errors = showErrors ? rowErrors(draft) : {};
  const qtyId = `supp-qty-${draft.id}`;
  const dosage =
    snapshot && positiveNumber(draft.quantity)
      ? dosageForQuantity(snapshot, Number(draft.quantity))
      : null;
  const dosageText = dosage
    ? formatAmount(dosage.amount)
    : snapshot
      ? "Not provided"
      : "—";
  const unitText = dosage
    ? dosage.unit
    : (snapshot?.declaredUnit ?? snapshot?.quantityUnit ?? "—");
  return (
    <Surface className="supp-row">
      <div className="supp-row-head">
        <strong>Supplement {index + 1}</strong>
        <div className="supp-row-actions">
          <IconButton
            label={`Move supplement ${index + 1} up`}
            size="sm"
            disabled={!canMoveUp}
            onClick={() => move(-1)}
          >
            <ArrowUp size={13} />
          </IconButton>
          <IconButton
            label={`Move supplement ${index + 1} down`}
            size="sm"
            disabled={!canMoveDown}
            onClick={() => move(1)}
          >
            <ArrowDown size={13} />
          </IconButton>
          <IconButton
            label={`Remove supplement ${index + 1}`}
            size="sm"
            onClick={remove}
          >
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>
      <div className="supp-main-row">
        <div className="supp-brand">
          <SearchableSelect
            label="Brand"
            size="sm"
            value={draft.brand}
            options={supplementBrands.map((b) => ({ value: b, label: b }))}
            onValueChange={(brand) => {
              if (brand === draft.brand) return;
              update({
                brand,
                productId: "",
                product: null,
                quantity: "",
                doseUnit: "",
              });
            }}
          />
        </div>
        <div className="supp-product">
          <SearchableSelect
            label="Product"
            size="sm"
            value={draft.productId}
            disabled={!draft.brand}
            error={errors.product}
            options={productOptions}
            onValueChange={(productId) => {
              if (productId === draft.productId) return;
              const chosen =
                productById(productId) ??
                (draft.product?.id === productId ? draft.product : undefined);
              if (!chosen) return;
              update({
                productId,
                product: { ...chosen },
                quantity:
                  chosen.referenceQuantity != null
                    ? String(chosen.referenceQuantity)
                    : "",
                doseUnit: chosen.quantityUnit ?? "reference units",
              });
            }}
          />
        </div>
        <div className="supp-qty">
          <SharedInput
            label="Quantity"
            type="number"
            step="any"
            size="sm"
            id={qtyId}
            disabled={!snapshot}
            error={errors.quantity}
            value={draft.quantity}
            onChange={(e) => update({ quantity: e.target.value })}
          />
        </div>
        <div className="supp-dose">
          <div className="v8-field supp-readout">
            <span className="v8-field__label">Dosage</span>
            <output
              className="supp-readout-value"
              htmlFor={qtyId}
              aria-label="Dosage"
            >
              {dosageText}
            </output>
          </div>
        </div>
        <div className="supp-unit">
          <div className="v8-field supp-readout">
            <span className="v8-field__label">Unit</span>
            <output className="supp-readout-value" aria-label="Dosage unit">
              {unitText}
            </output>
          </div>
        </div>
        <div className="supp-link">
          {snapshot ? <ProductPageLink product={snapshot} /> : null}
        </div>
      </div>
      <div className="supp-secondary-row">
        <div className="supp-timing">
          <SharedInput
            label="Timing"
            id={`supp-timing-${draft.id}`}
            size="sm"
            list={timingOptionsId}
            autoComplete="off"
            placeholder="with breakfast, before bed…"
            value={draft.timing}
            onChange={(e) => update({ timing: e.target.value })}
            onBlur={(e) => commitTiming(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTiming(e.currentTarget.value, true);
                e.currentTarget.focus();
              }
            }}
          />
        </div>
        <div className="supp-status">
          <SharedSelect
            label="Status"
            value={draft.status}
            options={SUPPLEMENT_STATUSES}
            onValueChange={(value) => {
              const option = SUPPLEMENT_STATUSES.find((o) => o.value === value);
              if (option) update({ status: option.value });
            }}
            size="sm"
          />
        </div>
        <div className="supp-notes">
          <SharedInput
            label="Notes"
            size="sm"
            value={draft.notes}
            onChange={(e) => update({ notes: e.target.value })}
          />
        </div>
      </div>
    </Surface>
  );
}

/** Imperative handle so a page-level action bar can save the editor's draft. */
export type SupplementEditorHandle = {
  save: () => void;
  reset: () => void;
  dirty: boolean;
};

export function SupplementEditor({
  client,
  plan,
  ref,
  saveLabel = "Save plan",
  onSaved,
  onDirtyChange,
  library = false,
}: {
  /** Client mode: the plan is read from and written back to this client. */
  client?: CoachClient;
  /** Library mode: the plan to edit, supplied by the caller. */
  plan?: SupplementPlan;
  ref?: Ref<SupplementEditorHandle>;
  saveLabel?: string;
  /** Receives the canonical plan after a successful save. */
  onSaved?: (plan: SupplementPlan) => void;
  /** Reports unsaved changes so a page-level bar can enable its save action. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Template editing: no client chrome, no preview, no save-as-template. */
  library?: boolean;
}) {
  const { setState, toast, guard, navigate } = useCoach();
  const saved = client ? client.plans?.supplements : plan;
  const fallbackName = library ? "" : "Supplement plan";
  const [name, setName] = useState(saved?.name ?? fallbackName);
  const [items, setItems] = useState<ItemDraft[]>(
    () => saved?.items.map(draftOf) ?? [],
  );
  /** Timing the card is grouped by; updated on blur/Enter, not per keystroke. */
  const [committedTiming, setCommittedTiming] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      saved?.items.map((item) => [item.id, item.timing]) ?? [],
    ),
  );
  const [focusTimingId, setFocusTimingId] = useState<string | null>(null);
  const timingOptionsId = useId();
  const serialize = (n: string, list: ItemDraft[]) =>
    JSON.stringify({ name: n.trim(), items: list });
  const [baseline, setBaseline] = useState(() => serialize(name, items));
  const [showErrors, setShowErrors] = useState(false);
  const [leaving, setLeaving] = useState<Route | null>(null);
  const [preview, setPreview] = useState(false);
  const [saveTemplate, setSaveTemplate] = useState(false);

  const dirty = serialize(name, items) !== baseline;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (library) return;
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
  }, [guard, library]);

  const update = (id: string, patch: Partial<ItemDraft>) =>
    setItems((list) =>
      list.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );

  const commitTiming = (id: string, timing: string) =>
    setCommittedTiming((current) =>
      current[id] === timing ? current : { ...current, [id]: timing },
    );

  const addSupplement = (timing = "") => {
    const draft = { ...blankDraft(uid("supp")), timing };
    setItems((list) => [...list, draft]);
    setCommittedTiming((current) => ({ ...current, [draft.id]: timing }));
  };

  const move = (id: string, dir: -1 | 1) =>
    setItems((list) => {
      const current = list.find((it) => it.id === id);
      if (!current) return list;
      const key = timingKey(committedTiming[id] ?? "");
      const groupIds = list
        .filter((it) => timingKey(committedTiming[it.id] ?? "") === key)
        .map((it) => it.id);
      const position = groupIds.indexOf(id);
      const targetId = groupIds[position + dir];
      if (!targetId) return list;
      const from = list.findIndex((it) => it.id === id);
      const to = list.findIndex((it) => it.id === targetId);
      const next = [...list];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });

  const remove = (id: string) => {
    const index = items.findIndex((it) => it.id === id);
    const removed = items[index];
    if (!removed) return;
    setItems((list) => list.filter((it) => it.id !== id));
    setCommittedTiming((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    toast(`${removed.product?.name ?? "Supplement"} removed`, () => {
      setItems((list) => {
        const next = [...list];
        next.splice(Math.min(index, next.length), 0, removed);
        return next;
      });
      setCommittedTiming((current) => ({
        ...current,
        [removed.id]: current[removed.id] ?? removed.timing,
      }));
    });
  };

  const reset = () => {
    const restoredName = saved?.name ?? fallbackName;
    const restoredRows = saved?.items.map(draftOf) ?? [];
    setName(restoredName);
    setItems(restoredRows);
    setCommittedTiming(
      Object.fromEntries(
        (saved?.items ?? []).map((item) => [item.id, item.timing]),
      ),
    );
    setBaseline(serialize(restoredName, restoredRows));
    setShowErrors(false);
  };

  const save = () => {
    const invalid = items.some(
      (it) => Object.values(rowErrors(it)).some(Boolean) || !savedItem(it),
    );
    if (invalid) {
      setShowErrors(true);
      return;
    }
    const built: SupplementPlan = {
      id: saved?.id ?? uid("supplement-plan"),
      clientId: client?.id ?? "",
      name: name.trim() || "Supplement plan",
      savedAt: new Date().toISOString(),
      items: items
        .map(savedItem)
        .filter((item): item is SupplementItem => item !== null),
    };
    if (client)
      setState((current) => ({
        ...current,
        clients: current.clients.map((entry) =>
          entry.id === client.id
            ? {
                ...entry,
                plans: {
                  ...(entry.plans ?? emptyClientPlans()),
                  supplements: built,
                },
              }
            : entry,
        ),
      }));
    const canonicalRows = built.items.map(draftOf);
    setName(built.name);
    setItems(canonicalRows);
    setCommittedTiming(
      Object.fromEntries(canonicalRows.map((row) => [row.id, row.timing])),
    );
    setBaseline(serialize(built.name, canonicalRows));
    setShowErrors(false);
    if (client) toast("Supplement plan saved.");
    else onSaved?.(built);
  };

  useImperativeHandle(ref, () => ({ save, reset, dirty }));

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  useLayoutEffect(() => {
    if (!focusTimingId) return;
    const input = document.getElementById(`supp-timing-${focusTimingId}`);
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    setFocusTimingId(null);
  }, [focusTimingId]);

  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const text of [
      ...items.map((item) => committedTiming[item.id] ?? ""),
      ...TIMING_PRESETS,
    ]) {
      const key = timingKey(text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(text.trim());
    }
    return result;
  }, [items, committedTiming]);

  const groups = useMemo(
    () =>
      groupByTiming(
        items.map((item) => ({
          item,
          timing: committedTiming[item.id] ?? "",
        })),
      ),
    [items, committedTiming],
  );

  return (
    <div className="supp-editor">
      <datalist id={timingOptionsId}>
        {suggestions.map((timing) => (
          <option key={timing} value={timing} />
        ))}
      </datalist>
      {!library && (
        <SharedInput
          label="Plan name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      {groups.map((group) => {
        const groupIds = group.items.map((entry) => entry.item.id);
        return (
          <section className="supp-group" key={group.key || "no-timing"}>
            <header className="supp-group-head">
              <h2>
                {group.label}
                <span>{group.items.length}</span>
              </h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => addSupplement(group.key ? group.label : "")}
              >
                <Plus size={14} />
                Add supplement
              </Button>
            </header>
            <div className="supp-grid">
              {group.items.map(({ item: draft }) => {
                const groupPosition = groupIds.indexOf(draft.id);
                const index = items.findIndex((item) => item.id === draft.id);
                return (
                  <SupplementRow
                    key={draft.id}
                    draft={draft}
                    index={index}
                    canMoveUp={groupPosition > 0}
                    canMoveDown={groupPosition < groupIds.length - 1}
                    timingOptionsId={timingOptionsId}
                    showErrors={showErrors}
                    update={(patch) => update(draft.id, patch)}
                    commitTiming={(timing, keepFocus) => {
                      commitTiming(draft.id, timing);
                      if (keepFocus) setFocusTimingId(draft.id);
                    }}
                    move={(dir) => move(draft.id, dir)}
                    remove={() => remove(draft.id)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
      {!items.length && (
        <Surface>
          <p className="supp-empty">
            No products yet. Add a supplement to start the plan.
          </p>
        </Surface>
      )}
      <div className="supp-actions">
        <Button onClick={() => addSupplement()}>
          <Plus size={14} />
          Add supplement
        </Button>
        <Button primary onClick={save} disabled={!dirty}>
          <Save size={14} />
          {saveLabel}
        </Button>
        {library ? (
          <Button onClick={reset} disabled={!dirty}>
            <Undo2 size={14} />
            Discard
          </Button>
        ) : (
          <Button onClick={reset} disabled={!dirty}>
            <Undo2 size={14} />
            Cancel
          </Button>
        )}
        {!library && (
          <>
            <Button onClick={() => setPreview(true)}>
              <Eye size={14} />
              Preview client plan
            </Button>
            <Button onClick={() => setSaveTemplate(true)} disabled={!saved}>
              Save as template
            </Button>
          </>
        )}
      </div>
      {leaving && (
        <Dialog
          title="Leave with unsaved supplement changes?"
          onClose={() => setLeaving(null)}
        >
          <p>Saved supplement plans are unchanged until you confirm a save.</p>
          <div className="cd-dialog-actions">
            <Button onClick={() => setLeaving(null)}>Keep editing</Button>
            <Button
              onClick={() => {
                reset();
                guard.current = null;
                navigate(leaving);
              }}
            >
              Discard changes
            </Button>
          </div>
        </Dialog>
      )}
      {preview && client && (
        <Dialog title="Client plan preview" onClose={() => setPreview(false)}>
          <p className="supp-meta">
            Shows the saved plan. Unsaved draft changes are not visible to the
            client.
          </p>
          <SupplementPlanView plan={saved} clientName={client.name} />
        </Dialog>
      )}
      {saveTemplate && saved && client && (
        <SaveAsTemplateDialog
          kind="supplements"
          plan={saved}
          clientId={client.id}
          defaultName={saved.name}
          open
          onClose={() => setSaveTemplate(false)}
        />
      )}
    </div>
  );
}
