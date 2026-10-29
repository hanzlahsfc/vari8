"use client";

import { useEffect, useRef, useState } from "react";
import {
  Input as SharedInput,
  Select as SharedSelect,
} from "@/components/canvas/vari8/components";
import { FormGrid } from "@/components/canvas/vari8/layouts";
import { type CoachClient, type Route, uid } from "../model";
import {
  changeToWrite,
  fetchActivityTargets,
  saveActivityTargetRemote,
  versionsFromWire,
} from "../../data/activity-targets";
import { ApiClientError } from "../../data/http";
import { emptyClientPlans } from "../plans/types";
import { useCoach } from "../store";
import { Button, Dialog, Surface } from "../ui";
import {
  type ActivityChange,
  type ActivityMetric,
  type ActivityTargetVersion,
  formatActivityTarget,
  localToday,
  resolveActivityTarget,
  writeActivityTarget,
} from "./model";
import { useLocalToday } from "./use-local-today";
import "./targets.css";

type StepsKind = "minimum" | "maximum" | "range" | "fixed";
type StepsDraft = {
  kind: StepsKind;
  value: string;
  min: string;
  max: string;
};
type CardioDraft = { sessionsPerWeek: string; minutesPerSession: string };
type FieldErrors = Record<string, string | undefined>;

const METRIC_LABELS: Record<ActivityMetric, string> = {
  steps: "Steps",
  cardio: "Cardio",
};
const STEPS_KINDS: { value: StepsKind; label: string }[] = [
  { value: "minimum", label: "Minimum" },
  { value: "maximum", label: "Maximum" },
  { value: "range", label: "Range" },
  { value: "fixed", label: "Fixed" },
];

const parse = (text: string) =>
  text.trim() === "" ? Number.NaN : Number(text);
const positiveInt = (text: string) =>
  text.trim() !== "" && Number.isInteger(Number(text)) && Number(text) > 0;
const positiveNumber = (text: string) =>
  text.trim() !== "" && Number.isFinite(Number(text)) && Number(text) > 0;

function stepsDraftFor(version: ActivityTargetVersion | undefined): StepsDraft {
  if (version?.metric !== "steps" || !version.target)
    return { kind: "minimum", value: "", min: "", max: "" };
  const target = version.target;
  if (target.kind === "range")
    return {
      kind: "range",
      value: "",
      min: String(target.min),
      max: String(target.max),
    };
  return { kind: target.kind, value: String(target.value), min: "", max: "" };
}

function cardioDraftFor(
  version: ActivityTargetVersion | undefined,
): CardioDraft {
  if (version?.metric !== "cardio" || !version.target)
    return { sessionsPerWeek: "", minutesPerSession: "" };
  const target = version.target;
  return {
    sessionsPerWeek: String(target.sessionsPerWeek),
    minutesPerSession: String(target.minutesPerSession),
  };
}

function stepsFieldErrors(draft: StepsDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (draft.kind === "range") {
    if (draft.min.trim() === "") errors.min = "Enter minimum steps per day.";
    else if (!positiveInt(draft.min))
      errors.min = "Use a positive whole number.";
    if (draft.max.trim() === "") errors.max = "Enter maximum steps per day.";
    else if (!positiveInt(draft.max))
      errors.max = "Use a positive whole number.";
    if (!errors.min && !errors.max && Number(draft.min) > Number(draft.max))
      errors.max = "Minimum cannot exceed the maximum.";
  } else if (draft.value.trim() === "") {
    errors.value = "Enter steps per day.";
  } else if (!positiveInt(draft.value)) {
    errors.value = "Use a positive whole number.";
  }
  return errors;
}

function cardioFieldErrors(draft: CardioDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (draft.sessionsPerWeek.trim() === "")
    errors.sessionsPerWeek = "Enter sessions per week.";
  else if (!positiveInt(draft.sessionsPerWeek))
    errors.sessionsPerWeek = "Use a positive whole number.";
  if (draft.minutesPerSession.trim() === "")
    errors.minutesPerSession = "Enter minutes per session.";
  else if (!positiveNumber(draft.minutesPerSession))
    errors.minutesPerSession = "Use a positive number of minutes.";
  return errors;
}

const stepsChange = (draft: StepsDraft): ActivityChange => ({
  metric: "steps",
  target:
    draft.kind === "range"
      ? { kind: "range", min: parse(draft.min), max: parse(draft.max) }
      : { kind: draft.kind, value: parse(draft.value) },
});
const cardioChange = (draft: CardioDraft): ActivityChange => ({
  metric: "cardio",
  target: {
    sessionsPerWeek: parse(draft.sessionsPerWeek),
    minutesPerSession: parse(draft.minutesPerSession),
  },
});

const previewVersion = (
  change: ActivityChange,
  date: string,
): ActivityTargetVersion =>
  change.metric === "steps"
    ? {
        id: "preview",
        effectiveFrom: date,
        metric: "steps",
        target: change.target,
      }
    : {
        id: "preview",
        effectiveFrom: date,
        metric: "cardio",
        target: change.target,
      };

const hasErrors = (errors: FieldErrors) => Object.values(errors).some(Boolean);

export function ActivityTargetEditor({ client }: { client: CoachClient }) {
  const {
    setState,
    toast,
    guard,
    navigate,
    workspaceId,
    clientProfileIdFor,
  } = useCoach();
  const today = useLocalToday();
  const versions = client.plans?.activityTargets ?? [];
  const [stepsDraft, setStepsDraft] = useState<StepsDraft>(() =>
    stepsDraftFor(
      resolveActivityTarget({ versions, metric: "steps", date: localToday() }),
    ),
  );
  const [cardioDraft, setCardioDraft] = useState<CardioDraft>(() =>
    cardioDraftFor(
      resolveActivityTarget({ versions, metric: "cardio", date: localToday() }),
    ),
  );
  const [baselines, setBaselines] = useState(() => ({
    steps: structuredClone(stepsDraft),
    cardio: structuredClone(cardioDraft),
  }));
  const [touched, setTouched] = useState({ steps: false, cardio: false });
  const [commitErrors, setCommitErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState<{
    change: ActivityChange;
    effectiveFrom: string;
  } | null>(null);
  const [leaving, setLeaving] = useState<Route | null>(null);
  const [saving, setSaving] = useState(false);
  // Issue #169: when the canvas is attached to a server workspace the dated
  // versions persist through the API; remote.current null keeps the local
  // demo path.
  const remote = useRef<{ clientProfileId: string } | null>(null);

  const dirty = (metric: ActivityMetric) =>
    JSON.stringify(metric === "steps" ? stepsDraft : cardioDraft) !==
    JSON.stringify(baselines[metric]);
  const anyDirty = dirty("steps") || dirty("cardio");
  const draftRef = useRef({ anyDirty });
  draftRef.current = { anyDirty };

  const fieldErrors = (metric: ActivityMetric): FieldErrors =>
    touched[metric]
      ? metric === "steps"
        ? stepsFieldErrors(stepsDraft)
        : cardioFieldErrors(cardioDraft)
      : {};

  useEffect(() => {
    guard.current = (next) => {
      if (!draftRef.current.anyDirty) return true;
      setLeaving(next);
      return false;
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (draftRef.current.anyDirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      guard.current = null;
      window.removeEventListener("beforeunload", unload);
    };
  }, [guard]);

  // Issue #169 hydration: a successful server read is authoritative - the
  // fetched versions replace the local copy and re-baseline both drafts.
  // On a failed read the local copy stays visible and saves still attempt
  // the server. Reads happen only here and after a save; nothing autosaves.
  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    void (async () => {
      const clientProfileId = await clientProfileIdFor(client.name);
      if (!live || !clientProfileId) return;
      try {
        const res = await fetchActivityTargets(workspaceId, clientProfileId);
        if (!live) return;
        remote.current = { clientProfileId };
        const next = versionsFromWire(res.versions);
        setState((current) => ({
          ...current,
          clients: current.clients.map((item) =>
            item.id === client.id
              ? {
                  ...item,
                  plans: {
                    ...(item.plans ?? emptyClientPlans()),
                    activityTargets: next,
                  },
                }
              : item,
          ),
        }));
        const date = localToday();
        const freshSteps = stepsDraftFor(
          resolveActivityTarget({ versions: next, metric: "steps", date }),
        );
        const freshCardio = cardioDraftFor(
          resolveActivityTarget({ versions: next, metric: "cardio", date }),
        );
        setStepsDraft(freshSteps);
        setCardioDraft(freshCardio);
        setBaselines({ steps: freshSteps, cardio: freshCardio });
        setTouched({ steps: false, cardio: false });
        setCommitErrors({});
      } catch {
        remote.current = { clientProfileId };
        toast(
          "Saved activity targets could not be loaded; showing the local copy.",
        );
      }
    })();
    return () => {
      live = false;
    };
  }, [workspaceId, clientProfileIdFor, client.id, client.name, setState, toast]);

  const persist = (next: ActivityTargetVersion[], saved: ActivityMetric[]) => {
    setState((current) => ({
      ...current,
      clients: current.clients.map((item) =>
        item.id === client.id
          ? {
              ...item,
              plans: {
                ...(item.plans ?? emptyClientPlans()),
                activityTargets: next,
              },
            }
          : item,
      ),
    }));
    const date = localToday();
    const freshSteps = saved.includes("steps")
      ? stepsDraftFor(
          resolveActivityTarget({ versions: next, metric: "steps", date }),
        )
      : undefined;
    const freshCardio = saved.includes("cardio")
      ? cardioDraftFor(
          resolveActivityTarget({ versions: next, metric: "cardio", date }),
        )
      : undefined;
    if (freshSteps) {
      setStepsDraft(freshSteps);
      setTouched((t) => ({ ...t, steps: false }));
    }
    if (freshCardio) {
      setCardioDraft(freshCardio);
      setTouched((t) => ({ ...t, cardio: false }));
    }
    setBaselines((current) => ({
      steps: freshSteps ?? current.steps,
      cardio: freshCardio ?? current.cardio,
    }));
    setCommitErrors({});
  };

  const write = (change: ActivityChange, options?: { confirmed?: boolean }) => {
    const effectiveFrom = localToday();
    const target = remote.current;
    if (workspaceId && target) {
      // Remote path: PUT one day-effective write, then read the canonical
      // view back so ids and revisions come from the rows. A 409
      // confirmation_required becomes the same-day replace dialog.
      const payload = changeToWrite(change);
      setSaving(true);
      void (async () => {
        try {
          await saveActivityTargetRemote(workspaceId, target.clientProfileId, {
            metric: payload.metric,
            effectiveFrom,
            target: payload.target,
            confirmSameDay: options?.confirmed,
          });
          const res = await fetchActivityTargets(
            workspaceId,
            target.clientProfileId,
          );
          persist(versionsFromWire(res.versions), [change.metric]);
          toast(
            change.target === null
              ? `${METRIC_LABELS[change.metric]} target stopped`
              : `${METRIC_LABELS[change.metric]} target saved`,
          );
        } catch (error) {
          if (
            error instanceof ApiClientError &&
            error.code === "confirmation_required"
          ) {
            setPending({ change, effectiveFrom });
          } else if (
            error instanceof ApiClientError &&
            error.code === "invalid_input"
          ) {
            setCommitErrors({
              [change.metric]: "The server rejected this target.",
            });
          } else {
            toast("Activity target could not be saved to the server.");
          }
        } finally {
          setSaving(false);
        }
      })();
      return false;
    }
    const result = writeActivityTarget({
      versions,
      change,
      effectiveFrom,
      id: uid("target"),
      confirmSameDay: options?.confirmed,
    });
    if (result.kind === "invalid") {
      setCommitErrors({ [change.metric]: result.errors.join(" ") });
      return false;
    }
    if (result.kind === "confirmation-required") {
      setPending({ change, effectiveFrom });
      return false;
    }
    persist(result.versions, [change.metric]);
    toast(
      change.target === null
        ? `${METRIC_LABELS[change.metric]} target stopped`
        : `${METRIC_LABELS[change.metric]} target saved`,
    );
    return true;
  };

  const save = (metric: ActivityMetric) => {
    setTouched((t) => ({ ...t, [metric]: true }));
    const errors =
      metric === "steps"
        ? stepsFieldErrors(stepsDraft)
        : cardioFieldErrors(cardioDraft);
    if (hasErrors(errors)) return;
    write(
      metric === "steps" ? stepsChange(stepsDraft) : cardioChange(cardioDraft),
    );
  };

  const cancel = (metric: ActivityMetric) => {
    if (metric === "steps") setStepsDraft(structuredClone(baselines.steps));
    else setCardioDraft(structuredClone(baselines.cardio));
    setTouched((t) => ({ ...t, [metric]: false }));
    setCommitErrors((e) => ({ ...e, [metric]: undefined }));
  };

  const stop = (metric: ActivityMetric) => write({ metric, target: null });

  const confirmPending = () => {
    const entry = pending;
    if (!entry) return;
    setPending(null);
    // Still the same local day -> confirm the replace; the day rolled over
    // -> the write lands as a normal new version.
    write(entry.change, {
      confirmed: localToday() === entry.effectiveFrom,
    });
  };

  const stepsCurrent = resolveActivityTarget({
    versions,
    metric: "steps",
    date: today,
  });
  const cardioCurrent = resolveActivityTarget({
    versions,
    metric: "cardio",
    date: today,
  });
  const currentLabel = (version: ActivityTargetVersion | undefined) =>
    !version
      ? "No target prescribed"
      : version.target === null
        ? `Stopped · from ${version.effectiveFrom}`
        : formatActivityTarget(version);
  const history = (metric: ActivityMetric) =>
    versions
      .map((version, index) => ({ version, index }))
      .filter((entry) => entry.version.metric === metric)
      .sort(
        (a, b) =>
          b.version.effectiveFrom.localeCompare(a.version.effectiveFrom) ||
          b.index - a.index,
      )
      .map((entry) => entry.version);
  const stepsErrors = fieldErrors("steps");
  const cardioErrors = fieldErrors("cardio");
  const stepsPreview = hasErrors(stepsFieldErrors(stepsDraft))
    ? null
    : formatActivityTarget(previewVersion(stepsChange(stepsDraft), today));
  const cardioPreview = hasErrors(cardioFieldErrors(cardioDraft))
    ? null
    : formatActivityTarget(previewVersion(cardioChange(cardioDraft), today));
  const pendingText = pending
    ? pending.change.target === null
      ? "No target prescribed (stop)"
      : formatActivityTarget(
          previewVersion(pending.change, pending.effectiveFrom),
        )
    : "";

  return (
    <div className="at-editor">
      <p className="at-intro">
        Prescriptions apply from today, {today}, including midweek changes.{" "}
        {workspaceId
          ? "They are stored in the client’s workspace; earlier days keep their earlier prescriptions."
          : "They are stored in this browser’s local demo workspace; earlier days keep their earlier prescriptions."}
      </p>
      <div className="at-panels">
        <Surface className="at-panel">
          <div className="at-panel-head">
            <div>
              <h3>Steps</h3>
              <p>Daily step prescription in steps/day.</p>
            </div>
            <span className="at-current">
              <small>Current</small>
              <strong>{currentLabel(stepsCurrent)}</strong>
            </span>
          </div>
          <SharedSelect
            label="Steps target type"
            value={stepsDraft.kind}
            options={STEPS_KINDS}
            onValueChange={(value) => {
              const option = STEPS_KINDS.find((k) => k.value === value);
              if (option) setStepsDraft((d) => ({ ...d, kind: option.value }));
            }}
            size="md"
          />
          {stepsDraft.kind === "range" ? (
            <FormGrid columns={2}>
              <SharedInput
                label="Minimum steps per day"
                type="number"
                min={1}
                step={1}
                value={stepsDraft.min}
                error={stepsErrors.min}
                onChange={(e) =>
                  setStepsDraft((d) => ({ ...d, min: e.target.value }))
                }
                size="md"
              />
              <SharedInput
                label="Maximum steps per day"
                type="number"
                min={1}
                step={1}
                value={stepsDraft.max}
                error={stepsErrors.max}
                onChange={(e) =>
                  setStepsDraft((d) => ({ ...d, max: e.target.value }))
                }
                size="md"
              />
            </FormGrid>
          ) : (
            <SharedInput
              label="Steps per day"
              type="number"
              min={1}
              step={1}
              value={stepsDraft.value}
              error={stepsErrors.value}
              onChange={(e) =>
                setStepsDraft((d) => ({ ...d, value: e.target.value }))
              }
              size="md"
            />
          )}
          <p className="at-applies">
            Applies from today, {today}.{" "}
            {stepsPreview && <>Preview: {stepsPreview}</>}
          </p>
          {commitErrors.steps && (
            <p className="at-error" role="alert">
              {commitErrors.steps}
            </p>
          )}
          <div className="cd-actions">
            <Button
              primary
              disabled={!dirty("steps") || saving}
              onClick={() => save("steps")}
            >
              Save steps
            </Button>
            <Button disabled={!dirty("steps")} onClick={() => cancel("steps")}>
              Cancel
            </Button>
            {stepsCurrent?.target && (
              <Button onClick={() => stop("steps")}>Stop steps target</Button>
            )}
          </div>
          <TargetHistory metric="steps" versions={history("steps")} />
        </Surface>
        <Surface className="at-panel">
          <div className="at-panel-head">
            <div>
              <h3>Cardio</h3>
              <p>Weekly sessions and minutes per session.</p>
            </div>
            <span className="at-current">
              <small>Current</small>
              <strong>{currentLabel(cardioCurrent)}</strong>
            </span>
          </div>
          <FormGrid columns={2}>
            <SharedInput
              label="Sessions per week"
              type="number"
              min={1}
              step={1}
              value={cardioDraft.sessionsPerWeek}
              error={cardioErrors.sessionsPerWeek}
              onChange={(e) =>
                setCardioDraft((d) => ({
                  ...d,
                  sessionsPerWeek: e.target.value,
                }))
              }
              size="md"
            />
            <SharedInput
              label="Minutes per session"
              type="number"
              step="any"
              value={cardioDraft.minutesPerSession}
              error={cardioErrors.minutesPerSession}
              onChange={(e) =>
                setCardioDraft((d) => ({
                  ...d,
                  minutesPerSession: e.target.value,
                }))
              }
              size="md"
            />
          </FormGrid>
          <p className="at-applies">
            Applies from today, {today}.{" "}
            {cardioPreview && <>Preview: {cardioPreview}</>}
          </p>
          {commitErrors.cardio && (
            <p className="at-error" role="alert">
              {commitErrors.cardio}
            </p>
          )}
          <div className="cd-actions">
            <Button
              primary
              disabled={!dirty("cardio") || saving}
              onClick={() => save("cardio")}
            >
              Save cardio
            </Button>
            <Button
              disabled={!dirty("cardio")}
              onClick={() => cancel("cardio")}
            >
              Cancel
            </Button>
            {cardioCurrent?.target && (
              <Button onClick={() => stop("cardio")}>Stop cardio target</Button>
            )}
          </div>
          <TargetHistory metric="cardio" versions={history("cardio")} />
        </Surface>
      </div>
      {pending && (
        <Dialog
          title={`Replace today's ${METRIC_LABELS[pending.change.metric].toLowerCase()} target?`}
          onClose={() => setPending(null)}
        >
          <p>
            A {METRIC_LABELS[pending.change.metric].toLowerCase()} prescription
            was already saved for {pending.effectiveFrom}. This adds a new
            version effective that day and keeps the earlier entry in history.
          </p>
          <p className="at-confirm-value">{pendingText}</p>
          <div className="cd-dialog-actions">
            <Button onClick={() => setPending(null)}>Cancel</Button>
            <Button primary onClick={confirmPending}>
              Confirm change
            </Button>
          </div>
        </Dialog>
      )}
      {leaving && (
        <Dialog
          title="Leave with unsaved target changes?"
          onClose={() => setLeaving(null)}
        >
          <p>Saved prescriptions are unchanged until you confirm a save.</p>
          <div className="cd-dialog-actions">
            <Button onClick={() => setLeaving(null)}>Keep editing</Button>
            <Button
              onClick={() => {
                setStepsDraft(structuredClone(baselines.steps));
                setCardioDraft(structuredClone(baselines.cardio));
                guard.current = null;
                navigate(leaving);
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

function TargetHistory({
  metric,
  versions,
}: {
  metric: ActivityMetric;
  versions: ActivityTargetVersion[];
}) {
  if (!versions.length) return null;
  return (
    <details className="at-history">
      <summary>
        {METRIC_LABELS[metric]} history ({versions.length})
      </summary>
      <ul>
        {versions.map((version) => (
          <li key={version.id}>
            <strong>
              {version.target === null
                ? "Stopped"
                : formatActivityTarget(version)}
            </strong>
            <small>From {version.effectiveFrom}</small>
          </li>
        ))}
      </ul>
    </details>
  );
}
