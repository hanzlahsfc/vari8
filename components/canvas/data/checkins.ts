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
  localTimeMinutes?: number;
  timezone?: string;
  generatedThrough?: string | null;
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
              // The header list is answer-free and flag-free: both come
              // from the audited detail read, so keep them with it.
              flags: previous.flags,
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

/* -------------------------------------------------------------------------
 * FULL-PACKAGE SLICE of #171 - review-panel read (card 06 / R2-N2)
 * ---------------------------------------------------------------------- */

/** One changed answer row in the panel's change summary (display values). */
export type CheckInAnswerChangeWire = {
  fieldId: string;
  label: string;
  kind: string;
  previous: string | null;
  current: string | null;
};

/**
 * The one-call review read: the audited submission detail (answers,
 * review state, feedback, linked media) plus the change summary against
 * the previous submission of the same form. `reviewState` carries the
 * two durable server states; `draft` stays client-local autosave.
 */
export type CheckInReviewPanelWire = {
  submissionId: string;
  instanceId: string;
  formName: string;
  versionSeq: number;
  dueAt: string;
  submittedAt: string;
  late: boolean;
  reviewed: { byName: string; at: string } | null;
  canMark: boolean;
  canSend: boolean;
  feedback: { id: string; sentAt: string; byName: string; body: string }[] | null;
  feedbackNextCursor: string | null;
  fields: {
    fieldId: string;
    label: string;
    kind: string;
    required: boolean;
    display: string;
    mediaIds: string[];
  }[];
  reviewState: "open" | "answered";
  changeSummary: {
    previousSubmissionId: string;
    previousSubmittedAt: string;
    previousFormName: string;
    added: CheckInAnswerChangeWire[];
    removed: CheckInAnswerChangeWire[];
    changed: CheckInAnswerChangeWire[];
    unchanged: number;
  } | null;
  /** Card 11/#176: set-log notes the client flagged for the coach. */
  flaggedTrainingNotes: {
    sessionLogId: string;
    performedDate: string;
    exerciseName: string;
    set: number;
    note: string;
  }[];
};

/**
 * GET submissions/:submissionId/review - the review-panel read. Returns
 * the raw wire payload plus the `Submission` patch the rest of the
 * review screen renders from (same mapping `loadSubmissionAnswers`
 * applies, fed by this read so the screen issues one audited call).
 */
export async function loadCheckInReview(
  input: {
    workspaceId: string;
    clientProfileId: string;
    submissionId: string;
  },
  submission: Submission,
): Promise<{ panel: CheckInReviewPanelWire; submission: Submission }> {
  const panel = await apiFetch<CheckInReviewPanelWire>(
    `/workspaces/${input.workspaceId}/checkins/submissions/${input.submissionId}/review?clientProfileId=${encodeURIComponent(input.clientProfileId)}`,
  );
  const sent = panel.feedback?.[panel.feedback.length - 1];
  return {
    panel,
    submission: {
      ...submission,
      answers: panel.fields
        .filter((field) => field.kind !== "visual")
        .map((field) => ({ question: field.label, answer: field.display })),
      visuals: panel.fields.flatMap((field) => field.mediaIds),
      // #176: the flagged set notes the review surface draws - the
      // server resolves exercise names through each log's pinned
      // version, so the label matches what the client logged against.
      flags: (panel.flaggedTrainingNotes ?? []).map((note) => ({
        exercise: note.exerciseName,
        set: note.set,
        date: note.performedDate,
        text: note.note,
      })),
      response: sent
        ? {
            text: sent.body,
            changes: submission.response?.changes ?? [],
            date: viennaDate(sent.sentAt),
          }
        : submission.response,
    },
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
 * Create an additional (one-off) check-in date. The server needs a
 * `formVersionId`; per Q10 the schedulable-version list is the source (latest
 * published version, no picker), and the canvas "Requested update" type maps
 * to the form by its published name — the same Custom/Full distinction the
 * board's own projection documents (an extra date has no Full/Custom column).
 */
export async function createExtra(input: {
  workspaceId: string;
  clientProfileId: string;
  date: string;
  type: "Full" | "Custom";
  note: string;
}): Promise<{ instanceId: string }> {
  const base = `/workspaces/${input.workspaceId}/checkins`;
  // Owner ruling: a Full additional date uses the client's regular weekly
  // check-in form by EXACT identity — the formId on the client's ACTIVE
  // schedule rule — never by name or inference. Custom (per-instance field
  // selection) is a separate future slice and is refused here rather than
  // provisionally mapped.
  if (input.type !== "Full")
    throw new Error(
      "Custom check-ins are not available yet; only the regular Full update can be scheduled",
    );
  const rules = await apiFetch<{ items: ScheduleRuleItem[] }>(
    `${base}/schedule-rules?clientProfileId=${encodeURIComponent(input.clientProfileId)}`,
  );
  const activeFormIds = [
    ...new Set(
      rules.items
        .filter((rule) => rule.status === "ACTIVE")
        .map((rule) => rule.formId),
    ),
  ];
  if (activeFormIds.length === 0)
    throw new Error(
      "No active check-in schedule resolves the client's regular form",
    );
  if (activeFormIds.length > 1)
    throw new Error(
      "Multiple active check-in schedules; the regular form is ambiguous",
    );
  const formId = activeFormIds[0];
  const versions = await apiFetch<{
    options: {
      position: number;
      formName: string;
      versionSeq: number;
      formId: string;
      formVersionId: string;
    }[];
  }>(
    `${base}/schedule-versions?clientProfileId=${encodeURIComponent(input.clientProfileId)}`,
  );
  const match = [...versions.options]
    .filter((option) => option.formId === formId)
    .sort((a, b) => b.versionSeq - a.versionSeq)[0];
  if (!match)
    throw new Error(
      "No published version exists for the client's regular check-in form",
    );
  const created = await apiFetch<{ instanceId: string }>(`${base}/instances`, {
    body: {
      clientProfileId: input.clientProfileId,
      formId,
      formVersionId: match.formVersionId,
      dueAt: viennaMidnight(input.date),
      dueTz: "Europe/Vienna",
      coachNote: input.note,
    },
  });
  return { instanceId: created.instanceId };
}

const WEEKDAY_NAMES = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

/**
 * Persist a weekday change on an EXISTING recurring schedule (P593 slice).
 * Form identity comes from the client's existing rules only: exactly one
 * distinct formId across every rule (any status) is required — zero rules is
 * the unimplemented first-create case, and two is ambiguous; both refuse
 * before any write. Each call writes one weekday's change then regenerates;
 * a failure surfaces after a reload rather than claiming success.
 */
/** Authoritative reload of a client's recurring schedule — the folded
 *  ACTIVE segments the board projects. The settings dialog calls this after
 *  every product-mode save so pressed-states mirror the backend, not the
 *  locally applied intent. */
export async function reloadRecurring(
  workspaceId: string,
  clientProfileId: string,
  input: { formId?: string } = {},
): Promise<{ schedules: Schedule[]; weekdays: number[]; ungeneratedRuleIds: string[] }> {
  const rules = await apiFetch<{ items: ScheduleRuleItem[] }>(
    `/workspaces/${workspaceId}/checkins/schedule-rules?clientProfileId=${encodeURIComponent(clientProfileId)}`,
  );
  // The dialog's pressed-state is the UNION of ACTIVE rules' weekdays —
  // folded segments bucket by startDate, so the latest segment alone would
  // miss an older rule that is still ACTIVE.
  // The pressed-state is scoped to the EDITED form's ACTIVE rules when a
  // form was picked explicitly — the board's union across every form would
  // mark another form's day as on and steer edits toward it. Without an
  // explicit selection the union remains the default projection.
  const scoped = rules.items.filter((r) => r.status === "ACTIVE");
  const activeIds = new Set(scoped.map((r) => r.formId));
  const target = input.formId ?? (activeIds.size === 1 ? [...activeIds][0] : undefined);
  const weekdays = [
    ...new Set(
      scoped
        .filter((r) => (target ? r.formId === target : true))
        .map((r) => WEEKDAY_INDEX[r.weekday])
        .filter((d): d is number => d !== undefined),
    ),
  ];
  return {
    schedules: foldScheduleRules(rules.items),
    weekdays,
    // A persisted ACTIVE rule without an occurrence is the durable recovery
    // record. Generation is idempotent on the server, so re-offering this
    // action after reload never invents a browser-local source of truth.
    ungeneratedRuleIds: rules.items
      .filter((r) => r.status === "ACTIVE" && r.generatedThrough === null)
      .map((r) => r.ruleId),
  };
}

export type ScheduleFormVersionOption = {
  position: number;
  formName: string;
  versionSeq: number;
  formId: string;
  formVersionId: string;
};

/** The schedulable published-form versions for the picker — the same
 *  endpoint the established staff rule-create flow uses (Q10:
 *  latest published version per form). */
export async function loadSchedulableFormVersions(
  workspaceId: string,
  clientProfileId: string,
): Promise<{ options: ScheduleFormVersionOption[] }> {
  return apiFetch<{ options: ScheduleFormVersionOption[] }>(
    `/workspaces/${workspaceId}/checkins/schedule-versions?clientProfileId=${encodeURIComponent(clientProfileId)}`,
  );
}

export async function saveRecurringDays(input: {
  workspaceId: string;
  clientProfileId: string;
  weekday: number;
  add: boolean;
  formId?: string;
  /** Required on the first rule for a form; later edits preserve the rule. */
  localTimeMinutes?: number;
  timezone?: string;
}): Promise<{ ruleId: string; status: string }> {
  if (input.weekday < 0 || input.weekday > 6)
    throw new Error("Weekday out of range");
  const base = `/workspaces/${input.workspaceId}/checkins`;
  const rules = await apiFetch<{ items: ScheduleRuleItem[] }>(
    `${base}/schedule-rules?clientProfileId=${encodeURIComponent(input.clientProfileId)}`,
  );
  // Identity comes from ACTIVE rules only — historical rules are not
  // authoritative. When ACTIVE identity is absent or ambiguous the caller
  // surfaces the established published-form picker and retries with an
  // explicit formId; historical rules never supply identity on their own.
  const activeIds = new Set(
    rules.items.filter((r) => r.status === "ACTIVE").map((r) => r.formId),
  );
  let formId = input.formId;
  if (!formId) {
    if (activeIds.size === 0)
      throw new Error("SELECT_FORM_REQUIRED");
    if (activeIds.size > 1)
      throw new Error("SELECT_FORM_AMBIGUOUS");
    formId = [...activeIds][0];
  }
  const name = WEEKDAY_NAMES[input.weekday];
  const sorted = [...rules.items].sort((a, b) =>
    b.startDate.localeCompare(a.startDate),
  );
  // Only a PAUSED rule is replaceable — the service rejects
  // replacesRuleId on ENDED rows (not_available). An ENDED rule creates a
  // fresh rule with no link.
  const endedSameDay = sorted.find(
    (r) => r.weekday === name && r.status === "PAUSED" && r.formId === formId,
  );
  const basis =
    sorted.find((r) => r.formId === formId && r.status === "ACTIVE") ??
    sorted.find((r) => r.formId === formId);
  const activeForDay = sorted.find(
    (r) =>
      r.weekday === name && r.status === "ACTIVE" && r.formId === formId,
  );

  if (!input.add) {
    if (!activeForDay)
      throw new Error(`No active ${name} rule for this form to remove`);
    const res = await apiFetch<{ status: string }>(
      `${base}/schedule-rules/${activeForDay.ruleId}/status`,
      {
        body: { clientProfileId: input.clientProfileId, action: "end" },
      },
    );
    return { ruleId: activeForDay.ruleId, status: res.status };
  }

  if (activeForDay)
    return { ruleId: activeForDay.ruleId, status: "unchanged" };
  if (!basis && (input.localTimeMinutes === undefined || !input.timezone))
    throw new Error("SCHEDULE_TIME_REQUIRED");
  const created = await apiFetch<{ ruleId?: string; id?: string; status?: string }>(
    `${base}/schedule-rules`,
    {
      body: {
        clientProfileId: input.clientProfileId,
        formId,
        weekday: name,
        localTimeMinutes: basis?.localTimeMinutes ?? input.localTimeMinutes,
        timezone: basis?.timezone ?? input.timezone,
        startDate: plusDays(viennaDate(new Date().toISOString()), 1),
        endDate: null,
        replacesRuleId: endedSameDay?.ruleId ?? null,
      },
    },
  );
  const ruleId = created.ruleId ?? created.id ?? "";
  // D30: rule creation never generates — materialize explicitly. A failed
  // generate leaves the rule persisted but ungenerated; the caller offers
  // retryGenerateRule for the same ruleId (generation is idempotent per
  // (originRuleId, occurrenceDate) — a retry completes rather than
  // duplicating, and the rule must NOT be recreated).
  try {
    await apiFetch(`${base}/schedule-rules/${ruleId}/generate`, {
      body: { clientProfileId: input.clientProfileId },
    });
    return { ruleId, status: created.status ?? "scheduled" };
  } catch {
    return { ruleId, status: "ungenerated" };
  }
}

/** Retry generation on a persisted rule — idempotent per the backend's
 *  occurrence-identity dedupe; safe to repeat after a failed create+generate. */
export async function retryGenerateRule(input: {
  workspaceId: string;
  clientProfileId: string;
  ruleId: string;
}): Promise<void> {
  await apiFetch(
    `/workspaces/${input.workspaceId}/checkins/schedule-rules/${input.ruleId}/generate`,
    { body: { clientProfileId: input.clientProfileId } },
  );
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

// ---------------------------------------------------------------------------
// Card 05b: the client-facing own check-in surface. Three calls - the "next"
// header that hands the screen its instanceId, the own detail that renders
// the pinned definition, and the submit that carries the answers payload.
// ---------------------------------------------------------------------------

export type OwnNextCheckInWire = {
  instanceId: string;
  formName: string;
  dueAt: string;
  late: boolean;
} | null;

export type OwnCheckInFieldWire = {
  fieldId: string;
  kind:
    | "shortText"
    | "longText"
    | "number"
    | "date"
    | "singleChoice"
    | "multiChoice"
    | "rating"
    | "visual";
  label: string;
  required: boolean;
  order: number;
  helpText?: string;
  options?: { optionId: string; label: string }[];
  ratingScheme?: "SCALE_1_10" | "SCALE_1_5" | "WORD_LABELS";
};

export type OwnCheckInSubmittedAnswerWire = {
  fieldId: string;
  kind: string;
  valueText: string | null;
  valueNumeric: string | null;
  valueDate: string | null;
  valueOptionIds: string[] | null;
  valueRating: number | null;
  mediaIds: string[];
};

export type OwnCheckInInstanceDetailWire = {
  instanceId: string;
  formName: string;
  versionSeq: number;
  dueAt: string;
  state: string;
  late: boolean;
  submittedAt: string | null;
  definition: { title: string; fields: OwnCheckInFieldWire[] };
  submittedAnswers: OwnCheckInSubmittedAnswerWire[] | null;
  feedback:
    | { id: string; sentAt: string; byName: string; body: string }[]
    | null;
  feedbackNextCursor: string | null;
};

/** GET checkins/instances/next - the caller's earliest unfinished check-in. */
export function fetchOwnNextCheckIn(
  workspaceId: string,
): Promise<{ next: OwnNextCheckInWire }> {
  return apiFetch(`/workspaces/${workspaceId}/checkins/instances/next`);
}

/** GET checkins/instances/:instanceId - own detail + pinned definition. */
export function fetchOwnCheckInInstance(
  workspaceId: string,
  instanceId: string,
): Promise<OwnCheckInInstanceDetailWire> {
  return apiFetch(
    `/workspaces/${workspaceId}/checkins/instances/${instanceId}`,
  );
}

/** POST checkins/instances/:instanceId/submit - one own submission. */
export function submitOwnCheckIn(
  workspaceId: string,
  instanceId: string,
  answersJson: string,
): Promise<{ status: "submitted" | "already_submitted"; submissionId: string }> {
  return apiFetch(
    `/workspaces/${workspaceId}/checkins/instances/${instanceId}/submit`,
    { method: "POST", body: { answersJson } },
  );
}

// ---------------------------------------------------------------------------
// Card w2-c6: the client check-in schedule + summary embed helpers. The list
// is the bounded staff-calendar route run under the caller's own scope; the
// summary rows come from the own daily-entries surface because the
// submission tracker-context read is staff-gated.
// ---------------------------------------------------------------------------

/**
 * Own schedule row - mirrors `OwnCheckInInstanceItem` from
 * lib/checkin/instances. The /api/v1 instances list route denies client
 * callers (measured 403 on the lane), so the schedule comes from the
 * own-scope `readOwnCheckInCalendarAction` server action instead.
 */
export type OwnCheckInInstanceListItemWire = {
  instanceId: string;
  formName: string;
  dueAt: string;
  state: string;
  late: boolean;
  submittedAt: string | null;
};

/** Status chip key for one schedule row, derived from the wire state. */
export function checkInScheduleStatus(item: {
  state: string;
  late: boolean;
}): "overdue" | "scheduled" | "submitted" | "cancelled" {
  if (item.state === "CANCELLED") return "cancelled";
  if (item.state === "SUBMITTED" || item.state === "REVIEWED")
    return "submitted";
  return item.late ? "overdue" : "scheduled";
}

/** Chip label shown next to a schedule row. */
export function checkInScheduleLabel(status: string): string {
  if (status === "overdue") return "Overdue";
  if (status === "scheduled") return "Scheduled";
  if (status === "submitted") return "Submitted";
  return "Cancelled";
}

/**
 * Poses for a visual-upload field: the wire `options` labels when the
 * definition carries them, else the standard five.
 */
export function posesForVisualField(
  field: { options?: { optionId: string; label: string }[] },
  defaultPoses: readonly string[],
): string[] {
  const labels = (field.options ?? []).map((option) => option.label);
  return labels.length > 0 ? labels : [...defaultPoses];
}

/**
 * VISUAL answer value: the pose slots mapped onto a mediaIds array in pose
 * order, so index i belongs to pose i of the filled slots.
 */
export function mediaIdsForPoses(
  poses: readonly string[],
  mediaByPose: Record<string, string | undefined>,
): string[] {
  return poses
    .map((pose) => mediaByPose[pose])
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * Tracker-summary rows for one check-in date from the caller's own
 * daily-entries surface: the logged values for that date, else the surface
 * items' current values. Empty on every non-ready state so the embed hides.
 */
export function summaryRowsFromSurface(
  surface: {
    state: string;
    sections?: { items: { label: string; current: string; unit: string | null }[] }[];
    history?: {
      entryDate: string;
      values: { label: string; display: string }[];
    }[];
  },
  entryDate: string,
): { label: string; value: string | null }[] {
  if (surface.state !== "ready") return [];
  const logged = (surface.history ?? []).find(
    (entry) => entry.entryDate === entryDate,
  );
  if (logged && logged.values.length > 0)
    return logged.values.map((value) => ({
      label: value.label,
      value: value.display,
    }));
  const rows = (surface.sections ?? [])
    .flatMap((section) => section.items)
    .filter((item) => item.current.trim().length > 0)
    .map((item) => ({
      label: item.label,
      value: `${item.current}${item.unit ? ` ${item.unit}` : ""}`,
    }));
  return rows;
}

/** Display value for one submitted answer joined to its field. */
export function submittedAnswerDisplay(
  field: { kind: string; options?: { optionId: string; label: string }[] },
  answer: {
    valueText: string | null;
    valueNumeric: string | null;
    valueDate: string | null;
    valueOptionIds: string[] | null;
    valueRating: number | null;
    mediaIds: string[];
  },
): string | null {
  if (answer.mediaIds.length > 0)
    return `${answer.mediaIds.length} photo${answer.mediaIds.length === 1 ? "" : "s"}`;
  if (answer.valueRating !== null) return String(answer.valueRating);
  if (answer.valueOptionIds && answer.valueOptionIds.length > 0)
    return answer.valueOptionIds
      .map(
        (id) =>
          field.options?.find((option) => option.optionId === id)?.label ?? id,
      )
      .join(", ");
  if (answer.valueNumeric !== null) return answer.valueNumeric;
  if (answer.valueDate !== null) return answer.valueDate;
  if (answer.valueText !== null && answer.valueText.trim().length > 0)
    return answer.valueText;
  return null;
}
