"use client";
import { useMemo, useState } from "react";
import { DatePicker, DateRangePicker, TextArea } from "../../vari8/inputs";
import { type Event, resolvedTimeZone, uid, zonedToday } from "../model";
import { useCoach, useDisplay } from "../store";
import { Button, Dialog, Select, Toggle } from "../ui";
import {
  AUTO_MESSAGE_DEFAULT,
  affectedCheckIns,
  fillAutoMessage,
  type MoveChoice,
  moveClashes,
  planMoves,
  proposedDate,
  type RowChoice,
  reschedulingMessages,
  undoVacationSave,
  type Vacation,
  vacationBackDay,
  vacationMoves,
} from "../vacations";
import { SettingsCard } from "./shell";

const CHOICES: { value: MoveChoice; label: string }[] = [
  { value: "before", label: "Move to last working day before" },
  { value: "after", label: "Move to first working day back" },
  { value: "date", label: "Pick a date" },
  { value: "skip", label: "Skip this check-in" },
  { value: "keep", label: "Keep the date" },
];

type Row = { event: Event; submitted: boolean; restoreOnly?: boolean };

/** The vacation list plus the add/edit dialog inside Availability. */
export function VacationsCard() {
  const { state, setState, toast } = useCoach();
  const { formatDate } = useDisplay();
  const vacations = state.preferences.vacations ?? [];
  const [editing, setEditing] = useState<Vacation | "new" | null>(null);
  const [deleting, setDeleting] = useState<Vacation | null>(null);
  const fmt = (d: string) =>
    formatDate(d, { weekday: "short", day: "numeric", month: "short" });
  const remove = (v: Vacation, restore: boolean) => {
    const submittedEventIds = new Set(state.submissions.map((s) => s.eventId));
    setState((s) => ({
      ...s,
      preferences: {
        ...s.preferences,
        vacations: (s.preferences.vacations ?? []).filter((x) => x.id !== v.id),
      },
      // Restoring keeps moves for submitted check-ins — those are never
      // re-dated by a restore, same as they are never moved.
      checkInMoves: restore
        ? (s.checkInMoves ?? []).filter(
            (m) => m.vacationId !== v.id || submittedEventIds.has(m.eventId),
          )
        : s.checkInMoves,
    }));
    setDeleting(null);
    toast(restore ? "Vacation deleted, dates restored" : "Vacation deleted");
  };
  return (
    <SettingsCard
      id="settings-vacations"
      title="Vacations"
      description="Time off with check-in rescheduling and an automatic reply."
    >
      {vacations.length === 0 && (
        <p className="cd-settings-row-hint">No vacations planned.</p>
      )}
      <ul className="cd-vacation-list">
        {vacations.map((v) => (
          <li key={v.id} className="cd-vacation-row">
            <div>
              <strong>{v.label || `${fmt(v.start)} – ${fmt(v.end)}`}</strong>
              <span className="cd-caption">
                {v.label
                  ? `${fmt(v.start)} – ${fmt(v.end)}`
                  : `Back on ${fmt(vacationBackDay(state.preferences, v))}`}
              </span>
            </div>
            <Button onClick={() => setEditing(v)}>Edit</Button>
            <Button onClick={() => setDeleting(v)}>Delete</Button>
          </li>
        ))}
      </ul>
      <Button primary onClick={() => setEditing("new")}>
        Add vacation
      </Button>
      {editing && (
        <VacationDialog
          existing={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <Dialog title="Delete vacation" onClose={() => setDeleting(null)}>
          <p>
            Delete{" "}
            {deleting.label || `${fmt(deleting.start)} – ${fmt(deleting.end)}`}?
            Check-ins it moved can return to their original dates
            {vacationMoves(state, deleting.id).length === 0
              ? " (none were moved)"
              : ""}
            . Submitted check-ins are never moved back.
          </p>
          <div className="cd-dialog-actions">
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button onClick={() => remove(deleting, false)}>
              Keep new dates
            </Button>
            <Button primary onClick={() => remove(deleting, true)}>
              Delete and restore dates
            </Button>
          </div>
        </Dialog>
      )}
    </SettingsCard>
  );
}

function VacationDialog({
  existing,
  onClose,
}: {
  existing?: Vacation;
  onClose: () => void;
}) {
  const { state, setState, toast, now } = useCoach();
  const { formatDate } = useDisplay();
  const [start, setStart] = useState(existing?.start ?? "");
  const [end, setEnd] = useState(existing?.end ?? "");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [autoEnabled, setAutoEnabled] = useState(
    existing?.autoMessage?.enabled ?? true,
  );
  const [autoText, setAutoText] = useState(
    existing?.autoMessage?.text ?? AUTO_MESSAGE_DEFAULT,
  );
  const [notify, setNotify] = useState(true);
  const vacId = useMemo(() => existing?.id ?? uid("vacation"), [existing?.id]);
  const fmt = (d: string) =>
    formatDate(d, { weekday: "short", day: "numeric", month: "short" });

  // Rows: check-ins inside the dates, plus restore candidates — events this
  // vacation moved whose original date falls outside the edited range.
  const rows = useMemo<Row[]>(() => {
    if (!start || !end || start > end) return [];
    const inside = affectedCheckIns(state, start, end, now);
    const restoreOnly: Row[] = [];
    for (const m of vacationMoves(state, vacId)) {
      if (m.from >= start && m.from <= end) continue;
      const event =
        affectedCheckIns(state, m.from, m.from, now)[0]?.event ??
        affectedCheckIns(state, m.to ?? m.from, m.to ?? m.from, now).find(
          (r) => r.event.id === m.eventId,
        )?.event;
      if (event)
        restoreOnly.push({
          event,
          submitted: !!event.submission,
          restoreOnly: true,
        });
    }
    return [...inside, ...restoreOnly];
  }, [state, start, end, now, vacId]);

  const [choices, setChoices] = useState<Record<string, RowChoice>>({});
  const choiceFor = (row: Row): RowChoice => {
    const stored = choices[row.event.id];
    if (stored) return stored;
    const m = vacationMoves(state, vacId).find(
      (x) => x.eventId === row.event.id,
    );
    if (row.restoreOnly) return { choice: "keep" };
    if (m) {
      if (m.to === null) return { choice: "skip" };
      const before = proposedDate(
        { choice: "before" },
        row.event,
        { start, end },
        state.preferences,
      );
      const after = proposedDate(
        { choice: "after" },
        row.event,
        { start, end },
        state.preferences,
      );
      if (m.to === before) return { choice: "before" };
      if (m.to === after) return { choice: "after" };
      return { choice: "date", date: m.to };
    }
    return { choice: "after" }; // handoff default: first working day back
  };
  const setChoice = (eventId: string, row: RowChoice) =>
    setChoices((c) => ({ ...c, [eventId]: row }));

  const proposals = rows.map((row) => ({
    event: row.event,
    // Submitted check-ins are read-only and never moved, whatever the
    // default choice would suggest.
    submitted: row.submitted,
    to: row.submitted
      ? "keep"
      : row.restoreOnly
        ? // "Restore" removes the move (no new record); "Keep at"
          // re-creates it on the current date after old moves are dropped.
          choiceFor(row).choice === "skip"
          ? "keep"
          : row.event.date
        : proposedDate(
            choiceFor(row),
            row.event,
            { start, end },
            state.preferences,
          ),
  }));
  const clashes = moveClashes(state, proposals, formatDate, now);
  const dateError =
    !start || !end
      ? "Pick the first and last day away."
      : start > end
        ? "The last day must be on or after the first day."
        : "";
  const canSave = !dateError && clashes.size === 0;
  const changedCount = proposals.filter((p) => p.to !== "keep").length;

  const save = () => {
    const vacation: Vacation = {
      id: vacId,
      start,
      end,
      ...(label.trim() ? { label: label.trim() } : {}),
      autoMessage: { enabled: autoEnabled, text: autoText },
    };
    const moves = planMoves(proposals, vacId);
    // Submitted rows are read-only: they never produce moves, and their
    // existing move records stay so the filed submission keeps its date.
    const touchedEventIds = new Set(
      proposals.filter((p) => !p.submitted).map((p) => p.event.id),
    );
    const priorVacation = existing;
    const priorMoves = vacationMoves(state, vacId);
    const coachDay = zonedToday(resolvedTimeZone(state.preferences), now);
    const notices = notify
      ? reschedulingMessages(state, vacation, proposals, formatDate, coachDay)
      : [];
    const noticeIds = new Set(notices.map((m) => m.id));
    setState((s) => ({
      ...s,
      preferences: {
        ...s.preferences,
        vacations: [
          ...(s.preferences.vacations ?? []).filter((v) => v.id !== vacId),
          vacation,
        ],
      },
      // This vacation's choices replace its previous moves on the touched
      // events; every other move — from other vacations or made later — is
      // left alone.
      checkInMoves: [
        ...(s.checkInMoves ?? []).filter(
          (m) => !(m.vacationId === vacId && touchedEventIds.has(m.eventId)),
        ),
        ...moves,
      ],
      messages: [...s.messages, ...notices],
    }));
    onClose();
    toast("Vacation saved", () => {
      // Undo scopes to exactly this save: the record reverts only if it is
      // still what we wrote, save-created moves are removed and replaced
      // ones restored without touching later reschedules, and only the
      // notices this save created are dropped.
      setState((s) =>
        undoVacationSave(s, {
          vacation,
          priorVacation,
          savedMoves: moves,
          priorMoves,
          messageIds: noticeIds,
        }),
      );
    });
  };

  const clientsByName = (id: string) =>
    state.clients.find((c) => c.id === id)?.name ?? id;
  return (
    <Dialog
      title={existing ? "Edit vacation" : "Add vacation"}
      onClose={onClose}
      wide
    >
      <div className="cd-vacation-form">
        <h3>Dates</h3>
        <DateRangePicker
          label="First and last day away"
          start={start}
          end={end}
          onStartChange={setStart}
          onEndChange={setEnd}
          error={dateError || undefined}
        />
        <TextArea
          label="Label (optional)"
          value={label}
          rows={1}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Summer break"
        />
        {start && end && start <= end && (
          <p className="cd-caption">
            Back on {fmt(vacationBackDay(state.preferences, { end }))}
          </p>
        )}

        <h3>Affected check-ins</h3>
        {!dateError && rows.length === 0 && (
          <p className="cd-caption">No check-ins fall in this period.</p>
        )}
        {rows.filter((r) => !r.submitted && !r.restoreOnly).length > 1 && (
          <Select
            label="Move all"
            value=""
            onChange={(v) => {
              const next = { ...choices };
              for (const r of rows)
                if (!r.submitted && !r.restoreOnly)
                  next[r.event.id] = { choice: v as MoveChoice };
              setChoices(next);
            }}
            options={[
              { value: "", label: "Choose…" },
              ...CHOICES.filter((c) => c.value !== "date"),
            ]}
          />
        )}
        <ul className="cd-vacation-rows">
          {rows.map((row) => {
            const choice = choiceFor(row);
            const to = proposals.find((p) => p.event.id === row.event.id)?.to;
            const clash = clashes.get(row.event.id);
            return (
              <li key={row.event.id} className="cd-vacation-checkin">
                <span className="cd-vacation-who">
                  <strong>{clientsByName(row.event.clientId)}</strong>
                  <span className="cd-caption">
                    {fmt(row.event.movedFrom ?? row.event.date)}
                    {row.restoreOnly
                      ? ` → currently ${fmt(row.event.date)}`
                      : ""}
                  </span>
                </span>
                {row.submitted ? (
                  <span className="cd-caption">Submitted</span>
                ) : row.restoreOnly ? (
                  <Select
                    label={`Restore or keep ${clientsByName(row.event.clientId)}`}
                    value={choice.choice}
                    onChange={(v) =>
                      setChoice(row.event.id, { choice: v as MoveChoice })
                    }
                    options={[
                      {
                        value: "keep",
                        label: `Keep at ${fmt(row.event.date)}`,
                      },
                      {
                        value: "skip",
                        label: `Restore to ${fmt(row.event.movedFrom ?? row.event.date)}`,
                      },
                    ]}
                  />
                ) : (
                  <>
                    <Select
                      label={`Check-in for ${clientsByName(row.event.clientId)}`}
                      value={choice.choice}
                      onChange={(v) =>
                        setChoice(row.event.id, {
                          choice: v as MoveChoice,
                          date: choice.date,
                        })
                      }
                      options={CHOICES}
                    />
                    {choice.choice === "date" && (
                      <DatePicker
                        label="New date"
                        value={choice.date ?? ""}
                        onValueChange={(v) =>
                          setChoice(row.event.id, { choice: "date", date: v })
                        }
                      />
                    )}
                    <span
                      className={clash ? "cd-settings-error" : "cd-caption"}
                      role={clash ? "alert" : undefined}
                    >
                      {clash ??
                        (to === "keep"
                          ? "Stays put"
                          : to === null
                            ? "Skipped"
                            : `→ ${fmt(to as string)}`)}
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        <h3>Away message</h3>
        <Toggle
          label="Send an automatic reply while away"
          checked={autoEnabled}
          onChange={setAutoEnabled}
        />
        {autoEnabled && (
          <>
            <TextArea
              label="Automatic reply"
              value={autoText}
              rows={3}
              onChange={(e) => setAutoText(e.target.value)}
            />
            {start && end && (
              <p className="cd-caption cd-vacation-preview">
                Preview:{" "}
                {fillAutoMessage(
                  autoText,
                  { start, end },
                  state.preferences,
                  formatDate,
                )}
              </p>
            )}
          </>
        )}
        {changedCount > 0 && (
          <Toggle
            label="Tell affected athletes about their new check-in date"
            checked={notify}
            onChange={setNotify}
          />
        )}

        <div className="cd-dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button primary disabled={!canSave} onClick={save}>
            {clashes.size > 0 ? "Resolve clashes to save" : "Save vacation"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
