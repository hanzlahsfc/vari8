"use client";

// Client-side check-in: fills the assigned form variant's questions,
// including per-pose photo uploads for "Visual upload" questions, and
// submits a real Submission into the shared coach state so the coach
// workspace (check-in calendar, physique comparison) sees it.

import { Camera, Check, ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { questionPoses } from "../coach/check-ins/photos";
import {
  addDays,
  type CoachClient,
  type Question,
  type Submission,
  uid,
  type Variant,
} from "../coach/model";
import { useCoach, useDisplay } from "../coach/store";
import { useLocalToday } from "../coach/targets/use-local-today";
import { Button, Empty } from "../coach/ui";
import { Input, Select } from "../vari8/components";
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
}: {
  configuration: Variant;
  client: CoachClient;
}) {
  const { formatDate } = useDisplay();
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
      submittedAt: new Date().toISOString(),
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
  const { formatDate } = useDisplay();
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
