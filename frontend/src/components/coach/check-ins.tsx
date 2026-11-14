"use client";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  MessageCircle,
  Plus,
  Video,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SegmentedControl } from "../vari8/components";
import { TextArea } from "../vari8/inputs";
import { ExtraDateDialog } from "./clients";
import { DemoRecorder, MediaCard } from "./media";
import {
  ALL_PARAMETERS,
  addDays,
  type CoachClient,
  DAYS,
  type Event,
  type Extra,
  eventsBetween,
  feedbackChipText,
  formatDate,
  monday,
  type ReviewDraft,
  type Submission,
  submitFeedback,
  TODAY,
} from "./model";
import { useCoach } from "./store";
import { templateSetup } from "./template-setup";
import {
  Avatar,
  Button,
  Dialog,
  Empty,
  IconButton,
  PageTitle,
  ParameterValue,
  Select,
  Status,
  Surface,
} from "./ui";

/** "Reply due in …" / "Late by …" chip for submissions still awaiting
 * feedback; null when the feedback target is off. */
function FeedbackChip({ submission }: { submission: Submission }) {
  const { state } = useCoach();
  const chip = feedbackChipText(state.preferences, submission);
  if (!chip) return null;
  return (
    <span className={`cd-status cd-fbchip${chip.late ? " is-late" : ""}`}>
      {chip.text}
    </span>
  );
}

export function CheckInsWorkspace() {
  const { state, route, navigate, setState, toast } = useCoach();
  const [mode, setMode] = useState("Week");
  const [anchor, setAnchor] = useState(TODAY);
  const [client, setClient] = useState(route.client ?? "all");
  const [status, setStatus] = useState("All statuses");
  const [selected, setSelected] = useState<Event | null>(null);
  const [add, setAdd] = useState(false);
  const [extraDate, setExtraDate] = useState<string>();
  const [edit, setEdit] = useState<Extra | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  if (route.review) {
    const sub = state.submissions.find((s) => s.id === route.review);
    return sub ? (
      <ReviewWorkspace submission={sub} />
    ) : (
      <Empty
        title="Submission not found"
        action={
          <Button onClick={() => navigate({ section: "check-ins" })}>
            Back to calendar
          </Button>
        }
      />
    );
  }
  const start = mode === "Month" ? `${anchor.slice(0, 7)}-01` : monday(anchor);
  const monthEnd = new Date(`${start}T12:00:00Z`);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  const end =
    mode === "Month"
      ? monthEnd.toISOString().slice(0, 10)
      : addDays(start, mode === "Agenda" ? 27 : 6);
  const events = eventsBetween(state, start, end).filter(
    (e) =>
      (client === "all" || e.clientId === client) &&
      (status === "All statuses" || e.status === status),
  );
  const pending = state.submissions.filter((s) => !s.response).length;
  const move = (dir: number) => {
    if (mode === "Month") {
      const d = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + dir);
      setAnchor(d.toISOString().slice(0, 10));
    } else setAnchor(addDays(anchor, dir * (mode === "Agenda" ? 28 : 7)));
    setSelected(null);
  };
  const renderDetails = (e: Event, c: CoachClient) => (
    <>
      <div className="cd-subheading">
        <span>Check-in details</span>
        <IconButton label="Close details" onClick={() => setSelected(null)}>
          <X size={18} />
        </IconButton>
      </div>
      <Avatar client={c} />
      <h2>{c.name}</h2>
      <p>
        {formatDate(e.date, {
          weekday: "long",
          year: "numeric",
        })}
      </p>
      <Status text={e.status} />
      {e.submission && !e.submission.response && (
        <FeedbackChip submission={e.submission} />
      )}
      <div className="cd-stat-row">
        <span>Origin</span>
        <strong>{e.origin}</strong>
      </div>
      <div className="cd-stat-row">
        <span>Update</span>
        <strong>{e.type}</strong>
      </div>
      {e.extra?.note && <p>{e.extra.note}</p>}
      {e.submission && (
        <Button
          primary
          onClick={() =>
            navigate({
              section: "check-ins",
              review: e.submission?.id,
              client: c.id,
            })
          }
        >
          Open {e.submission.response ? "feedback" : "review"}
          <ArrowRight size={15} />
        </Button>
      )}
      <Button onClick={() => navigate({ section: "messages", client: c.id })}>
        <MessageCircle size={15} />
        Open conversation
      </Button>
      <Button onClick={() => navigate({ section: "clients", client: c.id })}>
        View athlete profile
        <ArrowUpRight size={15} />
      </Button>
      {e.extra && !e.submission && (
        <>
          <Button onClick={() => setEdit(e.extra ?? null)}>
            Reschedule additional date
          </Button>
          <Button
            onClick={() => {
              const x = e.extra;
              setState((s) => ({
                ...s,
                extras: s.extras.filter((e) => e.id !== x?.id),
              }));
              setSelected(null);
              toast("Additional date removed", () => {
                if (x)
                  setState((s) => ({
                    ...s,
                    extras: [...s.extras, x],
                  }));
              });
            }}
          >
            Remove additional date
          </Button>
        </>
      )}
    </>
  );
  const renderEvent = (e: Event) => {
    const c = state.clients.find((c) => c.id === e.clientId);
    if (!c) return null;
    return (
      <Popover.Root
        key={e.id}
        modal={false}
        open={selected?.id === e.id}
        onOpenChange={(open) =>
          setSelected((current) =>
            open ? e : current?.id === e.id ? null : current,
          )
        }
      >
        <Popover.Trigger
          render={
            <button
              type="button"
              className={`cd-calendar-event ${selected?.id === e.id ? "is-selected" : ""}`}
              data-status={e.status}
            />
          }
        >
          <span className="cd-event-athlete">
            <Avatar client={c} small />
            <strong>{c.name}</strong>
          </span>
          <span className="cd-event-type">
            {e.origin} · {e.type}
          </span>
          <Status text={e.status} />
          {e.submission && !e.submission.response && (
            <FeedbackChip submission={e.submission} />
          )}
        </Popover.Trigger>
        <Popover.Portal container={stage}>
          <Popover.Positioner
            className="cd-event-positioner"
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={12}
            collisionPadding={{
              top: 12,
              right: 12,
              left: 12,
              bottom: isMobile ? 85 : 12,
            }}
            collisionAvoidance={{
              side: "flip",
              align: "shift",
              fallbackAxisSide: "end",
            }}
            positionMethod="absolute"
          >
            <Popover.Popup
              className="cd-event-detail"
              aria-label="Check-in details"
              initialFocus
              finalFocus
            >
              {renderDetails(e, c)}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  };
  const monthGridStart = monday(start);
  const monthDays =
    Math.ceil(
      (Number(end.slice(8)) +
        ((new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7)) /
        7,
    ) * 7;
  return (
    <>
      <PageTitle
        title="Check-ins"
        description="A little context. A better conversation."
        actions={
          <Button primary onClick={() => setAdd(true)}>
            <Plus size={16} />
            Add extra date
          </Button>
        }
      />
      <div className="cd-calendar-toolbar">
        <div className="cd-actions">
          <IconButton label="Previous period" onClick={() => move(-1)}>
            <ChevronLeft size={18} />
          </IconButton>
          <IconButton label="Next period" onClick={() => move(1)}>
            <ChevronRight size={18} />
          </IconButton>
          <h2>
            {formatDate(start)} – {formatDate(end, { year: "numeric" })}
          </h2>
          <Button
            onClick={() => {
              setAnchor(TODAY);
              setSelected(null);
            }}
          >
            Today
          </Button>
        </div>
        <SegmentedControl
          label="Calendar view"
          value={mode}
          className="cd-calendar-view-control"
          onValueChange={(value) => {
            setMode(value);
            setSelected(null);
          }}
          options={["Week", "Month", "Agenda"].map((value) => ({
            value,
            label: value,
          }))}
        />
      </div>
      <div className="cd-calendar-filters">
        <Select
          label="Athlete"
          value={client}
          onChange={(v) => {
            setClient(v);
            setSelected(null);
          }}
          options={[
            { value: "all", label: "All athletes" },
            ...state.clients.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <Select
          label="Status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setSelected(null);
          }}
          options={[
            "All statuses",
            "Scheduled",
            "Overdue",
            "Awaiting feedback",
            "Feedback sent",
          ]}
        />
        <span className="cd-pending">
          <span>{pending}</span> awaiting feedback
        </span>
        <span className="cd-caption">Europe/Vienna · Monday first</span>
      </div>
      <div className="cd-calendar-stage" ref={stage}>
        <Surface className={`cd-calendar cd-calendar-${mode.toLowerCase()}`}>
          {mode === "Week" && (
            <div className="cd-week-board">
              {Array.from({ length: 7 }, (_, i) => {
                const date = addDays(start, i);
                const dayEvents = events.filter((e) => e.date === date);
                return (
                  <section
                    className="cd-calendar-day"
                    key={date}
                    data-today={date === TODAY}
                  >
                    <header>
                      <span>{DAYS[i].slice(0, 3)}</span>
                      <strong>{Number(date.slice(8))}</strong>
                      {date === TODAY && <small>Today</small>}
                    </header>
                    <div>
                      {dayEvents.map(renderEvent)}
                      {dayEvents.length === 0 && (
                        <span className="cd-day-empty">No check-ins</span>
                      )}
                    </div>
                    <Button
                      className="cd-day-add"
                      aria-label={`Add date ${date}`}
                      onClick={() => {
                        setExtraDate(date);
                        setAdd(true);
                      }}
                    >
                      <Plus size={14} />
                    </Button>
                  </section>
                );
              })}
            </div>
          )}
          {mode === "Month" && (
            <div className="cd-month-board">
              {DAYS.map((d) => (
                <div className="cd-month-weekday" key={d}>
                  {d.slice(0, 3)}
                </div>
              ))}
              {Array.from({ length: monthDays }, (_, i) => {
                const date = addDays(monthGridStart, i);
                return (
                  <section
                    key={date}
                    data-today={date === TODAY}
                    className={`cd-month-day ${date.slice(0, 7) !== start.slice(0, 7) ? "cd-outside-month" : ""}`}
                  >
                    <strong>{Number(date.slice(8))}</strong>
                    {events.filter((e) => e.date === date).map(renderEvent)}
                  </section>
                );
              })}
            </div>
          )}
          {mode === "Agenda" && (
            <div className="cd-agenda">
              {[...new Set(events.map((e) => e.date))].map((date) => (
                <section key={date}>
                  <h3>{formatDate(date, { weekday: "long" })}</h3>
                  <div>
                    {events.filter((e) => e.date === date).map(renderEvent)}
                  </div>
                </section>
              ))}
            </div>
          )}
          {events.length === 0 && (
            <Empty
              title="A quiet period"
              action={
                <Button
                  onClick={() => {
                    setStatus("All statuses");
                    setClient("all");
                    setSelected(null);
                  }}
                >
                  Clear filters
                </Button>
              }
            >
              No check-ins match these dates and filters.
            </Empty>
          )}
        </Surface>
      </div>
      {add && (
        <ExtraDateDialog
          initialDate={extraDate}
          clientId={client !== "all" ? client : undefined}
          onClose={() => setAdd(false)}
        />
      )}
      {edit && (
        <ExtraDateDialog
          existing={edit}
          onClose={() => {
            setEdit(null);
            setSelected(null);
          }}
        />
      )}
    </>
  );
}
function ReviewWorkspace({ submission: sub }: { submission: Submission }) {
  const { state, setState, navigate, toast } = useCoach();
  const [visual, setVisual] = useState<string | null>(null);
  const c = state.clients.find((c) => c.id === sub.clientId);
  const draft: ReviewDraft = state.reviewDrafts[sub.id] ?? {
    text: "",
    changes: [],
  };
  const setDraft = (patch: Partial<ReviewDraft>) =>
    setState((s) => ({
      ...s,
      reviewDrafts: {
        ...s.reviewDrafts,
        [sub.id]: {
          ...(s.reviewDrafts[sub.id] ?? { text: "", changes: [] }),
          ...patch,
        },
      },
    }));
  if (!c) return <Empty title="Athlete not found" />;
  const variant = c.assignment
    ? templateSetup(c.assignment.snapshot, c.assignment.variantId)
    : undefined;
  const unit = (id: string) =>
    variant?.fields.find((f) => f.id === id) ?? {
      id,
      unit: ALL_PARAMETERS.find((p) => p.id === id)?.units[0] ?? "",
    };
  return (
    <>
      <PageTitle
        title={`${c.name.split(" ")[0]}’s check-in`}
        description={`${sub.type} update · ${formatDate(sub.date, { weekday: "long", year: "numeric" })}`}
        back={() => navigate({ section: "check-ins" })}
        actions={
          <>
            <Status
              text={sub.response ? "Feedback sent" : "Awaiting feedback"}
            />
            <Button
              onClick={() => navigate({ section: "messages", client: c.id })}
            >
              <MessageCircle size={15} />
              Conversation
            </Button>
          </>
        }
      />
      <div className="cd-review-layout">
        <div className="cd-review-main">
          <Surface>
            <div className="cd-review-athlete">
              <Avatar client={c} />
              <div>
                <h2>In {c.name.split(" ")[0]}’s words</h2>
                <small>{sub.type} questionnaire</small>
              </div>
            </div>
            {sub.answers.map((a) => (
              <div className="cd-answer" key={a.question}>
                <h3>{a.question}</h3>
                <p>{a.answer}</p>
              </div>
            ))}
            {sub.note && (
              <div className="cd-answer">
                <h3>Athlete note</h3>
                <p>{sub.note}</p>
              </div>
            )}
            {sub.visuals.length > 0 && (
              <>
                <h3>Submitted visuals</h3>
                <div className="cd-progress-visuals">
                  {sub.visuals.map((v) => (
                    <button type="button" key={v} onClick={() => setVisual(v)}>
                      <ProgressVisual />
                      <span>{v}</span>
                      <small>Illustrative demo visual</small>
                    </button>
                  ))}
                </div>
              </>
            )}
          </Surface>
          <Surface>
            <div className="cd-subheading">
              <h2>Tracker & progress</h2>
              <Button
                onClick={() => navigate({ section: "clients", client: c.id })}
              >
                Open profile
                <ArrowUpRight size={14} />
              </Button>
            </div>
            {sub.metrics
              .filter((id) => id !== "habits")
              .map((id) => (
                <ParameterValue key={id} field={unit(id)} client={c} />
              ))}
            {sub.metrics.includes("habits") && (
              <div className="cd-stat-row">
                <span>Habit consistency</span>
                <strong>{c.habits[0]?.completed ?? 0} / 7 days</strong>
              </div>
            )}
            <div className="cd-table-scroll">
              <table className="cd-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Bodyweight</th>
                    <th>Sleep</th>
                    <th>Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {c.entries.map((e) => (
                    <tr key={e.date}>
                      <td>{formatDate(e.date)}</td>
                      <td>
                        {unit("weight").unit === "lb"
                          ? (e.weight * 2.20462).toFixed(1)
                          : e.weight}{" "}
                        {unit("weight").unit}
                      </td>
                      <td>{e.sleep} h</td>
                      <td>{e.steps.toLocaleString()} steps</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>
          <Surface>
            <h2>
              <Flag size={17} />
              Flagged training notes
            </h2>
            {sub.flags.length ? (
              sub.flags.map((f) => (
                <div className="cd-flag-note" key={`${f.exercise}-${f.set}`}>
                  <strong>
                    {f.exercise} · Set {f.set}
                  </strong>
                  <small>{formatDate(f.date)} · Athlete training note</small>
                  <p>{f.text}</p>
                  <Button
                    onClick={() =>
                      navigate({
                        section: "clients",
                        client: c.id,
                        plan: "training",
                        review: sub.id,
                        tab: "Plans",
                      })
                    }
                  >
                    Open training setup
                    <ArrowUpRight size={14} />
                  </Button>
                </div>
              ))
            ) : (
              <p className="cd-muted">
                No flagged set notes in this submission.
              </p>
            )}
          </Surface>
        </div>
        <Surface className="cd-feedback-panel">
          <h2>{sub.response ? "Your feedback" : "Respond with context"}</h2>
          {sub.response ? (
            <>
              <p className="cd-feedback-text">{sub.response.text}</p>
              {sub.response.video && <MediaCard item={sub.response.video} />}
              {sub.response.changes.map((change) => (
                <p className="cd-change-summary" key={change}>
                  {change}
                </p>
              ))}
              <p className="cd-caption">
                <Check size={14} />
                Sent locally {formatDate(sub.response.date)}
              </p>
              <Button
                onClick={() => navigate({ section: "messages", client: c.id })}
              >
                View in conversation
                <ArrowRight size={14} />
              </Button>
            </>
          ) : (
            <>
              <TextArea
                label="Feedback to athlete"
                rows={8}
                value={draft.text}
                onChange={(e) => setDraft({ text: e.target.value })}
                placeholder="What’s going well? What should we focus on next?"
              />
              <p className="cd-caption">
                Draft kept automatically. Opening a review does not mark it
                answered.
              </p>
              <h3>
                <Video size={15} />
                Video feedback
              </h3>
              {draft.video ? (
                <MediaCard
                  item={draft.video}
                  onRemove={() => setDraft({ video: undefined })}
                />
              ) : (
                <DemoRecorder
                  kind="video"
                  onAttach={(video) => setDraft({ video })}
                />
              )}
              <h3>Adjust this athlete’s plan</h3>
              <div className="cd-actions cd-wrap">
                <Button
                  onClick={() =>
                    navigate({
                      section: "clients",
                      client: c.id,
                      plan: "nutrition",
                      review: sub.id,
                      tab: "Plans",
                    })
                  }
                >
                  Nutrition
                  <ArrowUpRight size={14} />
                </Button>
                <Button
                  onClick={() =>
                    navigate({
                      section: "clients",
                      client: c.id,
                      plan: "training",
                      review: sub.id,
                      tab: "Plans",
                    })
                  }
                >
                  Training
                  <ArrowUpRight size={14} />
                </Button>
              </div>
              {(draft.activations ?? []).map((a) => (
                <div className="cd-plan-changes" key={a.versionId}>
                  <h3>
                    {a.kind === "nutrition" ? "Nutrition" : "Training"}{" "}
                    activated
                  </h3>
                  <p>
                    {a.name} · Starts {a.startDate}
                  </p>
                  <Button
                    onClick={() =>
                      navigate({
                        section: "clients",
                        client: c.id,
                        plan: a.kind,
                        review: sub.id,
                      })
                    }
                  >
                    View activated plan
                  </Button>
                </div>
              ))}
              {draft.changes.filter((x) => x.before !== x.after).length > 0 && (
                <div className="cd-plan-changes">
                  <h3>Changes included with feedback</h3>
                  {draft.changes
                    .filter((x) => x.before !== x.after)
                    .map((x) => (
                      <p key={x.field}>
                        {x.field === "calories"
                          ? "Daily energy target"
                          : x.field === "sets"
                            ? "Working sets"
                            : x.field}
                        : {x.before} → {x.after}
                      </p>
                    ))}
                  <Button
                    onClick={() =>
                      navigate({
                        section: "clients",
                        client: c.id,
                        plan: "nutrition",
                      })
                    }
                  >
                    View affected client plan
                    <ArrowUpRight size={14} />
                  </Button>
                </div>
              )}
              <Button
                primary
                className="cd-submit-feedback"
                disabled={!draft.text.trim() && !draft.video}
                onClick={() => {
                  setState((s) =>
                    submitFeedback(s, sub.id, new Date().toISOString()),
                  );
                  toast("Feedback sent to the athlete’s local conversation");
                }}
              >
                Submit feedback
                <ArrowRight size={16} />
              </Button>
            </>
          )}
        </Surface>
      </div>
      {visual && (
        <Dialog title={visual} onClose={() => setVisual(null)}>
          <ProgressVisual />
          <p className="cd-caption">
            Illustrative local progress visual, retained with the submission.
          </p>
        </Dialog>
      )}
    </>
  );
}
function ProgressVisual() {
  return (
    <svg
      className="cd-progress-figure"
      viewBox="0 0 160 190"
      role="img"
      aria-label="Illustrative athlete progress silhouette"
    >
      <rect
        width="160"
        height="190"
        rx="12"
        fill="currentColor"
        opacity=".04"
      />
      <path
        d="M80 24a14 14 0 1 0 0 28a14 14 0 0 0 0-28M63 61Q80 54 97 61L111 113Q108 121 103 115L92 85L94 122L99 168Q95 175 89 169L80 131L71 169Q65 175 61 168L66 122L68 85L57 115Q52 121 49 113Z"
        fill="currentColor"
        opacity=".35"
      />
      <path
        d="M27 168H133M27 24H133"
        stroke="currentColor"
        opacity=".15"
        strokeDasharray="3 4"
      />
    </svg>
  );
}
