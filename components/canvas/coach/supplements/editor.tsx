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
import { useEffect, useRef, useState } from "react";
import {
  Input as SharedInput,
  Select as SharedSelect,
} from "@/components/canvas/vari8/components";
import { SearchableSelect } from "@/components/canvas/vari8/inputs";
import { ApiClientError } from "../../data/http";
import {
  fetchSupplementPlan,
  planFromView,
  saveSupplementPlanRemote,
} from "../../data/supplements";
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

const serializeDrafts = (name: string, list: ItemDraft[]) =>
  JSON.stringify({ name: name.trim(), items: list });

function SupplementRow({
  draft,
  index,
  count,
  showErrors,
  update,
  move,
  remove,
}: {
  draft: ItemDraft;
  index: number;
  count: number;
  showErrors: boolean;
  update: (patch: Partial<ItemDraft>) => void;
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
            disabled={index === 0}
            onClick={() => move(-1)}
          >
            <ArrowUp size={13} />
          </IconButton>
          <IconButton
            label={`Move supplement ${index + 1} down`}
            size="sm"
            disabled={index === count - 1}
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
            size="sm"
            placeholder="with breakfast, before bed…"
            value={draft.timing}
            onChange={(e) => update({ timing: e.target.value })}
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

export function SupplementEditor({ client }: { client: CoachClient }) {
  const {
    setState,
    toast,
    guard,
    navigate,
    workspaceId,
    clientProfileIdFor,
  } = useCoach();
  const saved = client.plans?.supplements;
  const [applied, setApplied] = useState(saved);
  const [name, setName] = useState(saved?.name ?? "Supplement plan");
  const [items, setItems] = useState<ItemDraft[]>(
    () => saved?.items.map(draftOf) ?? [],
  );
  const [baseline, setBaseline] = useState(() => serializeDrafts(name, items));
  const [showErrors, setShowErrors] = useState(false);
  const [leaving, setLeaving] = useState<Route | null>(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  // Issue #162 slice: when the canvas is attached to a server workspace the
  // supplement plan persists through the API. `revision` null means the
  // server read failed, so the next save probes revision 0 and can conflict.
  const remote = useRef<{ clientProfileId: string; revision: number | null } | null>(
    null,
  );

  const dirty = serializeDrafts(name, items) !== baseline;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

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

  // Issue #162 slice hydration: a successful server read is authoritative —
  // a plan replaces the local copy, an absent plan clears it. On a failed
  // read the local copy stays visible and saves still attempt the server.
  // Reads happen only here and after a save; nothing autosaves.
  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    void (async () => {
      const clientProfileId = await clientProfileIdFor(client.name);
      if (!live || !clientProfileId) return;
      try {
        const res = await fetchSupplementPlan(workspaceId, clientProfileId);
        if (!live) return;
        remote.current = {
          clientProfileId,
          revision: res.plan?.revision ?? 0,
        };
        const plan = res.plan ? planFromView(res.plan, client.id) : null;
        const drafts = plan?.items.map(draftOf) ?? [];
        const planName = plan?.name ?? "Supplement plan";
        setApplied(plan ?? undefined);
        setName(planName);
        setItems(drafts);
        setBaseline(serializeDrafts(planName, drafts));
      } catch {
        remote.current = { clientProfileId, revision: null };
        toast(
          "Saved supplement plan could not be loaded; showing the local copy.",
        );
      }
    })();
    return () => {
      live = false;
    };
  }, [workspaceId, clientProfileIdFor, client.id, client.name, toast]);

  const update = (id: string, patch: Partial<ItemDraft>) =>
    setItems((list) =>
      list.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );

  const move = (id: string, dir: -1 | 1) =>
    setItems((list) => {
      const index = list.findIndex((it) => it.id === id);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (id: string) => {
    const index = items.findIndex((it) => it.id === id);
    const removed = items[index];
    if (!removed) return;
    setItems((list) => list.filter((it) => it.id !== id));
    toast(`${removed.product?.name ?? "Supplement"} removed`, () =>
      setItems((list) => {
        const next = [...list];
        next.splice(Math.min(index, next.length), 0, removed);
        return next;
      }),
    );
  };

  const reset = () => {
    setName(applied?.name ?? "Supplement plan");
    setItems(applied?.items.map(draftOf) ?? []);
    setShowErrors(false);
  };

  const applyPlan = (plan: SupplementPlan, drafts: ItemDraft[]) => {
    setState((current) => ({
      ...current,
      clients: current.clients.map((entry) =>
        entry.id === client.id
          ? {
              ...entry,
              plans: {
                ...(entry.plans ?? emptyClientPlans()),
                supplements: plan,
              },
            }
          : entry,
      ),
    }));
    setApplied(plan);
    setName(plan.name);
    setItems(drafts);
    setBaseline(serializeDrafts(plan.name, drafts));
    setShowErrors(false);
    toast("Supplement plan saved.");
  };

  const save = async () => {
    const invalid = items.some(
      (it) => Object.values(rowErrors(it)).some(Boolean) || !savedItem(it),
    );
    if (invalid) {
      setShowErrors(true);
      return;
    }
    const savedItems = items
      .map(savedItem)
      .filter((item): item is SupplementItem => item !== null);
    const planName = name.trim() || "Supplement plan";
    const target = remote.current;
    if (workspaceId && target) {
      // Remote path: PUT the full ordered list, then read the canonical
      // view back so the plan id, savedAt and revision come from the row.
      setSaving(true);
      try {
        await saveSupplementPlanRemote(workspaceId, target.clientProfileId, {
          expectedRevision: target.revision ?? 0,
          name: planName,
          items: savedItems,
        });
        const res = await fetchSupplementPlan(
          workspaceId,
          target.clientProfileId,
        );
        remote.current = {
          clientProfileId: target.clientProfileId,
          revision: res.plan?.revision ?? target.revision,
        };
        const plan = res.plan
          ? planFromView(res.plan, client.id)
          : {
              id: saved?.id ?? uid("supplement-plan"),
              clientId: client.id,
              name: planName,
              savedAt: new Date().toISOString(),
              items: savedItems,
            };
        applyPlan(plan, plan.items.map(draftOf));
      } catch (error) {
        setSaving(false);
        toast(
          error instanceof ApiClientError && error.code === "conflict"
            ? "Supplement plan changed elsewhere. Reload before saving."
            : "Supplement plan could not be saved to the server.",
        );
        return;
      }
      setSaving(false);
      return;
    }
    applyPlan(
      {
        id: saved?.id ?? uid("supplement-plan"),
        clientId: client.id,
        name: planName,
        savedAt: new Date().toISOString(),
        items: savedItems,
      },
      items,
    );
  };

  return (
    <div className="supp-editor">
      <SharedInput
        label="Plan name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {items.map((draft, index) => (
        <SupplementRow
          key={draft.id}
          draft={draft}
          index={index}
          count={items.length}
          showErrors={showErrors}
          update={(patch) => update(draft.id, patch)}
          move={(dir) => move(draft.id, dir)}
          remove={() => remove(draft.id)}
        />
      ))}
      {!items.length && (
        <Surface>
          <p className="supp-empty">
            No products yet. Add a supplement to start the plan.
          </p>
        </Surface>
      )}
      <div className="supp-actions">
        <Button
          onClick={() => setItems((list) => [...list, blankDraft(uid("supp"))])}
        >
          <Plus size={14} />
          Add supplement
        </Button>
        <Button primary onClick={() => void save()} disabled={!dirty || saving}>
          <Save size={14} />
          Save plan
        </Button>
        <Button onClick={reset} disabled={!dirty}>
          <Undo2 size={14} />
          Cancel
        </Button>
        <Button onClick={() => setPreview(true)}>
          <Eye size={14} />
          Preview client plan
        </Button>
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
      {preview && (
        <Dialog title="Client plan preview" onClose={() => setPreview(false)}>
          <p className="supp-meta">
            Shows the saved plan. Unsaved draft changes are not visible to the
            client.
          </p>
          <SupplementPlanView plan={applied} clientName={client.name} />
        </Dialog>
      )}
    </div>
  );
}
