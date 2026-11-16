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
 * for that athlete (or that another proposal lands on) blocks saving.
 * Destinations are judged against the batch's final schedule: an event
 * moving, restoring or skipping away from a date frees it in the same
 * save. `final` carries the event's resolved position when the caller
 * knows it (restore rows); otherwise keep stays put, null is gone and a
 * string `to` is the destination. */
export function moveClashes(
  state: CoachState,
  proposals: {
    event: Event;
    to: string | null | "keep";
    final?: string | null;
  }[],
  formatDate: (date: string, o?: Intl.DateTimeFormatOptions) => string,
  now: Date = new Date(),
): Map<string, string> {
  const clashes = new Map<string, string>();
  const taken = new Map<string, string>(); // `${clientId}|${to}` -> eventId
  const vacating = new Set(
    proposals
      .filter(
        (p) =>
          (p.final ?? (p.to === "keep" ? p.event.date : p.to)) !== p.event.date,
      )
      .map((p) => p.event.id),
  );
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
      (e) => e.id !== event.id && !vacating.has(e.id),
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
/** Undo exactly one vacation save. The vacation record reverts only when
 * it still matches what that save wrote (a later edit wins); save-created
 * move records are removed and the moves they replaced restored, but a
 * later reschedule of the same occurrence — even one carrying the same
 * vacation id — is preserved; only the exact notice messages the save
 * created are dropped, so later athlete messages and automatic replies
 * survive. */
export function undoVacationSave(
  state: CoachState,
  save: {
    /** Record this save wrote — the undo only reverts when it is still
     * the stored record verbatim. */
    vacation: Vacation;
    /** Record it replaced; omitted when the save added the vacation. */
    priorVacation?: Vacation;
    /** Move records this save created. */
    savedMoves: CheckInMove[];
    /** Move records it replaced, used to restore prior dates. */
    priorMoves: CheckInMove[];
    /** Exact notice message ids created by this save. */
    messageIds?: ReadonlySet<string>;
  },
): CoachState {
  const current = (state.preferences.vacations ?? []).find(
    (v) => v.id === save.vacation.id,
  );
  const stillSaved =
    current && JSON.stringify(current) === JSON.stringify(save.vacation);
  const prior = save.priorVacation;
  const vacations = stillSaved
    ? prior
      ? (state.preferences.vacations ?? []).map((v) =>
          v.id === save.vacation.id ? prior : v,
        )
      : (state.preferences.vacations ?? []).filter(
          (v) => v.id !== save.vacation.id,
        )
    : (state.preferences.vacations ?? []);
  const savedKeys = new Set(
    save.savedMoves.map((mv) => `${mv.eventId}::${mv.to ?? ""}`),
  );
  const checkInMoves: CheckInMove[] = [];
  const revertedEvents = new Set<string>();
  for (const m of state.checkInMoves ?? []) {
    const key = `${m.eventId}::${m.to ?? ""}`;
    if (m.vacationId === save.vacation.id && savedKeys.has(key)) {
      // This exact record came from the save — drop it; any different
      // record for the same occurrence is a later edit and stays.
      revertedEvents.add(m.eventId);
      continue;
    }
    checkInMoves.push(m);
  }
  for (const prior of save.priorMoves)
    if (
      revertedEvents.has(prior.eventId) &&
      !checkInMoves.some((m) => m.eventId === prior.eventId)
    )
      checkInMoves.push(prior);
  const noticeIds = save.messageIds;
  return {
    ...state,
    preferences: { ...state.preferences, vacations },
    checkInMoves,
    messages: noticeIds
      ? state.messages.filter((m) => !noticeIds.has(m.id))
      : state.messages,
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
