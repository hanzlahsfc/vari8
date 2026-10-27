"use client";
import { Archive, ArrowLeft, Eye, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input as Vari8Input } from "@/components/canvas/vari8/components";
import { EditorHeader, FormGrid } from "@/components/canvas/vari8/layouts";
import foodData from "@/lib/canvas/data/food-database.json";
import type { MealPlan } from "../../ethereal/mealplan/model";
import {
  calculateVariantNutrients,
  type Food,
} from "../../ethereal/mealplan/model";
import { type CoachClient, type CoachState, type Route, TODAY } from "../model";
import { useCoach } from "../store";
import { SupplementEditor } from "../supplements/editor";
import { ActivityTargetEditor } from "../targets/editor";
import { templateSetup } from "../template-setup";
import {
  Button,
  DateField,
  Dialog,
  Empty,
  IconButton,
  PageTitle,
  Status,
  Surface,
} from "../ui";
import {
  activateLifecycle,
  applicablePlan,
  archiveLifecycle,
  emptyIifymPlan,
  emptyMealPlan,
  emptyTrainingPlan,
  lifecycleStatus,
  scheduledOption,
  trainingWeek,
  validateIndividualPlan,
} from "./domain";
import {
  CoachPlanDatePicker,
  IifymEditor,
  IifymPlanPreview,
  NutritionEditor,
  NutritionPlanPreview,
} from "./nutrition/editor";
import {
  ClientGoalsEditor,
  ClientHabitsEditor,
  ClientPlansSummary,
} from "./setup-ui";
import { TemporaryPlanEditor } from "./temporary-editor";
import { TrainingEditor, TrainingPrescription } from "./training/editor";
import {
  emptyClientPlans,
  type IifymPlan,
  type ModuleKind,
  type PlanLifecycle,
  type TrainingPlan,
} from "./types";
import "./workspace.css";

type Content = MealPlan | IifymPlan | TrainingPlan;
const planFoodMap = new Map(
  (foodData as { foods: Food[] }).foods.map((food) => [food.id, food]),
);
const historyNumber = (value: number) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
const targetSummary = (
  target: IifymPlan["options"][number]["targets"]["protein"],
) => {
  if (!target) return "—";
  if (target.kind === "range")
    return `${historyNumber(target.min)}–${historyNumber(target.max)}`;
  return `${target.kind === "minimum" ? "≥" : ""}${historyNumber(target.value)}`;
};
function historyVariantSummary(kind: ModuleKind, content: Content) {
  if (kind === "mealPlan") {
    return (content as MealPlan).variants.map((variant) => {
      const totals = calculateVariantNutrients(variant, planFoodMap);
      return {
        id: variant.id,
        label: variant.label || "Untitled day",
        calories: `${historyNumber(totals.calories)} kcal`,
        macros: `P ${historyNumber(totals.protein)} · C ${historyNumber(totals.carbs)} · F ${historyNumber(totals.fat)} g`,
      };
    });
  }
  if (kind === "iifym") {
    return (content as IifymPlan).options.map((option) => {
      const calories = option.targets.calories;
      const energyTargets = [
        { target: option.targets.protein, factor: 4 },
        { target: option.targets.carbs, factor: 4 },
        { target: option.targets.fat, factor: 9 },
      ];
      const energy = (bound: "min" | "max") =>
        energyTargets.reduce(
          (total, { target, factor }) =>
            total +
            factor *
              (!target
                ? 0
                : target.kind === "range"
                  ? target[bound]
                  : target.value),
          0,
        );
      const minimumEnergy = energyTargets.some(
        ({ target }) => target?.kind === "minimum",
      );
      const rangeEnergy = energyTargets.some(
        ({ target }) => target?.kind === "range",
      );
      const hasMacroTarget = Boolean(
        option.targets.protein || option.targets.carbs || option.targets.fat,
      );
      return {
        id: option.id,
        label: option.label || "Untitled day",
        calories: calories
          ? `${targetSummary(calories)} kcal`
          : hasMacroTarget
            ? `${minimumEnergy ? "≥" : ""}${historyNumber(energy("min"))}${rangeEnergy && !minimumEnergy ? `–${historyNumber(energy("max"))}` : ""} kcal`
            : "Calories not prescribed",
        macros: hasMacroTarget
          ? `P ${targetSummary(option.targets.protein)} · C ${targetSummary(option.targets.carbs)} · F ${targetSummary(option.targets.fat)} g`
          : "Macros not prescribed",
      };
    });
  }
  return [];
}
function lifeFor(
  client: CoachClient,
  kind: ModuleKind,
): PlanLifecycle<Content> {
  const p = client.plans ?? emptyClientPlans();
  return kind === "training" ? p.training : p.nutrition[kind];
}
function updateLife(
  state: CoachState,
  clientId: string,
  kind: ModuleKind,
  update: (life: PlanLifecycle<Content>) => PlanLifecycle<Content>,
): CoachState {
  return {
    ...state,
    clients: state.clients.map((c) => {
      if (c.id !== clientId) return c;
      const plans = structuredClone(c.plans ?? emptyClientPlans());
      if (kind === "training")
        plans.training = update(plans.training) as PlanLifecycle<TrainingPlan>;
      else if (kind === "mealPlan")
        plans.nutrition.mealPlan = update(
          plans.nutrition.mealPlan,
        ) as PlanLifecycle<MealPlan>;
      else
        plans.nutrition.iifym = update(
          plans.nutrition.iifym,
        ) as PlanLifecycle<IifymPlan>;
      return { ...c, plans };
    }),
  };
}
export function IndividualPlanWorkspace({ client }: { client: CoachClient }) {
  const { route, navigate } = useCoach();
  const setup = client.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  const back = () =>
    navigate(
      route.review
        ? { section: "check-ins", review: route.review }
        : { section: "clients", client: client.id, tab: "Plans" },
    );
  // Full-page temporary plan editor: `temporary:new`,
  // `temporary:new@YYYY-MM-DD` (prefilled start) or `temporary:<id>`.
  if (route.plan?.startsWith("temporary:")) {
    const spec = route.plan.slice("temporary:".length);
    const at = spec.indexOf("@");
    const id = at === -1 ? spec : spec.slice(0, at);
    const start = at === -1 ? undefined : spec.slice(at + 1);
    return (
      <TemporaryPlanEditor
        client={client}
        existingId={id === "new" ? undefined : id}
        initialStartDate={start}
      />
    );
  }
  if (!setup)
    return (
      <>
        <PageTitle title={client.name} back={back} />
        <Empty
          title="Assign a template first"
          action={
            <Button
              primary
              onClick={() =>
                navigate({
                  ...route,
                  plan: undefined,
                  section: "clients",
                  client: client.id,
                })
              }
            >
              Open client setup
            </Button>
          }
        >
          Choose a saved configuration from the client profile before
          personalizing their tool.
        </Empty>
      </>
    );
  const plan = route.plan;
  if (plan === "setup")
    return (
      <>
        <PageTitle
          title={`${client.name} · Client setup`}
          description="Work in any order. Each plan can be activated independently."
          back={back}
        />
        <ClientPlansSummary client={client} expanded />
        <Surface className="cp-schedule-link">
          <div>
            <h3>Check-in schedule</h3>
            <p>
              Recurring days and additional dates use the existing client
              calendar.
            </p>
          </div>
          <Button
            onClick={() =>
              navigate({
                ...route,
                section: "clients",
                plan: undefined,
                client: client.id,
                tab: "Check-ins",
              })
            }
          >
            Open schedule
          </Button>
        </Surface>
      </>
    );
  if (plan === "activity-targets")
    return (
      <>
        <PageTitle
          title={`${client.name} · Activity targets`}
          description="Steps and weekly cardio prescriptions, separate from general goals."
          back={back}
        />
        <ActivityTargetEditor key={client.id} client={client} />
      </>
    );
  if (plan === "supplements")
    return (
      <>
        <PageTitle
          title={`${client.name} · Supplements`}
          description="Catalogue products, prescribed quantities, timing and status."
          back={back}
        />
        <SupplementEditor key={client.id} client={client} />
      </>
    );
  if (plan === "goals" || plan === "habits")
    return (
      <>
        <PageTitle
          title={`${client.name} · ${plan === "goals" ? "Goals" : "Habits"}`}
          back={back}
        />
        {plan === "habits" && !setup.habits ? (
          <Empty title="Habit Tracker is not enabled">
            Definitions are retained and become available when the feature is
            enabled again.
          </Empty>
        ) : (
          <Surface>
            {plan === "goals" ? (
              <ClientGoalsEditor client={client} />
            ) : (
              <ClientHabitsEditor client={client} />
            )}
          </Surface>
        )}
      </>
    );
  if (plan !== "nutrition" && plan !== "training")
    return (
      <Empty
        title="This setup page is unavailable"
        action={<Button onClick={back}>Back to {client.name}</Button>}
      />
    );
  if (
    !setup.views.includes(
      plan === "nutrition" ? "Nutrition" : "Training Program",
    )
  )
    return (
      <Empty
        title={`${plan === "nutrition" ? "Nutrition" : "Training"} is hidden in this setup`}
        action={<Button onClick={back}>Back to {client.name}</Button>}
      >
        Saved plans and their history are retained. Re-enable this module in the
        assigned configuration to continue.
      </Empty>
    );
  const kind: ModuleKind =
    plan === "training"
      ? "training"
      : setup.nutrition === "IIFYM"
        ? "iifym"
        : "mealPlan";
  return (
    <PlanEditor
      key={`${client.id}-${kind}`}
      client={client}
      kind={kind}
      back={back}
    />
  );
}
function PlanEditor({
  client,
  kind,
  back,
}: {
  client: CoachClient;
  kind: ModuleKind;
  back: () => void;
}) {
  const { setState, route, navigate, storageOk, guard, toast } = useCoach();
  const life = lifeFor(client, kind);
  const setup = templateSetup(
    client.assignment?.snapshot ?? {
      id: "",
      name: "",
      description: "",
      updated: TODAY,
      defaultVariant: "",
      variants: [],
    },
    client.assignment?.variantId,
  );
  const initial =
    life.draft ??
    life.active?.content ??
    (kind === "training"
      ? emptyTrainingPlan(client.id, TODAY)
      : kind === "iifym"
        ? emptyIifymPlan(client.id, TODAY)
        : emptyMealPlan(client.id, TODAY));
  const [value, setValue] = useState<Content>(() => structuredClone(initial));
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [preview, setPreview] = useState(false);
  const [history, setHistory] = useState(false);
  const [draftWeek, setDraftWeek] = useState(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [leaving, setLeaving] = useState<Route | null>(null);
  const [saveState, setSaveState] = useState("");
  const dirty = JSON.stringify(value) !== saved;
  const activationUnchanged =
    JSON.stringify(value) === JSON.stringify(life.active?.content);
  const draftRef = useRef({ value, dirty });
  draftRef.current = { value, dirty };
  const save = () => {
    setState((s) =>
      updateLife(s, client.id, kind, (l) => ({
        ...l,
        draft: structuredClone(value),
      })),
    );
    setSaved(JSON.stringify(value));
    setSaveState(
      storageOk ? "Draft saved in this browser" : "Draft kept for this session",
    );
  };
  useEffect(() => {
    guard.current = (next) => {
      if (!draftRef.current.dirty) return true;
      setLeaving(next);
      return false;
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (draftRef.current.dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      guard.current = null;
      window.removeEventListener("beforeunload", unload);
    };
  }, [guard]);
  // Back/Forward stays resumable without changing active client content.
  useEffect(
    () => () => {
      if (draftRef.current.dirty)
        setState((s) =>
          updateLife(s, client.id, kind, (l) => ({
            ...l,
            draft: structuredClone(draftRef.current.value),
          })),
        );
    },
    [client.id, kind, setState],
  );
  const activate = () => {
    const issues = validateIndividualPlan(kind, value);
    setErrors(issues);
    if (issues.length) return;
    const now = new Date().toISOString();
    setState((s) => {
      const next = updateLife(s, client.id, kind, (l) =>
        activateLifecycle(l, value, now),
      );
      const nextClient = next.clients.find((c) => c.id === client.id);
      const version = nextClient ? lifeFor(nextClient, kind).active : undefined;
      if (!version) return next;
      if (
        !route.review ||
        !s.submissions.some(
          (sub) =>
            sub.id === route.review &&
            sub.clientId === client.id &&
            !sub.response,
        )
      )
        return next;
      const old = s.reviewDrafts[route.review] ?? { text: "", changes: [] };
      return {
        ...next,
        reviewDrafts: {
          ...next.reviewDrafts,
          [route.review]: {
            ...old,
            activations: [
              ...(old.activations ?? []).filter(
                (a) =>
                  a.kind !== (kind === "training" ? "training" : "nutrition"),
              ),
              {
                kind: kind === "training" ? "training" : "nutrition",
                versionId: version.id,
                name: value.name,
                startDate: value.startDate,
              },
            ],
          },
        },
      };
    });
    setSaved(JSON.stringify(value));
    setPreview(false);
    setSaveState("Plan activated locally");
    toast(
      "Active client prescription updated. Check-in feedback remains unsent.",
    );
  };
  const reviewActivation = () => {
    setErrors(validateIndividualPlan(kind, value));
    setPreview(true);
  };
  return (
    <div className="cp-workspace">
      <EditorHeader
        onBack={back}
        backLabel={route.review ? "Back to check-in" : `Back to ${client.name}`}
        context={`${client.name} · ${client.phase}`}
        title={
          kind === "training"
            ? "Training program"
            : kind === "iifym"
              ? "Nutrition targets"
              : "Meal plan"
        }
        status={<Status text={lifecycleStatus(life)} />}
        actions={
          <>
            <Button onClick={() => setHistory(true)}>
              History ({life.history.length})
            </Button>
            <Button onClick={() => setPreview(true)}>
              <Eye size={16} />
              Preview draft
            </Button>
            <Button onClick={save}>
              <Save size={16} />
              Save draft
            </Button>
            <Button
              primary
              disabled={activationUnchanged}
              onClick={reviewActivation}
            >
              Review & activate
            </Button>
          </>
        }
      />
      <div className="cp-save-state" role="status">
        {!storageOk
          ? "Session-only · browser storage is unavailable or protected"
          : dirty
            ? "Unsaved draft changes"
            : saveState ||
              "Saved draft and active client content are separate."}
      </div>
      <FormGrid columns={2} className="cp-plan-meta">
        <Vari8Input
          label="Plan name"
          value={value.name}
          onChange={(e) => setValue({ ...value, name: e.target.value })}
          size="md"
        />
        <CoachPlanDatePicker
          value={value.startDate}
          label="Starts"
          onChange={(startDate) => setValue({ ...value, startDate })}
        />
        {life.active && (
          <p className="cp-plan-meta-status">
            Active: {life.active.content.name} · Starts{" "}
            {life.active.content.startDate}
          </p>
        )}
      </FormGrid>
      {errors.length > 0 && (
        <div className="cp-errors" role="alert">
          <strong>Before activation</strong>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {kind === "training" ? (
        <TrainingEditor
          value={value as TrainingPlan}
          onChange={setValue}
          onWeekChange={setDraftWeek}
          configuration={setup}
        />
      ) : kind === "iifym" ? (
        <IifymEditor value={value as IifymPlan} onChange={setValue} />
      ) : (
        <NutritionEditor value={value as MealPlan} onChange={setValue} />
      )}
      <footer className="cp-footer">
        <p>
          {life.active
            ? "Edits stay in the draft until you activate again."
            : "Save partial work now, or review and activate when ready."}
        </p>
        <div className="cd-actions cd-wrap">
          <IconButton
            className="cp-mobile-back"
            label={`Back to ${client.name}`}
            size="sm"
            onClick={back}
          >
            <ArrowLeft size={17} />
          </IconButton>
          <Button onClick={save}>Save draft</Button>
          <Button
            primary
            disabled={activationUnchanged}
            onClick={() => {
              reviewActivation();
            }}
          >
            Review & activate
          </Button>
        </div>
      </footer>
      {preview && (
        <Dialog
          full
          title={`Draft preview · ${client.name}`}
          onClose={() => setPreview(false)}
        >
          <p className="cp-preview-label">
            Draft · {value.name} · Starts {value.startDate}. Active content is
            unchanged until activation.
          </p>
          <div className="cd-dialog-actions cp-preview-primary-action">
            <Button primary disabled={activationUnchanged} onClick={activate}>
              Activate plan
            </Button>
          </div>
          {kind === "training" ? (
            <TrainingPrescription
              value={value as TrainingPlan}
              week={draftWeek}
              configuration={setup}
            />
          ) : kind === "iifym" ? (
            <IifymPlanPreview
              value={value as IifymPlan}
              allOptions
              optionId={scheduledOption(
                (value as IifymPlan).schedule,
                (value as IifymPlan).options.map((o) => o.id),
                value.startDate,
              )}
            />
          ) : (
            <NutritionPlanPreview
              value={value as MealPlan}
              clientName={client.name}
              allOptions
            />
          )}{" "}
          {errors.length > 0 && (
            <div role="alert" className="cp-errors">
              {errors.join(" ")}
            </div>
          )}
          <div className="cd-dialog-actions">
            <Button onClick={() => setPreview(false)}>Continue editing</Button>
            <Button primary disabled={activationUnchanged} onClick={activate}>
              Activate plan
            </Button>
          </div>
        </Dialog>
      )}
      {history && (
        <Dialog
          full
          title="Activated plan history"
          onClose={() => setHistory(false)}
        >
          <p>
            Versions are created on activation. Draft saves do not create
            history.
          </p>
          {[
            ...(life.active ? [life.active] : []),
            ...life.history.toReversed(),
          ].map((v) => (
            <Surface key={v.id}>
              <h3>{v.content.name}</h3>
              <p>
                Starts {v.content.startDate} ·{" "}
                {v.archivedOn
                  ? `Archived ${v.archivedOn}`
                  : `Activated ${v.activatedAt.slice(0, 10)}`}
              </p>
              {historyVariantSummary(kind, v.content).length > 0 && (
                <div className="cp-history-days">
                  {historyVariantSummary(kind, v.content).map((day) => (
                    <div className="cp-history-day" key={day.id}>
                      <strong>{day.label}</strong>
                      <span>{day.calories}</span>
                      <small>{day.macros}</small>
                    </div>
                  ))}
                </div>
              )}
              <details>
                <summary>View retained prescription</summary>
                {kind === "training" ? (
                  <TrainingPrescription
                    value={v.content as TrainingPlan}
                    configuration={setup}
                  />
                ) : kind === "iifym" ? (
                  <IifymPlanPreview value={v.content as IifymPlan} allOptions />
                ) : (
                  <NutritionPlanPreview
                    value={v.content as MealPlan}
                    clientName={client.name}
                    allOptions
                  />
                )}
              </details>
            </Surface>
          ))}
          {!life.active && !life.history.length && (
            <Empty title="No activated versions yet" />
          )}
          <div className="cd-dialog-actions">
            <Button
              onClick={() => {
                setState((s) =>
                  updateLife(s, client.id, kind, (l) => ({
                    ...l,
                    draft: undefined,
                  })),
                );
                setHistory(false);
                setValue(
                  structuredClone(
                    life.active?.content ??
                      (kind === "training"
                        ? emptyTrainingPlan(client.id, TODAY)
                        : kind === "iifym"
                          ? emptyIifymPlan(client.id, TODAY)
                          : emptyMealPlan(client.id, TODAY)),
                  ),
                );
                const reset =
                  life.active?.content ??
                  (kind === "training"
                    ? emptyTrainingPlan(client.id, TODAY)
                    : kind === "iifym"
                      ? emptyIifymPlan(client.id, TODAY)
                      : emptyMealPlan(client.id, TODAY));
                setValue(structuredClone(reset));
                setSaved(JSON.stringify(reset));
                draftRef.current = { value: reset, dirty: false };
                toast("Draft removed. Active client content is unchanged.");
              }}
            >
              Discard saved draft
            </Button>
            {life.active && (
              <Button
                onClick={() => {
                  setState((s) =>
                    updateLife(s, client.id, kind, (l) =>
                      archiveLifecycle(l, TODAY),
                    ),
                  );
                  setHistory(false);
                  toast(
                    "Active plan archived. Earlier prescriptions retained.",
                  );
                }}
              >
                <Archive size={16} />
                Archive active plan
              </Button>
            )}
            <Button
              onClick={() => {
                const replacement =
                  kind === "training"
                    ? emptyTrainingPlan(client.id, TODAY)
                    : kind === "iifym"
                      ? emptyIifymPlan(client.id, TODAY)
                      : emptyMealPlan(client.id, TODAY);
                if (kind === "mealPlan")
                  (replacement as MealPlan).reusableMeals = structuredClone(
                    (value as MealPlan).reusableMeals,
                  );
                setValue(replacement);
                setHistory(false);
              }}
            >
              Create replacement
            </Button>
          </div>
        </Dialog>
      )}
      {leaving && (
        <Dialog
          title="Save this draft before leaving?"
          onClose={() => setLeaving(null)}
        >
          <p>Active client content is unchanged.</p>
          <div className="cd-dialog-actions">
            <Button onClick={() => setLeaving(null)}>Keep editing</Button>
            <Button
              onClick={() => {
                draftRef.current.dirty = false;
                guard.current = null;
                navigate(leaving);
              }}
            >
              Discard changes
            </Button>
            <Button
              primary
              onClick={() => {
                save();
                draftRef.current.dirty = false;
                guard.current = null;
                navigate(leaving);
              }}
            >
              Save & leave
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
export function ActiveClientNutrition({
  client,
  date = TODAY,
  onDateChange,
  override,
}: {
  client: CoachClient;
  date?: string;
  /** When set, the picker becomes controlled by the parent. */
  onDateChange?: (date: string) => void;
  /** Temporary plan (or a specific option) applied instead of the schedule. */
  override?: { plan?: MealPlan | IifymPlan; optionId?: string };
}) {
  const [internalDate, setInternalDate] = useState(date);
  const selectedDate = onDateChange ? date : internalDate;
  const setDate = onDateChange ?? setInternalDate;
  const setup = client.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  const p = client.plans;
  const control = (
    <div className="cp-date-preview">
      <DateField
        label="Nutrition prescription date"
        value={selectedDate}
        onChange={setDate}
      />
    </div>
  );
  if (!setup || !p)
    return (
      <>
        {control}
        <Empty title="Nutrition plan not set" />
      </>
    );
  if (setup.nutrition === "IIFYM") {
    const plan =
      (override?.plan as IifymPlan | undefined) ??
      applicablePlan(p.nutrition.iifym, selectedDate);
    const option = plan
      ? override?.optionId &&
        plan.options.some((o) => o.id === override.optionId)
        ? override.optionId
        : scheduledOption(
            plan.schedule,
            plan.options.map((o) => o.id),
            selectedDate,
          )
      : undefined;
    return (
      <>
        {control}
        {plan && option ? (
          <>
            <h3>{plan.name}</h3>
            <IifymPlanPreview value={plan} optionId={option} />
          </>
        ) : (
          <Empty title="No nutrition targets for this date" />
        )}
      </>
    );
  }
  const plan =
    (override?.plan as MealPlan | undefined) ??
    applicablePlan(p.nutrition.mealPlan, selectedDate);
  if (!plan)
    return (
      <>
        {control}
        <Empty title="No meal plan for this date" />
      </>
    );
  const option = plan.variants.find(
    (o) =>
      o.id ===
      (override?.optionId &&
      plan.variants.some((v) => v.id === override.optionId)
        ? override.optionId
        : scheduledOption(
            plan.schedule,
            plan.variants.map((v) => v.id),
            selectedDate,
          )),
  );
  return (
    <>
      {control}
      {option ? (
        <>
          <h3>{plan.name}</h3>
          <p>Starts {plan.startDate}</p>
          <NutritionPlanPreview
            value={plan}
            variantId={option.id}
            clientName={client.name}
          />
        </>
      ) : (
        <Empty title="No nutrition option for this date" />
      )}
    </>
  );
}
export function ActiveClientTraining({
  client,
  date = TODAY,
}: {
  client: CoachClient;
  date?: string;
}) {
  const [selectedDate, setDate] = useState(date);
  const plan = client.plans
    ? applicablePlan(client.plans.training, selectedDate)
    : undefined;
  const setup = client.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  return (
    <>
      <div className="cp-date-preview">
        <DateField
          label="Training prescription date"
          value={selectedDate}
          onChange={setDate}
        />
      </div>
      {plan && setup ? (
        <TrainingPrescription
          value={plan}
          week={trainingWeek(plan, selectedDate)}
          configuration={setup}
        />
      ) : (
        <Empty title="No training program for this date" />
      )}
    </>
  );
}
