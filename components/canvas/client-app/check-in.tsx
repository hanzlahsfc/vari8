"use client";

// Client-side check-in: fills the assigned form variant's questions,
// including per-pose photo uploads for "Visual upload" questions, and
// submits a real Submission into the shared coach state so the coach
// workspace (check-in calendar, physique comparison) sees it.

import { Camera, Check, ChevronDown, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  listOwnCheckInFeedbackAction,
  readOwnCheckInCalendarAction,
} from "@/app/(tracker)/workspace/[workspaceId]/check-ins/actions";
import {
  checkInScheduleLabel,
  checkInScheduleStatus,
  fetchOwnCheckInInstance,
  mediaIdsForPoses,
  type OwnCheckInInstanceDetailWire,
  type OwnCheckInInstanceListItemWire,
  posesForVisualField,
  submitOwnCheckIn,
  submittedAnswerDisplay,
  summaryRowsFromSurface,
} from "../data/checkins";
import { ApiClientError } from "../data/http";
import { fetchMediaDownload } from "../data/media";
import { uploadOwnProgressPhoto } from "../data/progress-photos";
import { fetchDailyEntrySurface } from "../data/tracker";
import { DEFAULT_POSES, questionPoses } from "../coach/check-ins/photos";
import {
  addDays,
  type CoachClient,
  formatDate,
  type Question,
  type Submission,
  uid,
  type Variant,
} from "../coach/model";
import { useCoach } from "../coach/store";
import { useLocalToday } from "../coach/targets/use-local-today";
import { Button, Empty } from "../coach/ui";
import { Checkbox, Input, Select } from "../vari8/components";
import { TextArea } from "../vari8/inputs";

const PHOTO_MAX = 1000;

function downscaleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(
        1,
        PHOTO_MAX / Math.max(image.width, image.height),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas
        .getContext("2d")
        ?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    image.src = url;
  });
}

function nextCheckInEventId(client: CoachClient, from: string): string {
  for (let i = 0; i < 14; i += 1) {
    const date = addDays(from, i);
    const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
    const schedule = [...client.schedules]
      .sort((a, b) => b.effective.localeCompare(a.effective))
      .find((s) => s.effective <= date);
    if (schedule?.weekdays.includes(weekday))
      return `recurring:${client.id}:${date}`;
  }
  return "";
}

function choiceOptions(question: Question) {
  if (question.type === "Choice")
    return question.options
      .split(",")
      .map((option) => option.trim())
      .filter(Boolean);
  if (question.options === "Word labels")
    return ["Low", "Okay", "Good", "Excellent"];
  const count = question.options === "1–5" ? 5 : 10;
  return Array.from({ length: count }, (_, i) => String(i + 1));
}

export type CheckInSummaryRow = { label: string; value: string | null };

/** Display labels for the variant `summaries` keys. */
const SUMMARY_LABELS: Record<string, string> = {
  weight: "Weight",
  calories: "Calories",
  sleep: "Sleep",
  steps: "Steps",
  water: "Water",
  habits: "Habits",
};

export function summaryLabel(key: string): string {
  return SUMMARY_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * The tracker-summary embed: one row per configured metric with the
 * client's own logged value. A metric with nothing logged still renders
 * so the configured set stays visible.
 */
export function CheckInSummary({
  title,
  rows,
}: {
  title: string;
  rows: CheckInSummaryRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="ca-checkin-summary">
      <h3>{title}</h3>
      <dl className="ca-checkin-summary-grid">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd data-missing={row.value === null ? "" : undefined}>
              {row.value ?? "Not logged"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Latest logged value for one configured summary key in the demo model. */
function demoSummaryValue(
  key: string,
  client: CoachClient,
  today: string,
): string | null {
  if (key === "habits") {
    if (client.habits.length === 0) return null;
    const done = client.habitLog?.[today]?.length ?? 0;
    return `${done} of ${client.habits.length} today`;
  }
  const latest = client.entries.at(-1);
  if (!latest) return null;
  if (key === "weight") return `${latest.weight} kg`;
  if (key === "sleep") return `${latest.sleep} h`;
  if (key === "steps") return `${latest.steps.toLocaleString()} steps`;
  if (key === "calories") return `${latest.calories} kcal`;
  return null;
}

export function summaryRows(
  configuration: Variant,
  client: CoachClient,
  today: string,
): CheckInSummaryRow[] {
  return configuration.summaries.map((key) => ({
    label: summaryLabel(key),
    value: demoSummaryValue(key, client, today),
  }));
}

export function CheckInForm({
  configuration,
  client,
  workspaceId,
  clientProfileId,
}: {
  configuration: Variant;
  client: CoachClient;
  workspaceId?: string;
  clientProfileId?: string;
}) {
  // Card 05b: a real workspace binds the form to the own check-in routes;
  // without one the canvas demo keeps the localStorage submissions path.
  if (workspaceId && clientProfileId)
    return (
      <RemoteCheckInForm
        workspaceId={workspaceId}
        clientProfileId={clientProfileId}
      />
    );
  return <LocalCheckInForm configuration={configuration} client={client} />;
}

function LocalCheckInForm({
  configuration,
  client,
}: {
  configuration: Variant;
  client: CoachClient;
}) {
  const { state, setState } = useCoach();
  const today = useLocalToday();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [attempted, setAttempted] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const history = state.submissions
    .filter((s) => s.clientId === client.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const questionPhotos = (q: Question) => photos[q.id] ?? {};
  const questionValid = (q: Question) => {
    if (!q.required) return true;
    if (q.type === "Visual upload")
      return questionPoses(q).every((pose) => questionPhotos(q)[pose]);
    return (answers[q.id] ?? "").trim().length > 0;
  };
  const missing = (q: Question) => attempted && !questionValid(q);
  const valid = configuration.questions.every(questionValid);

  const setPhoto = (q: Question, pose: string, src: string | null) =>
    setPhotos((current) => {
      const next = { ...(current[q.id] ?? {}) };
      if (src) next[pose] = src;
      else delete next[pose];
      return { ...current, [q.id]: next };
    });

  const submit = () => {
    setAttempted(true);
    if (!valid) return;
    const photoList = configuration.questions
      .filter((q) => q.type === "Visual upload")
      .flatMap((q) =>
        questionPoses(q)
          .map((pose) => ({ pose, src: questionPhotos(q)[pose] }))
          .filter((p): p is { pose: string; src: string } => Boolean(p.src)),
      );
    const answersList = configuration.questions
      .map((q) => ({
        question: q.label,
        answer:
          q.type === "Visual upload"
            ? `${photoList.length} photo${photoList.length === 1 ? "" : "s"}`
            : (answers[q.id] ?? "").trim(),
      }))
      .filter((a) => a.answer.length > 0);
    const submission: Submission = {
      id: uid("submission"),
      clientId: client.id,
      date: today,
      eventId: nextCheckInEventId(client, today),
      type: "Full",
      answers: answersList,
      metrics: configuration.summaries,
      visuals: photoList.map(
        (p) =>
          `${p.pose} · ${formatDate(today, { day: "numeric", month: "long" })}`,
      ),
      photos: photoList,
      note: "",
      flags: [],
    };
    setState((s) => ({ ...s, submissions: [...s.submissions, submission] }));
    setSubmitted(true);
  };

  if (submitted)
    return (
      <section className="cd-preview-section" aria-label="Check-in">
        <div className="ca-checkin-done">
          <Check size={20} aria-hidden="true" />
          <div>
            <h2>Check-in sent</h2>
            <p className="cd-muted">
              Your coach will review it and send feedback.
            </p>
          </div>
        </div>
        <CheckInHistory history={history} />
      </section>
    );

  return (
    <section className="cd-preview-section" aria-label="Check-in form">
      <h2>Check-In</h2>
      <p className="cd-muted">
        Answer your coach&apos;s questions for this week.
      </p>
      <div className="ca-checkin-form">
        {configuration.questions.map((q) => (
          <div className="ca-checkin-field" key={q.id}>
            {q.type === "Long text" ? (
              <TextArea
                label={`${q.label}${q.required ? " *" : " · optional"}`}
                rows={3}
                value={answers[q.id] ?? ""}
                error={missing(q) ? "Required" : undefined}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                }
              />
            ) : q.type === "Choice" || q.type === "Rating" ? (
              <Select
                label={`${q.label}${q.required ? " *" : " · optional"}`}
                value={answers[q.id] ?? ""}
                error={missing(q) ? "Required" : undefined}
                options={[
                  { value: "", label: "Choose an answer" },
                  ...choiceOptions(q).map((option) => ({
                    value: option,
                    label: option,
                  })),
                ]}
                onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
              />
            ) : q.type === "Visual upload" ? (
              <div className="ca-photo-question">
                <span className="ca-photo-question-label">
                  {q.label}
                  {q.required ? " *" : " · optional"}
                </span>
                <div className="ca-photo-grid">
                  {questionPoses(q).map((pose) => {
                    const src = questionPhotos(q)[pose];
                    return (
                      <div className="ca-photo-tile" key={pose}>
                        <label className="ca-photo-pick">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            hidden
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (file)
                                setPhoto(q, pose, await downscaleImage(file));
                            }}
                          />
                          {src ? (
                            // biome-ignore lint/performance/noImgElement: demo photo previews are dynamic data srcs
                            <img src={src} alt={pose} />
                          ) : (
                            <span className="ca-photo-empty">
                              <Camera size={20} aria-hidden="true" />
                              <b>{pose}</b>
                            </span>
                          )}
                        </label>
                        {src ? (
                          <button
                            type="button"
                            className="ca-photo-remove"
                            aria-label={`Remove ${pose} photo`}
                            onClick={() => setPhoto(q, pose, null)}
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {missing(q) && (
                  <span className="ca-photo-error">
                    Required - add each pose
                  </span>
                )}
              </div>
            ) : (
              <Input
                label={`${q.label}${q.required ? " *" : " · optional"}`}
                type={q.type === "Numeric" ? "number" : "text"}
                inputMode={q.type === "Numeric" ? "decimal" : undefined}
                value={answers[q.id] ?? ""}
                error={missing(q) ? "Required" : undefined}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                }
              />
            )}
          </div>
        ))}
        {configuration.questions.length === 0 && (
          <Empty title="No check-in questions configured" />
        )}
        {configuration.summaries.length > 0 && (
          <CheckInSummary
            title="This week in your tracker"
            rows={summaryRows(configuration, client, today)}
          />
        )}
        {attempted && !valid && (
          <p className="ca-photo-error">Please answer the required fields.</p>
        )}
        <Button primary className="ca-checkin-submit" onClick={submit}>
          Submit check-in
        </Button>
      </div>
      <CheckInHistory history={history} />
    </section>
  );
}

function CheckInHistory({ history }: { history: Submission[] }) {
  if (!history.length) return null;
  return (
    <div className="ca-checkin-history">
      <h3>Previous check-ins</h3>
      {history.map((s) => (
        <div className="ca-checkin-item" key={s.id}>
          <div className="ca-checkin-item-head">
            <span>
              <b>
                {formatDate(s.date, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </b>
            </span>
            <span
              className="ca-checkin-status"
              data-status={s.response ? "done" : "waiting"}
            >
              {s.response ? "Feedback received" : "Awaiting feedback"}
            </span>
          </div>
          {s.response && (
            <details className="ca-checkin-feedback">
              <summary>
                Coach feedback <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <p>{s.response.text}</p>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 05b remote path: the form loads the calling client's earliest
// unfinished instance through `checkins/instances/next`, renders the pinned
// definition's fields, and posts `[{fieldId, value}]` as `answersJson` to the
// own submit route. No localStorage, no fixtures, no staff routes.
// ---------------------------------------------------------------------------

const WORD_RATING_OPTIONS = ["Low", "Okay", "Good", "Excellent"];

function ratingWireOptions(field: { ratingScheme?: string }) {
  if (field.ratingScheme === "WORD_LABELS")
    return WORD_RATING_OPTIONS.map((label, index) => ({
      value: String(index + 1),
      label,
    }));
  const count = field.ratingScheme === "SCALE_1_5" ? 5 : 10;
  return Array.from({ length: count }, (_, index) => ({
    value: String(index + 1),
    label: `${index + 1} / ${count}`,
  }));
}

function answerPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function RemoteMediaThumb({
  workspaceId,
  mediaId,
  poseLabel,
}: {
  workspaceId: string;
  mediaId: string;
  poseLabel: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only mint keyed by media id.
  useEffect(() => {
    let live = true;
    fetchMediaDownload(workspaceId, mediaId)
      .then((wire) => {
        if (live) setUrl(wire.download.url);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [workspaceId, mediaId]);
  if (!url)
    return <span className="ca-photo-empty" aria-label={poseLabel} />;
  // biome-ignore lint/performance/noImgElement: remote media previews are signed urls
  return <img src={url} alt={poseLabel} />;
}

type RemotePhase = "loading" | "ready" | "submitting" | "error";

export function RemoteCheckInForm({
  workspaceId,
  clientProfileId,
}: {
  workspaceId: string;
  clientProfileId: string;
}) {
  const [items, setItems] = useState<OwnCheckInInstanceListItemWire[] | null>(
    null,
  );
  const [listPhase, setListPhase] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [detail, setDetail] = useState<OwnCheckInInstanceDetailWire | null>(
    null,
  );
  const [detailPhase, setDetailPhase] = useState<RemotePhase>("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [poseMedia, setPoseMedia] = useState<
    Record<string, Record<string, string>>
  >({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState<CheckInSummaryRow[]>([]);
  const [feedback, setFeedback] = useState<
    { id: string; sentAt: string; byName: string; body: string }[]
  >([]);
  const [feedbackCursor, setFeedbackCursor] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const loadSummary = async (entryDate: string) => {
    try {
      const surface = await fetchDailyEntrySurface(workspaceId, entryDate);
      setSummary(summaryRowsFromSurface(surface, entryDate));
    } catch {
      setSummary([]);
    }
  };

  const openInstance = async (instanceId: string) => {
    setSelectedId(instanceId);
    setDetailPhase("loading");
    setAnswers({});
    setPoseMedia({});
    setAttempted(false);
    setStatus("");
    try {
      const instance = await fetchOwnCheckInInstance(workspaceId, instanceId);
      setDetail(instance);
      setFeedback(instance.feedback ?? []);
      setFeedbackCursor(instance.feedbackNextCursor);
      setDetailPhase("ready");
      void loadSummary(instance.dueAt.slice(0, 10));
    } catch {
      setDetail(null);
      setDetailPhase("error");
    }
  };

  const loadMoreFeedback = async () => {
    if (!detail || feedbackCursor === null) return;
    setFeedbackLoading(true);
    const result = await listOwnCheckInFeedbackAction(
      { workspaceId, instanceId: detail.instanceId },
      { cursor: feedbackCursor },
    );
    setFeedbackLoading(false);
    if (result.status !== "ok") return;
    setFeedback((current) => [...current, ...result.items]);
    setFeedbackCursor(result.nextCursor);
  };

  const load = async () => {
    const to = new Date();
    const from = new Date(to.getTime() - 42 * 24 * 60 * 60 * 1000);
    const until = new Date(to.getTime() + 30 * 24 * 60 * 60 * 1000);
    const result = await readOwnCheckInCalendarAction(
      { workspaceId },
      { from: from.toISOString(), to: until.toISOString() },
    );
    if (result.status === "error") {
      setListPhase("error");
      setDetailPhase("error");
      return;
    }
    const sorted = [...(result.status === "ok" ? result.items : [])].sort(
      (a, b) => a.dueAt.localeCompare(b.dueAt),
    );
    setItems(sorted);
    setListPhase("ready");
    const next =
      sorted.find((item) => item.state === "SCHEDULED") ?? sorted.at(-1) ?? null;
    if (next) await openInstance(next.instanceId);
    else setDetailPhase("ready");
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only load keyed by workspace.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remote load resolves after awaits.
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, clientProfileId]);

  const setAnswer = (fieldId: string, value: unknown) =>
    setAnswers((current) => ({ ...current, [fieldId]: value }));

  const fields = [...(detail?.definition.fields ?? [])].sort(
    (first, second) => first.order - second.order,
  );

  const visualValid = (field: (typeof fields)[number]) => {
    if (!field.required) return true;
    const poses = posesForVisualField(field, DEFAULT_POSES);
    const media = poseMedia[field.fieldId] ?? {};
    return poses.every((pose) => media[pose]);
  };
  const fieldValid = (
    field: (typeof fields)[number],
  ): boolean => {
    if (!field.required) return true;
    if (field.kind === "visual") return visualValid(field);
    return answerPresent(answers[field.fieldId]);
  };
  const valid = fields.every((field) => fieldValid(field));

  const uploadSlot = async (fieldId: string, pose: string, file: File) => {
    setUploading((current) => ({ ...current, [`${fieldId}:${pose}`]: true }));
    try {
      const entry = await uploadOwnProgressPhoto(
        workspaceId,
        clientProfileId,
        file,
        detail?.dueAt.slice(0, 10),
      );
      setPoseMedia((current) => ({
        ...current,
        [fieldId]: { ...(current[fieldId] ?? {}), [pose]: entry.mediaObjectId },
      }));
      setStatus("");
    } catch {
      setStatus("That photo could not be uploaded. Try again.");
    } finally {
      setUploading((current) => ({
        ...current,
        [`${fieldId}:${pose}`]: false,
      }));
    }
  };

  const submit = async () => {
    if (!detail) return;
    setAttempted(true);
    if (!valid) return;
    setDetailPhase("submitting");
    const payload = fields.map((field) => {
      const value = answers[field.fieldId];
      if (field.kind === "rating")
        return {
          fieldId: field.fieldId,
          value: answerPresent(value) ? Number(value) : null,
        };
      if (field.kind === "number")
        return {
          fieldId: field.fieldId,
          value: answerPresent(value) ? String(value).trim() : null,
        };
      if (field.kind === "visual")
        return {
          fieldId: field.fieldId,
          value: mediaIdsForPoses(
            posesForVisualField(field, DEFAULT_POSES),
            poseMedia[field.fieldId] ?? {},
          ),
        };
      if (field.kind === "multiChoice")
        return {
          fieldId: field.fieldId,
          value: Array.isArray(value) && value.length > 0 ? value : null,
        };
      return {
        fieldId: field.fieldId,
        value: answerPresent(value) ? String(value).trim() : null,
      };
    });
    try {
      const result = await submitOwnCheckIn(
        workspaceId,
        detail.instanceId,
        JSON.stringify(payload),
      );
      if (result.status === "already_submitted")
        setStatus("This check-in was already submitted.");
      const fresh = await fetchOwnCheckInInstance(
        workspaceId,
        detail.instanceId,
      );
      setDetail(fresh);
      setFeedback(fresh.feedback ?? []);
      setFeedbackCursor(fresh.feedbackNextCursor);
      setDetailPhase("ready");
      setItems((current) =>
        current === null
          ? current
          : current.map((item) =>
              item.instanceId === detail.instanceId
                ? {
                    ...item,
                    state: "SUBMITTED",
                    submittedAt: fresh.submittedAt,
                  }
                : item,
            ),
      );
    } catch (error) {
      setStatus(
        error instanceof ApiClientError && error.code === "already_submitted"
          ? "This check-in was already submitted."
          : "The check-in could not be sent. Try again.",
      );
      setDetailPhase("ready");
    }
  };

  if (listPhase === "loading")
    return (
      <section className="cd-preview-section" aria-label="Check-in">
        <div className="client-app-loading" role="status">
          Loading your check-in…
        </div>
      </section>
    );
  if (listPhase === "error")
    return (
      <section className="cd-preview-section" aria-label="Check-in">
        <Empty title="Your check-in could not be loaded">
          Check your connection and reload the page.
        </Empty>
      </section>
    );
  if (items !== null && items.length === 0)
    return (
      <section className="cd-preview-section" aria-label="Check-in">
        <Empty title="No check-ins scheduled">
          Your coach has not scheduled a check-in yet.
        </Empty>
      </section>
    );

  const submitted = detail !== null && detail.submittedAt !== null;
  const feedbackCount = feedback.length;

  return (
    <section className="cd-preview-section" aria-label="Check-in">
      <h2>Check-In</h2>
      {items !== null && items.length > 0 && (
        <div className="ca-checkin-schedule" aria-label="Check-in schedule">
          {(items ?? []).map((item) => {
            const chip = checkInScheduleStatus(item);
            return (
              <button
                type="button"
                className="ca-checkin-row"
                key={item.instanceId}
                aria-current={selectedId === item.instanceId}
                onClick={() => void openInstance(item.instanceId)}
              >
                <span className="ca-checkin-row-label">
                  <b>{item.formName}</b>
                  <small>
                    Due{" "}
                    {formatDate(item.dueAt.slice(0, 10), {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </small>
                </span>
                <span className="ca-checkin-status" data-status={chip}>
                  {checkInScheduleLabel(chip)}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {detailPhase === "loading" && (
        <div className="client-app-loading" role="status">
          Loading your check-in…
        </div>
      )}
      {detailPhase === "error" && (
        <Empty title="This check-in could not be loaded">
          Pick another date from your schedule.
        </Empty>
      )}
      {detail !== null && detailPhase !== "loading" && submitted && (
        <>
          <div className="ca-checkin-done">
            <Check size={20} aria-hidden="true" />
            <div>
              <h2>{detail.definition.title || detail.formName}</h2>
              <p className="cd-muted">
                Submitted{" "}
                {formatDate((detail.submittedAt ?? "").slice(0, 10), {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
                {detail.late ? " · late" : ""}
              </p>
            </div>
            <span
              className="ca-checkin-status"
              data-status={feedbackCount > 0 ? "done" : "waiting"}
            >
              {feedbackCount > 0 ? "Reviewed" : "Awaiting coach review"}
            </span>
          </div>
          <dl className="ca-checkin-answers">
            {fields.map((field) => {
              const answer = detail.submittedAnswers?.find(
                (item) => item.fieldId === field.fieldId,
              );
              const display = answer
                ? submittedAnswerDisplay(field, answer)
                : null;
              return (
                <div className="ca-checkin-answer" key={field.fieldId}>
                  <dt>{field.label}</dt>
                  <dd data-missing={display === null ? "" : undefined}>
                    {display ?? "No answer"}
                  </dd>
                  {answer !== undefined && answer.mediaIds.length > 0 && (
                    <div className="ca-checkin-media">
                      {answer.mediaIds.map((mediaId, index) => (
                        <RemoteMediaThumb
                          key={mediaId}
                          workspaceId={workspaceId}
                          mediaId={mediaId}
                          poseLabel={`Photo ${index + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </dl>
          <CheckInSummary title="Your tracker that week" rows={summary} />
          {feedbackCount > 0 && (
            <div className="ca-checkin-history">
              <h3>Coach feedback</h3>
              {feedback.map((item) => (
                <div className="ca-checkin-item" key={item.id}>
                  <div className="ca-checkin-item-head">
                    <b>{item.byName}</b>
                    <span className="ca-checkin-status" data-status="done">
                      {formatDate(item.sentAt.slice(0, 10), {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <p>{item.body}</p>
                </div>
              ))}
              {feedbackCursor !== null && (
                <Button
                  className="ca-checkin-back"
                  disabled={feedbackLoading}
                  onClick={() => void loadMoreFeedback()}
                >
                  {feedbackLoading ? "Loading…" : "Show earlier feedback"}
                </Button>
              )}
            </div>
          )}
          {feedbackCount === 0 && (
            <p className="cd-muted">
              Your coach will review this check-in and send feedback.
            </p>
          )}
        </>
      )}
      {detail !== null && detailPhase !== "loading" && !submitted && (
        <>
          <p className="cd-muted">
            Answer your coach&apos;s questions
            {detail.late ? " - this check-in is overdue." : "."}
          </p>
          <div className="ca-checkin-form">
            {fields.map((field) => {
              const required = field.required;
              const missing = attempted && !fieldValid(field);
              const label = `${field.label}${required ? " *" : " · optional"}`;
              return (
                <div className="ca-checkin-field" key={field.fieldId}>
                  {field.kind === "longText" ? (
                    <TextArea
                      label={label}
                      rows={3}
                      value={(answers[field.fieldId] as string) ?? ""}
                      error={missing ? "Required" : undefined}
                      onChange={(event) =>
                        setAnswer(field.fieldId, event.target.value)
                      }
                    />
                  ) : field.kind === "singleChoice" ? (
                    <Select
                      label={label}
                      value={(answers[field.fieldId] as string) ?? ""}
                      error={missing ? "Required" : undefined}
                      options={[
                        { value: "", label: "Choose an answer" },
                        ...(field.options ?? []).map((option) => ({
                          value: option.optionId,
                          label: option.label,
                        })),
                      ]}
                      onValueChange={(value) => setAnswer(field.fieldId, value)}
                    />
                  ) : field.kind === "multiChoice" ? (
                    <div className="ca-photo-question">
                      <span className="ca-photo-question-label">{label}</span>
                      {(field.options ?? []).map((option) => {
                        const selected =
                          (answers[field.fieldId] as string[]) ?? [];
                        return (
                          <Checkbox
                            key={option.optionId}
                            label={option.label}
                            checked={selected.includes(option.optionId)}
                            onCheckedChange={(checked) =>
                              setAnswer(
                                field.fieldId,
                                checked
                                  ? [...selected, option.optionId]
                                  : selected.filter(
                                      (item) => item !== option.optionId,
                                    ),
                              )
                            }
                          />
                        );
                      })}
                      {missing && (
                        <span className="ca-photo-error">Required</span>
                      )}
                    </div>
                  ) : field.kind === "rating" ? (
                    <Select
                      label={label}
                      value={
                        answerPresent(answers[field.fieldId])
                          ? String(answers[field.fieldId])
                          : ""
                      }
                      error={missing ? "Required" : undefined}
                      options={[
                        { value: "", label: "Choose a rating" },
                        ...ratingWireOptions(field),
                      ]}
                      onValueChange={(value) =>
                        setAnswer(field.fieldId, value ? Number(value) : null)
                      }
                    />
                  ) : field.kind === "visual" ? (
                    <div className="ca-photo-question">
                      <span className="ca-photo-question-label">{label}</span>
                      <div className="ca-photo-grid">
                        {posesForVisualField(field, DEFAULT_POSES).map(
                          (pose) => {
                            const mediaId =
                              poseMedia[field.fieldId]?.[pose] ?? null;
                            const busy =
                              uploading[`${field.fieldId}:${pose}`] === true;
                            return (
                              <div className="ca-photo-tile" key={pose}>
                                <label className="ca-photo-pick">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    hidden
                                    disabled={busy}
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      event.target.value = "";
                                      if (file)
                                        void uploadSlot(
                                          field.fieldId,
                                          pose,
                                          file,
                                        );
                                    }}
                                  />
                                  <span className="ca-photo-empty">
                                    {mediaId ? (
                                      <Check size={20} aria-hidden="true" />
                                    ) : (
                                      <Camera size={20} aria-hidden="true" />
                                    )}
                                    <b>
                                      {busy
                                        ? "Uploading…"
                                        : mediaId
                                          ? `${pose} added`
                                          : pose}
                                    </b>
                                  </span>
                                </label>
                                {mediaId ? (
                                  <button
                                    type="button"
                                    className="ca-photo-remove"
                                    aria-label={`Remove ${pose} photo`}
                                    onClick={() =>
                                      setPoseMedia((current) => {
                                        const next = {
                                          ...(current[field.fieldId] ?? {}),
                                        };
                                        delete next[pose];
                                        return {
                                          ...current,
                                          [field.fieldId]: next,
                                        };
                                      })
                                    }
                                  >
                                    <X size={14} aria-hidden="true" />
                                  </button>
                                ) : null}
                              </div>
                            );
                          },
                        )}
                      </div>
                      {missing && (
                        <span className="ca-photo-error">
                          Required - add each pose
                        </span>
                      )}
                    </div>
                  ) : field.kind === "date" ? (
                    <Input
                      label={label}
                      type="date"
                      value={(answers[field.fieldId] as string) ?? ""}
                      error={missing ? "Required" : undefined}
                      onChange={(event) =>
                        setAnswer(field.fieldId, event.target.value)
                      }
                    />
                  ) : field.kind === "number" ? (
                    <Input
                      label={label}
                      type="number"
                      inputMode="decimal"
                      value={(answers[field.fieldId] as string) ?? ""}
                      error={missing ? "Required" : undefined}
                      onChange={(event) =>
                        setAnswer(field.fieldId, event.target.value)
                      }
                    />
                  ) : (
                    <Input
                      label={label}
                      type="text"
                      value={(answers[field.fieldId] as string) ?? ""}
                      error={missing ? "Required" : undefined}
                      onChange={(event) =>
                        setAnswer(field.fieldId, event.target.value)
                      }
                    />
                  )}
                  {field.helpText && (
                    <small className="ct-field-help">{field.helpText}</small>
                  )}
                </div>
              );
            })}
            {fields.length === 0 && (
              <Empty title="This check-in has no questions" />
            )}
            <CheckInSummary
              title="This week in your tracker"
              rows={summary}
            />
            {attempted && !valid && (
              <p className="ca-photo-error">
                Please answer the required fields.
              </p>
            )}
            {status && <p className="ca-photo-error">{status}</p>}
            <Button
              primary
              className="ca-checkin-submit"
              disabled={detailPhase === "submitting"}
              onClick={() => void submit()}
            >
              {detailPhase === "submitting" ? "Sending…" : "Submit check-in"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
