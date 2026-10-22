// Check-ins domain provider (PR-W0 owns the slice; PR-W6 wires transport).
// The slice below still extracts/merges exactly what it did, so the store's
// hydration contract does not move. PR-W6 adds the server reads and writes on
// top: the board renders from `/api/v1/.../checkins`, and the write call sites
// in `coach/check-ins.tsx` go through these functions instead of mutating
// localStorage-only state.
//
// Mapping rules, all derived from measured server fields:
// - `Schedule` (the projection the board paints forward) folds ACTIVE
//   `CheckInScheduleRule` rows by `startDate`; one rule per weekday becomes one
//   `weekdays` entry, exactly what `eventsBetween` expects, and paused/ended
//   rules stop projecting future dates.
// - Classification folds every rule whatever its `status`: an instance or
//   submission generated under a since-paused/ended rule is still a rule
//   occurrence and keeps its real type, instead of decaying into a removable
//   Custom row.
// - An instance is a recurring occurrence when its Europe/Vienna date matches
//   the latest segment in force, the same rule the canvas applies. Everything
//   else is an Additional date (`Extra`).
// - `CheckInInstance` has no `origin` column and no Full/Custom column (Q3), so
//   an additional date renders Custom and a recurring occurrence Full; the
//   seed labels its two cases the same way.

import type {
  Extra,
  ReviewDraft,
  Schedule,
  Submission,
} from "../coach/model";
import type { CoachSlice } from "./provider";
import { apiFetch } from "./http";
import { resolveLocalInstant } from "@/lib/checkin/timezone";

export const CHECKINS_KEY = "coach-data-checkins-v1";

type CheckinsData = {
  extras: Extra[];
  submissions: Submission[];
  reviewDrafts: Record<string, ReviewDraft>;
  /** Recurring check-in weekdays per client id. */
  schedules: Record<string, Schedule[]>;
};

export const checkinsSlice: CoachSlice = {
  key: CHECKINS_KEY,
  extract: (state): CheckinsData => ({
    extras: state.extras,
    submissions: state.submissions,
    reviewDrafts: state.reviewDrafts,
    schedules: Object.fromEntries(
      state.clients.map((client) => [client.id, client.schedules]),
    ),
  }),
  merge: (slice, state) => {
    if (!slice || typeof slice !== "object")
      throw new Error("Invalid check-ins slice");
    const data = slice as Partial<CheckinsData>;
    state.extras = data.extras as Extra[];
    state.submissions = data.submissions as Submission[];
    state.reviewDrafts = data.reviewDrafts as Record<string, ReviewDraft>;
    if (data.schedules && typeof data.schedules === "object")
      for (const client of state.clients)
        if (client.id in data.schedules)
          client.schedules = data.schedules[client.id];
  },
};

/* -------------------------------------------------------------------------
 * Server shapes (only the fields this provider reads)
 * ---------------------------------------------------------------------- */

type ScheduleRuleItem = {
  ruleId: string;
  formId: string;
  weekday: string;
  startDate: string;
  endDate: string | null;
  status: "ACTIVE" | "PAUSED" | "ENDED";
};

type InstanceItem = {
  instanceId: string;
  formId: string;
  formName: string;
  versionSeq: number;
  dueAt: string;
  dueTz: string | null;
  coachNote: string | null;
  state: string;
  submittedAt: string | null;
};

type SubmissionItem = {
  instanceId: string;
  submissionId: string;
  formName: string;
  dueAt: string;
  submittedAt: string;
  reviewedAt: string | null;
};

type SubmissionField = {
  kind: string;
  label: string;
  display: string;
  mediaIds: string[];
};

type SubmissionDetail = {
  submissionId: string;
  fields: SubmissionField[];
  feedback: { body: string; sentAt: string }[] | null;
};

/* -------------------------------------------------------------------------
 * Pure mapping helpers (unit-tested; they carry the date rule)
 * ---------------------------------------------------------------------- */

const WEEKDAY_INDEX: Record<string, number> = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6,
};

/** Europe/Vienna local date (`YYYY-MM-DD`) of an ISO instant. */
export function viennaDate(instant: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

/**
 * Fold rules into canvas `Schedule` segments: one segment per distinct
 * `startDate`, carrying every weekday requested from that date on. Segments are
 * the forward projection, so this one keeps the ACTIVE filter; classification
 * uses `foldScheduleHistory`.
 */
export function foldScheduleRules(
  rules: { weekday: string; startDate: string; status: string }[],
): Schedule[] {
  return foldSegments(rules.filter((rule) => rule.status === "ACTIVE"));
}

/**
 * Fold every rule regardless of `status`. An instance materialized under a rule
 * that has since been paused or ended is still that rule's occurrence, so
 * classifying it (rule occurrence vs additional date) must not look at the
 * lifecycle column; only the projection does.
 */
export function foldScheduleHistory(
  rules: { weekday: string; startDate: string; status: string }[],
): Schedule[] {
  return foldSegments(rules);
}

function foldSegments(
  rules: { weekday: string; startDate: string }[],
): Schedule[] {
  const byStart = new Map<string, Set<number>>();
  for (const rule of rules) {
    const day = WEEKDAY_INDEX[rule.weekday];
    if (day === undefined) continue;
    const days = byStart.get(rule.startDate) ?? new Set<number>();
    days.add(day);
    byStart.set(rule.startDate, days);
  }
  return [...byStart.entries()]
    .map(([effective, days]) => ({
      effective,
      weekdays: [...days].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.effective.localeCompare(b.effective));
}

/** The schedule segment in force on `date` (latest `effective` not after it). */
export function scheduleOn(
  schedules: Schedule[],
  date: string,
): Schedule | undefined {
  return [...schedules]
    .sort((a, b) => b.effective.localeCompare(a.effective))
    .find((segment) => segment.effective <= date);
}

/** Weekday index of a `YYYY-MM-DD` date, Monday = 0 (canvas convention). */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** True when `date` is a recurring occurrence produced by the schedule. */
export function isRuleOccurrence(
  schedules: Schedule[],
  date: string,
): boolean {
  const segment = scheduleOn(schedules, date);
  return segment ? segment.weekdays.includes(weekdayIndex(date)) : false;
}

/** Canvas event id for a recurring occurrence; submissions match on it. */
export function recurringEventId(clientId: string, date: string): string {
  return `recurring:${clientId}:${date}`;
}

export type CheckinInstanceRow = InstanceItem;

/* -------------------------------------------------------------------------
 * Reads
 * ---------------------------------------------------------------------- */

export type CheckinLoadInput = {
  workspaceId: string;
  /** Canvas range (`YYYY-MM-DD`, inclusive). */
  from: string;
  to: string;
  clients: { id: string; name: string }[];
  /** Canvas client name -> server `clientProfileId` (roster-backed). */
  profileIdFor: (name: string) => Promise<string | null>;
};

/** `YYYY-MM-DD` + n days, UTC calendar arithmetic. */
function plusDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Europe/Vienna local midnight for `date`, as the strict ISO-8601 UTC instant
 * the calendar read requires. `resolveLocalInstant` is the repo's DST-aware
 * wall-clock resolver, so the range starts at 00:00 local rather than 00:00Z
 * (which is 02:00 local in summer, 01:00 in winter, and silently drops the
 * first hours of the visible day).
 */
function viennaMidnight(date: string): string {
  const local = resolveLocalInstant("Europe/Vienna", date, 0);
  if (local.status !== "ok")
    throw new Error(`Invalid check-in range date: ${date}`);
  return local.instant.toISOString();
}

/** A board patch: the rows a read returned, merged with what it kept. */
export type CheckinMerge = {
  extras: Extra[];
  submissions: Submission[];
};

/**
 * Merge a load into what the board already shows. A client whose read failed
 * keeps its previous rows: replacing the slice wholesale would read as "this
 * athlete has no check-ins" while the toast only says the read failed.
 */
export function mergeCheckinLoad(
  current: CheckinMerge,
  loaded: CheckinMerge,
  failedClientIds: string[],
): CheckinMerge {
  const keep = new Set(failedClientIds);
  const loadedSubmissionIds = new Set(loaded.submissions.map((s) => s.id));
  return {
    extras: [
      ...loaded.extras,
      ...current.extras.filter((extra) => keep.has(extra.clientId)),
    ],
    submissions: [
      ...loaded.submissions.map((item) => {
        // The header list is answer-free; a detail read already in memory is
        // richer than what a reload returns, so keep it.
        const previous = current.submissions.find((s) => s.id === item.id);
        return previous && previous.answers.length > 0
          ? {
              ...item,
              answers: previous.answers,
              visuals: previous.visuals,
              response: previous.response,
            }
          : item;
      }),
      ...current.submissions.filter(
        (s) => keep.has(s.clientId) && !loadedSubmissionIds.has(s.id),
      ),
    ],
  };
}

export type CheckinLoad = {
  extras: Extra[];
  submissions: Submission[];
  /** Canvas instance id -> the server row a cancel can restore from. */
  instances: Record<string, InstanceItem>;
  schedules: Record<string, Schedule[]>;
  /** Clients whose read failed, by name. A failure is surfaced, not hidden. */
  failed: string[];
};

/**
 * One bounded read per client for the calendar range, plus the answer-free
 * submission list and the schedule rules. Reads are per client because the
 * server scopes every check-in read to one `clientProfileId`; a client the
 * roster cannot resolve is reported in `failed` and left untouched.
 */
export async function loadCheckins(
  input: CheckinLoadInput,
): Promise<CheckinLoad> {
  const extras: Extra[] = [];
  const submissions: Submission[] = [];
  const instances: Record<string, InstanceItem> = {};
  const schedules: Record<string, Schedule[]> = {};
  const failed: string[] = [];
  // The calendar service takes strict ISO-8601 UTC instants; the board's range
  // is a local day range, so both bounds are Vienna midnights.
  const from = viennaMidnight(input.from);
  const to = viennaMidnight(plusDays(input.to, 1));

  for (const client of input.clients) {
    const clientProfileId = await input.profileIdFor(client.name);
    if (!clientProfileId) {
      failed.push(client.name);
      continue;
    }
    const base = `/workspaces/${input.workspaceId}/checkins`;
    const query = `clientProfileId=${encodeURIComponent(clientProfileId)}`;
    try {
      const [rules, calendar, subs] = await Promise.all([
        apiFetch<{ items: ScheduleRuleItem[] }>(
          `${base}/schedule-rules?${query}`,
        ),
        apiFetch<{ items: InstanceItem[] }>(
          `${base}/instances?${query}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        ),
        apiFetch<{ items: SubmissionItem[] }>(`${base}/submissions?${query}`),
      ]);
      const folded = foldScheduleRules(rules.items);
      // Classification looks at every rule, not only the ACTIVE ones: history
      // under a paused or ended rule stays a rule occurrence.
      const history = foldScheduleHistory(rules.items);
      schedules[client.id] = folded;
      for (const item of calendar.items) {
        // A cancelled instance is not an additional date any more. The calendar
        // read returns CANCELLED rows on purpose (the board may need them for
        // history), so the board must not re-materialise one as an extra: the
        // cancel path reloads the range, and the chip would come straight back.
        if (item.state === "CANCELLED") continue;
        const date = viennaDate(item.dueAt);
        if (isRuleOccurrence(history, date)) continue;
        instances[item.instanceId] = item;
        extras.push({
          id: item.instanceId,
          clientId: client.id,
          date,
          type: "Custom",
          note: item.coachNote ?? "",
        });
      }
      for (const item of subs.items) {
        const date = viennaDate(item.dueAt);
        const recurring = isRuleOccurrence(history, date);
        const type = recurring ? "Full" : "Custom";
        submissions.push({
          id: item.submissionId,
          clientId: client.id,
          date,
          eventId: recurring
            ? recurringEventId(client.id, date)
            : item.instanceId,
          type,
          answers: [],
          visuals: [],
          note: "",
          // The server carries no parameter values in this DTO and no flags
          // column at all, so a real submission starts empty here. The review
          // screen fills the parameter rows from `loadTrackerContext` for the
          // check-in date; the flagged-notes panel draws its empty branch.
          metrics: [],
          flags: [],
          // A reviewed submission has its feedback sent; the header DTO carries
          // `reviewedAt` and never the body, so the board marks it sent from
          // the server field and the detail read fills the text on open.
          // Without this every answered check-in reads as awaiting feedback
          // after a reload, because the status derives from `response`.
          ...(item.reviewedAt
            ? {
                response: {
                  text: "",
                  changes: [],
                  date: viennaDate(item.reviewedAt),
                },
              }
            : {}),
        });
      }
    } catch {
      failed.push(client.name);
    }
  }
  // A total failure (feature gate closed, session lost, every roster name
  // unmatched) must leave the board as it is. Returning an empty patch would
  // blank a screen that is showing real data, which reads as "no check-ins"
  // rather than "the read failed".
  if (input.clients.length > 0 && failed.length === input.clients.length)
    throw new Error("No check-in client could be read");
  return { extras, submissions, instances, schedules, failed };
}

/** Answers, visuals and the sent body for one submission (audited detail read). */
export async function loadSubmissionAnswers(
  input: {
    workspaceId: string;
    clientProfileId: string;
    submissionId: string;
  },
  submission: Submission,
): Promise<Submission> {
  const detail = await apiFetch<SubmissionDetail>(
    `/workspaces/${input.workspaceId}/checkins/submissions/${input.submissionId}?clientProfileId=${encodeURIComponent(input.clientProfileId)}`,
  );
  const sent = detail.feedback?.[detail.feedback.length - 1];
  return {
    ...submission,
    // A media field is not a text answer: base rendered its media in the
    // visuals grid below, so mapping it here would draw a second, empty Q&A.
    answers: detail.fields
      .filter((field) => field.kind !== "visual")
      .map((field) => ({
        question: field.label,
        answer: field.display,
      })),
    visuals: detail.fields.flatMap((field) => field.mediaIds),
    response: sent
      ? {
          text: sent.body,
          changes: submission.response?.changes ?? [],
          date: viennaDate(sent.sentAt),
        }
      : submission.response,
  };
}

/** One tracker value for the check-in date, display-ready (server-rendered). */
export type TrackerContextValue = {
  parameterKey: string;
  label: string;
  unit: string | null;
  display: string;
};

/**
 * The explicit DailyEntry tracker read for one submission's check-in date. A
 * missing entry is `not_available` (403), which rejects like any other failed
 * read; the caller draws its empty branch rather than another date's values.
 */
export async function loadTrackerContext(input: {
  workspaceId: string;
  clientProfileId: string;
  submissionId: string;
  entryDate: string;
}): Promise<TrackerContextValue[]> {
  const detail = await apiFetch<{ values: TrackerContextValue[] }>(
    `/workspaces/${input.workspaceId}/checkins/submissions/${input.submissionId}/tracker-context?clientProfileId=${encodeURIComponent(input.clientProfileId)}&entryDate=${encodeURIComponent(input.entryDate)}`,
  );
  return detail.values;
}

/* -------------------------------------------------------------------------
 * Writes
 * ---------------------------------------------------------------------- */

/**
 * Cancel an additional date. Returns a restore callback that re-creates it from
 * the same form's latest published version (the instance row carries no version
 * id), so the toast undo is a real server write rather than a local ghost.
 */
export async function cancelExtra(input: {
  workspaceId: string;
  clientProfileId: string;
  instance: InstanceItem;
}): Promise<() => Promise<void>> {
  const base = `/workspaces/${input.workspaceId}/checkins`;
  await apiFetch(`${base}/instances/${input.instance.instanceId}/cancel`, {
    body: { clientProfileId: input.clientProfileId },
  });
  return async () => {
    const versions = await apiFetch<{
      options: {
        position: number;
        formId: string;
        formVersionId: string;
        versionSeq: number;
      }[];
    }>(
      `${base}/schedule-versions?clientProfileId=${encodeURIComponent(input.clientProfileId)}`,
    );
    const latest = [...versions.options]
      .sort((a, b) => b.versionSeq - a.versionSeq)
      .find((option) => option.formId === input.instance.formId);
    if (!latest) throw new Error("No schedulable form version to restore from");
    await apiFetch(`${base}/instances`, {
      body: {
        clientProfileId: input.clientProfileId,
        formId: input.instance.formId,
        formVersionId: latest.formVersionId,
        dueAt: input.instance.dueAt,
        dueTz: input.instance.dueTz,
        coachNote: input.instance.coachNote,
      },
    });
  };
}

/**
 * Mark reviewed then send feedback as one user action: the send is refused
 * server-side until an acknowledgement exists (#96), so the review call runs
 * first. `clientRequestId` is the idempotency anchor for a retry of the same
 * draft (a second click cannot double-send).
 */
export async function sendFeedback(input: {
  workspaceId: string;
  clientProfileId: string;
  submissionId: string;
  body: string;
  clientRequestId: string;
}): Promise<void> {
  const base = `/workspaces/${input.workspaceId}/checkins/submissions/${input.submissionId}`;
  await apiFetch(`${base}/review`, {
    body: { clientProfileId: input.clientProfileId },
  });
  await apiFetch(`${base}/feedback`, {
    body: {
      clientProfileId: input.clientProfileId,
      body: input.body,
      clientRequestId: input.clientRequestId,
    },
  });
}
