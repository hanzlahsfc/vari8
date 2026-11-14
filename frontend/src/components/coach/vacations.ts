import {
  addDays,
  type CheckInMove,
  type CoachState,
  type Event,
  eventsBetween,
  type Message,
  resolvedTimeZone,
  resolvedWorkingHours,
  uid,
  vacationFor,
  zonedToday,
} from "./model";

export type Vacation = NonNullable<
  CoachState["preferences"]["vacations"]
>[number];
export type MoveChoice = "before" | "after" | "date" | "skip" | "keep";
export type RowChoice = { choice: MoveChoice; date?: string };

/** First day strictly after `date` that has at least one working range —
 * the handoff's "Back on …" day. */
export function firstWorkingDayAfter(
  preferences: Pick<CoachState["preferences"], "workingHours">,
  date: string,
): string {
  const hours = resolvedWorkingHours(preferences);
  for (let i = 1; i <= 370; i += 1) {
    const d = addDays(date, i);
    const weekday = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
    if ((hours.find((h) => h.weekday === weekday)?.ranges.length ?? 0) > 0)
      return d;
  }
  return addDays(date, 1);
}
/** Last day strictly before `date` that has at least one working range. */
export function lastWorkingDayBefore(
  preferences: Pick<CoachState["preferences"], "workingHours">,
  date: string,
): string {
  const hours = resolvedWorkingHours(preferences);
  for (let i = 1; i <= 370; i += 1) {
    const d = addDays(date, -i);
    const weekday = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
    if ((hours.find((h) => h.weekday === weekday)?.ranges.length ?? 0) > 0)
      return d;
  }
  return addDays(date, -1);
}
/** "Back on Mon 27 Oct" — first working day after the vacation ends. */
export function vacationBackDay(
  preferences: Pick<CoachState["preferences"], "workingHours">,
  vacation: Pick<Vacation, "end">,
): string {
  return firstWorkingDayAfter(preferences, vacation.end);
}

/** Every scheduled check-in inside [start, end], marked submitted when a
 * submission already exists — those are listed read-only and never moved. */
export function affectedCheckIns(
  state: CoachState,
  start: string,
  end: string,
  now: Date = new Date(),
): { event: Event; submitted: boolean }[] {
  return eventsBetweenForVacation(state, start, end, now)
    .filter((e) => e.date >= start && e.date <= end)
    .map((event) => ({ event, submitted: !!event.submission }))
    .sort((a, b) => {
      const client = (id: string) =>
        state.clients.find((c) => c.id === id)?.name ?? id;
      return (
        client(a.event.clientId).localeCompare(client(b.event.clientId)) ||
        a.event.date.localeCompare(b.event.date)
      );
    });
}
/** Events on a single client/date — used for clash checks. */
export function eventsOn(
  state: CoachState,
  clientId: string,
  date: string,
  now: Date = new Date(),
): Event[] {
  return eventsBetweenForVacation(state, date, date, now).filter(
    (e) => e.clientId === clientId,
  );
}
const eventsBetweenForVacation = (
  state: CoachState,
  start: string,
  end: string,
  now: Date,
) => eventsBetween(state, start, end, now);

/** Resolve a row choice to a target date: the resulting date, null for a
 * skip, or "keep" when the check-in stays where it is. */
export function proposedDate(
  row: RowChoice,
  _event: Event,
  vacation: Pick<Vacation, "start" | "end">,
  preferences: Pick<CoachState["preferences"], "workingHours">,
): string | null | "keep" {
  switch (row.choice) {
    case "before":
      return lastWorkingDayBefore(preferences, vacation.start);
    case "after":
      return vacationBackDay(preferences, vacation);
    case "date":
      return row.date ?? "keep";
    case "skip":
      return null;
    case "keep":
      return "keep";
  }
}
/** Clash text per event id: a proposed date that already has a check-in
 * for that athlete (or that another proposal lands on) blocks saving. */
export function moveClashes(
  state: CoachState,
  proposals: { event: Event; to: string | null | "keep" }[],
  formatDate: (date: string, o?: Intl.DateTimeFormatOptions) => string,
  now: Date = new Date(),
): Map<string, string> {
  const clashes = new Map<string, string>();
  const taken = new Map<string, string>(); // `${clientId}|${to}` -> eventId
  for (const { event, to } of proposals) {
    if (to === null || to === "keep") continue;
    const key = `${event.clientId}|${to}`;
    const holder = taken.get(key);
    if (holder) {
      clashes.set(
        event.id,
        `Two check-ins would land on ${formatDate(to, { weekday: "short", day: "numeric", month: "short" })}`,
      );
      continue;
    }
    taken.set(key, event.id);
    const existing = eventsOn(state, event.clientId, to, now).find(
      (e) => e.id !== event.id,
    );
    if (existing)
      clashes.set(
        event.id,
        `Already has a check-in on ${formatDate(to, { weekday: "short", day: "numeric", month: "short" })}`,
      );
  }
  return clashes;
}

/** Turn the editor's row choices into CheckInMove records for one vacation;
 * "keep" and "restore" clear any move owned by this vacation on that event. */
export function planMoves(
  proposals: { event: Event; to: string | null | "keep" }[],
  vacationId: string,
): CheckInMove[] {
  const moves: CheckInMove[] = [];
  for (const { event, to } of proposals) {
    if (to === "keep") continue;
    moves.push({
      eventId: event.id,
      clientId: event.clientId,
      from: event.movedFrom ?? event.date,
      to,
      vacationId,
    });
  }
  return moves;
}
/** Moves owned by a vacation. */
export function vacationMoves(
  state: CoachState,
  vacationId: string,
): CheckInMove[] {
  return (state.checkInMoves ?? []).filter((m) => m.vacationId === vacationId);
}
/** Remove a vacation's moves and only the messages it created; unrelated
 * edits made afterwards (other moves, other messages) are untouched. */
export function undoVacationSave(
  state: CoachState,
  vacationId: string,
): CoachState {
  return {
    ...state,
    checkInMoves: (state.checkInMoves ?? []).filter(
      (m) => m.vacationId !== vacationId,
    ),
    messages: state.messages.filter((m) => m.vacationId !== vacationId),
  };
}

export const AUTO_MESSAGE_DEFAULT =
  "I'm away from {start} to {end} and back on {return}. I'll reply to your message when I'm back. Keep following your current plan as written.";
/** Fill the {start} {end} {return} placeholders with formatted dates. */
export function fillAutoMessage(
  text: string,
  vacation: Pick<Vacation, "start" | "end">,
  preferences: Pick<CoachState["preferences"], "workingHours">,
  formatDate: (date: string, o?: Intl.DateTimeFormatOptions) => string,
): string {
  const fmt = (d: string) =>
    formatDate(d, { weekday: "short", day: "numeric", month: "short" });
  return text
    .replaceAll("{start}", fmt(vacation.start))
    .replaceAll("{end}", fmt(vacation.end))
    .replaceAll("{return}", fmt(vacationBackDay(preferences, vacation)));
}
/** One rescheduling notice per affected athlete whose check-ins changed. */
export function reschedulingMessages(
  _state: CoachState,
  vacation: Vacation,
  proposals: { event: Event; to: string | null | "keep" }[],
  formatDate: (date: string, o?: Intl.DateTimeFormatOptions) => string,
  today: string,
): Message[] {
  const fmt = (d: string) =>
    formatDate(d, { weekday: "short", day: "numeric", month: "short" });
  const byClient = new Map<string, string[]>();
  for (const { event, to } of proposals) {
    if (to === "keep") continue;
    const from = event.movedFrom ?? event.date;
    const line =
      to === null
        ? `Your check-in on ${fmt(from)} is skipped while I'm away (${fmt(vacation.start)} to ${fmt(vacation.end)}).`
        : `Your check-in on ${fmt(from)} moves to ${fmt(to)} because I'm away.`;
    byClient.set(event.clientId, [
      ...(byClient.get(event.clientId) ?? []),
      line,
    ]);
  }
  return [...byClient.entries()].map(([clientId, lines]) => ({
    id: uid("msg"),
    clientId,
    text: lines.join("\n"),
    from: "coach",
    date: today,
    read: false,
    priority: false,
    attachments: [],
    vacationId: vacation.id,
  }));
}
/** The away auto-reply for a conversation, or null when none is due: the
 * athlete must write during the vacation and each conversation gets the
 * reply at most once per vacation (deduplicated by message.vacationId). */
export function vacationAutoReply(
  state: CoachState,
  clientId: string,
  today: string,
  formatDate: (date: string, o?: Intl.DateTimeFormatOptions) => string,
): Message | null {
  const vacation = vacationFor(state.preferences, today);
  if (!vacation?.autoMessage?.enabled) return null;
  const already = state.messages.some(
    (m) =>
      m.clientId === clientId &&
      m.auto === "vacation" &&
      m.vacationId === vacation.id,
  );
  if (already) return null;
  return {
    id: uid("msg"),
    clientId,
    text: fillAutoMessage(
      vacation.autoMessage.text,
      vacation,
      state.preferences,
      formatDate,
    ),
    from: "coach",
    date: today,
    read: false,
    priority: false,
    attachments: [],
    auto: "vacation",
    vacationId: vacation.id,
  };
}
/** Scheduled check-ins that fall inside a vacation but were never
 * rescheduled (e.g. a schedule change landed them there later): these get
 * the "During your vacation" chip and the reschedule row controls. */
export function unresolvedVacationEvents(
  state: CoachState,
  now: Date = new Date(),
): Event[] {
  const vacations = state.preferences.vacations ?? [];
  if (vacations.length === 0) return [];
  const movedIds = new Set((state.checkInMoves ?? []).map((m) => m.eventId));
  const from = vacations.reduce(
    (d, v) => (v.start < d ? v.start : d),
    zonedToday(resolvedTimeZone(state.preferences), now),
  );
  const to = vacations.reduce((d, v) => (v.end > d ? v.end : d), from);
  return eventsBetween(state, from, to, now).filter(
    (e) =>
      !e.submission &&
      !movedIds.has(e.id) &&
      vacationFor(state.preferences, e.date),
  );
}
