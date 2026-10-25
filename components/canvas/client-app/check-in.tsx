"use client";

// Client-side check-in: fills the assigned form variant's questions,
// including per-pose photo uploads for "Visual upload" questions, and
// submits a real Submission into the shared coach state so the coach
// workspace (check-in calendar, physique comparison) sees it.

import { Camera, Check, ChevronDown, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  fetchOwnCheckInInstance,
  fetchOwnNextCheckIn,
  type OwnCheckInInstanceDetailWire,
  submitOwnCheckIn,
} from "../data/checkins";
import { ApiClientError } from "../data/http";
import { uploadOwnMedia } from "../data/media";
import { questionPoses } from "../coach/check-ins/photos";
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

export function CheckInForm({
  configuration,
  client,
  workspaceId,
}: {
  configuration: Variant;
  client: CoachClient;
  workspaceId?: string;
}) {
  // Card 05b: a real workspace binds the form to the own check-in routes;
  // without one the canvas demo keeps the localStorage submissions path.
  if (workspaceId) return <RemoteCheckInForm workspaceId={workspaceId} />;
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
                    Required — add each pose
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

export function RemoteCheckInForm({ workspaceId }: { workspaceId: string }) {
  const [detail, setDetail] = useState<OwnCheckInInstanceDetailWire | null>(
    null,
  );
  const [phase, setPhase] = useState<
    "loading" | "empty" | "ready" | "submitting" | "done" | "error"
  >("loading");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [status, setStatus] = useState("");

  const load = async () => {
    try {
      const { next } = await fetchOwnNextCheckIn(workspaceId);
      if (!next) {
        setDetail(null);
        setPhase("empty");
        return;
      }
      const instance = await fetchOwnCheckInInstance(
        workspaceId,
        next.instanceId,
      );
      setDetail(instance);
      setPhase(instance.submittedAt ? "done" : "ready");
    } catch {
      setPhase("error");
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only load keyed by workspace.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remote load resolves after awaits.
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const setAnswer = (fieldId: string, value: unknown) =>
    setAnswers((current) => ({ ...current, [fieldId]: value }));

  const fields = [...(detail?.definition.fields ?? [])].sort(
    (first, second) => first.order - second.order,
  );
  const fieldValid = (fieldId: string, required: boolean) =>
    !required || answerPresent(answers[fieldId]);
  const valid = fields.every((field) =>
    fieldValid(field.fieldId, field.required),
  );

  const addMedia = async (fieldId: string, file: File) => {
    setUploading((current) => ({ ...current, [fieldId]: true }));
    try {
      const mediaId = await uploadOwnMedia(
        workspaceId,
        file,
        file.name,
        file.type,
      );
      setAnswers((current) => ({
        ...current,
        [fieldId]: [...((current[fieldId] as string[]) ?? []), mediaId],
      }));
      setStatus("");
    } catch {
      setStatus("That photo could not be uploaded. Try again.");
    } finally {
      setUploading((current) => ({ ...current, [fieldId]: false }));
    }
  };

  const submit = async () => {
    if (!detail) return;
    setAttempted(true);
    if (!valid) return;
    setPhase("submitting");
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
      if (field.kind === "multiChoice" || field.kind === "visual")
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
      setPhase("done");
    } catch (error) {
      setStatus(
        error instanceof ApiClientError && error.code === "already_submitted"
          ? "This check-in was already submitted."
          : "The check-in could not be sent. Try again.",
      );
      setPhase("ready");
    }
  };

  if (phase === "loading")
    return (
      <section className="cd-preview-section" aria-label="Check-in">
        <div className="client-app-loading" role="status">
          Loading your check-in…
        </div>
      </section>
    );
  if (phase === "empty")
    return (
      <section className="cd-preview-section" aria-label="Check-in">
        <Empty title="No check-in is due right now" />
      </section>
    );
  if (phase === "error")
    return (
      <section className="cd-preview-section" aria-label="Check-in">
        <Empty title="Your check-in could not be loaded">
          Check your connection and reload the page.
        </Empty>
      </section>
    );
  if (!detail) return null;

  if (phase === "done")
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
        {status && <p className="ca-photo-error">{status}</p>}
        {detail.feedback && detail.feedback.length > 0 && (
          <div className="ca-checkin-history">
            <h3>Coach feedback</h3>
            {detail.feedback.map((item) => (
              <div className="ca-checkin-item" key={item.id}>
                <div className="ca-checkin-item-head">
                  <b>{item.byName}</b>
                  <span className="ca-checkin-status" data-status="done">
                    Feedback received
                  </span>
                </div>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    );

  return (
    <section className="cd-preview-section" aria-label="Check-in form">
      <h2>{detail.definition.title || detail.formName}</h2>
      <p className="cd-muted">
        Answer your coach&apos;s questions
        {detail.late ? " — this check-in is overdue." : "."}
      </p>
      <div className="ca-checkin-form">
        {fields.map((field) => {
          const required = field.required;
          const missing = attempted && !fieldValid(field.fieldId, required);
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
                    const selected = (answers[field.fieldId] as string[]) ?? [];
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
                    {((answers[field.fieldId] as string[]) ?? []).map(
                      (mediaId, index) => (
                        <div className="ca-photo-tile" key={mediaId}>
                          <span className="ca-photo-empty">
                            <Check size={20} aria-hidden="true" />
                            <b>Photo {index + 1}</b>
                          </span>
                          <button
                            type="button"
                            className="ca-photo-remove"
                            aria-label={`Remove photo ${index + 1}`}
                            onClick={() =>
                              setAnswer(
                                field.fieldId,
                                (
                                  (answers[field.fieldId] as string[]) ?? []
                                ).filter((item) => item !== mediaId),
                              )
                            }
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </div>
                      ),
                    )}
                    <div className="ca-photo-tile">
                      <label className="ca-photo-pick">
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          hidden
                          disabled={uploading[field.fieldId]}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void addMedia(field.fieldId, file);
                          }}
                        />
                        <span className="ca-photo-empty">
                          <Camera size={20} aria-hidden="true" />
                          <b>
                            {uploading[field.fieldId]
                              ? "Uploading…"
                              : "Add photo"}
                          </b>
                        </span>
                      </label>
                    </div>
                  </div>
                  {missing && (
                    <span className="ca-photo-error">
                      Required — add at least one photo
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
        {attempted && !valid && (
          <p className="ca-photo-error">Please answer the required fields.</p>
        )}
        {status && <p className="ca-photo-error">{status}</p>}
        <Button
          primary
          className="ca-checkin-submit"
          disabled={phase === "submitting"}
          onClick={() => void submit()}
        >
          {phase === "submitting" ? "Sending…" : "Submit check-in"}
        </Button>
      </div>
    </section>
  );
}
