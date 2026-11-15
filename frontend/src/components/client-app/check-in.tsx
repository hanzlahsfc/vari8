"use client";

// Client-side check-in: fills the assigned form variant's questions,
// including per-pose photo uploads for "Visual upload" questions, and
// submits a real Submission into the shared coach state so the coach
// workspace (check-in calendar, physique comparison) sees it.

import { Camera, Check, ChevronDown, X } from "lucide-react";
import { useRef, useState } from "react";
import { questionPoses } from "../coach/check-ins/photos";
import {
  type CheckInTargetVerdict,
  type CoachClient,
  type CoachState,
  checkInSubmissionTarget,
  type Event,
  pickCheckInCard,
  type Question,
  type Submission,
  uid,
  type Variant,
} from "../coach/model";
import { useCoach, useDisplay } from "../coach/store";
import { localToday } from "../coach/targets/model";
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

/** Resolve the occurrence a check-in files against through the same
 * move-aware path as the calendar and cards (pickCheckInCard sees
 * extras, skips and re-dated moves). Generic entry points — no selected
 * occurrence — take the next actionable event; a selected occurrence is
 * used verbatim and never swapped for another recurring ID. */
function resolveOccurrence(
  state: CoachState,
  client: CoachClient,
  today: string,
): Pick<Event, "id" | "date"> | undefined {
  const { overdue, next } = pickCheckInCard(
    state,
    client.id,
    today,
    new Date(),
  );
  return next ?? overdue;
}

/** The occurrence an open check-in draft files against. The first render
 * can resolve a stale day — useLocalToday yields the seeded constant
 * until its effect runs — and pickCheckInCard can retarget after a
 * deadline or day boundary ticks past while the form sits open, so the
 * candidate freezes on the first settled render. Surrounding UI (sheet
 * header, form caption) reads the same value so it stays aligned with
 * what submit writes; remounting binds the newly selected occurrence. */
export function useCheckInTarget(
  client: CoachClient,
  candidate?: Pick<Event, "id" | "date">,
): Pick<Event, "id" | "date"> | undefined {
  const { state } = useCoach();
  const today = useLocalToday();
  const boundRef = useRef<Pick<Event, "id" | "date"> | null | undefined>(
    undefined,
  );
  const liveTarget = () => {
    const t = candidate ?? resolveOccurrence(state, client, today);
    return t ? { id: t.id, date: t.date } : undefined;
  };
  if (boundRef.current === undefined && today === localToday())
    boundRef.current = liveTarget() ?? null;
  return boundRef.current === undefined
    ? liveTarget()
    : (boundRef.current ?? undefined);
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
  occurrence,
}: {
  configuration: Variant;
  client: CoachClient;
  /** The occurrence the athlete opened, when the entry point knows it. */
  occurrence?: Pick<Event, "id" | "date">;
}) {
  const { formatDate } = useDisplay();
  const { state, setState } = useCoach();
  const today = useLocalToday();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [attempted, setAttempted] = useState(false);
  const [filedId, setFiledId] = useState<string | null>(null);
  const [stale, setStale] = useState<Extract<
    CheckInTargetVerdict,
    { ok: false }
  > | null>(null);
  // Once an activation is in flight a second one is ignored: two submit
  // calls inside the same batch would each pass the pre-check against
  // the uncommitted snapshot, and the loser's rejected write would swap
  // the winner's success for a false "already submitted" error.
  const inFlightRef = useRef(false);
  const target = useCheckInTarget(client, occurrence);

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
    if (!valid || inFlightRef.current) return;
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
      date: target?.date ?? today,
      submittedAt: new Date().toISOString(),
      eventId: target?.id ?? "",
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
    // The recheck inside the updater is the point-of-write guard: it
    // sees any move, skip, removal or submission that landed after the
    // last render. A rejected write leaves the draft untouched instead
    // of attaching it to a different occurrence; the filed flag plus
    // the stored submission decide which outcome renders.
    const verdict = checkInSubmissionTarget(state, client.id, target, today);
    if (!verdict.ok) {
      setStale(verdict);
      return;
    }
    inFlightRef.current = true;
    setStale(null);
    setFiledId(submission.id);
    setState((s) =>
      checkInSubmissionTarget(s, client.id, target, today).ok
        ? { ...s, submissions: [...s.submissions, submission] }
        : s,
    );
  };

  const filed =
    filedId != null && state.submissions.some((s) => s.id === filedId);
  // A render that knows filedId has already committed the matching
  // write — React does not render inside a batch — so a missing
  // submission here is the settled outcome of that attempt, not a
  // pending one. Release the guard so a later Submit revalidates
  // against current state instead of silently doing nothing.
  if (filedId != null && !filed) inFlightRef.current = false;
  // A filed attempt whose submission never landed means the in-updater
  // recheck rejected it — recompute the verdict for the reason.
  const rejectedVerdict =
    filedId != null && !filed
      ? checkInSubmissionTarget(state, client.id, target, today)
      : null;
  const staleView =
    stale ?? (rejectedVerdict && !rejectedVerdict.ok ? rejectedVerdict : null);

  if (filed)
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
      {target && (
        <p className="cd-muted">
          Filing for{" "}
          {formatDate(target.date, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
        </p>
      )}
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
        {staleView && (
          <p className="ca-photo-error" role="alert">
            {staleView.reason === "moved"
              ? `This check-in moved to ${formatDate(staleView.to ?? today, { day: "numeric", month: "short" })}. Close this form and open it again from Home or the calendar — your answers are still here.`
              : staleView.reason === "submitted"
                ? "This check-in was already submitted. Your answers are still here if you want to copy them into a message."
                : "This check-in is no longer scheduled. Close this form and open the current one from Home — your answers are still here."}
          </p>
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
