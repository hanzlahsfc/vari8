/**
 * TRAINING-I1A (PROMPT 244 — reviewed P9+A1+A2+A3 contract) —
 * payload/count/size bounds. Everything here is a structural limit,
 * never a prescription rule: values are stored and rendered exactly as
 * entered (no formulas, volumes, or progression math).
 */
export const TRAINING_LIMITS = {
  titleMax: 120,
  weekCountMin: 1,
  weekCountMax: 52,
  /** Declared sessions/exercises (stable ids, I2 logging linkage). */
  maxSessions: 24,
  maxExercisesPerSession: 24,
  sessionNameMax: 80,
  exerciseNameMax: 120,
  catalogItemIdMax: 64,
  /** The eight configurable prescription fields (P3 §4.3 bounds). */
  setsMin: 1,
  setsMax: 20,
  repsTextMax: 24,
  tempoMax: 32,
  setTypeMax: 24,
  restMax: 24,
  instructionsMax: 2000,
  progressionNotesMax: 1000,
  /** Always-on per-exercise note. */
  noteMax: 500,
  /** Normalized draft/version payload cap. */
  payloadMaxBytes: 96 * 1024,
  /** Two-level history: programs page and per-program versions page. */
  programPageSize: 20,
  versionPageSize: 20,
  /** Dated-session bookings: staff upcoming cap + shared history page. */
  bookingUpcomingStaff: 12,
  bookingPageSize: 12,
  /** Client agenda cap (upcoming bookings on the current program). */
  bookingAgendaClient: 8,
  /** Declared effective dates: forward horizon = server-UTC today + N. */
  effectiveDateAheadDays: 366,
  /** boundaryInstant fold-forward search window (A1 §3.4). */
  boundaryFoldMaxDays: 3,
  /** Bounded-read budgets (A2 §2.1 + A3 §4.1 margin). */
  stmtTimeoutMs: 4000,
  readBudgetMs: 6000,
  prismaTxTimeoutMs: 12000,
} as const;
