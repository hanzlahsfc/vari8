# Demo export - deterministic seed snapshot

This directory is generated. It is the fully populated demo coaching state
(the same state a fresh browser session boots into) serialized to JSON so the
real backend can be seeded with identical content. Regenerate with:

```sh
npm run export:demo
```

The script (`scripts/export-demo.mjs`) builds
`normalizeTemplateSetups(migrateCoachState(seedState({ today: ANCHOR })))`,
verifies the
result, and rewrites this directory. Re-running it must produce byte-identical
files; `src/data/demo-export` is excluded from `biome check` because the files
are machine-formatted (`JSON.stringify`, 2-space) artifacts.

## Anchor and day offsets

All calendar content is expressed relative to a fixed anchor:

- `ANCHOR = "2026-10-25"` (stored as `generatedAt` in `index.json`).
- `day <n>` is an integer day offset from the anchor. Re-anchor rule:
  `YYYY-MM-DD = generatedAt + n days`. `n` may be negative (`day -12`),
  zero (`day 0`) or positive (`day 62`).
- `day <n>T<time>` is a timestamp: resolve the day part as above and keep the
  `T<HH:mm:ss[.mmm][Z]>` tail verbatim (e.g. `day -13T08:10:00Z` →
  `2026-10-12T08:10:00Z`; `day -12T18:00:00` → `2026-10-13T18:00:00`).
- Date-typed object keys (none in the current seed, but supported for
  `weekNotes`-style records) are encoded the same way.

### Fixed-date whitelist

Values under these keys keep literal `YYYY-MM-DD` dates because they are
inherent metadata, not timeline content:

| Key | Where | Why fixed |
| --- | --- | --- |
| `updated` | `templates[].updated`, `assignment.snapshot.updated` | Template revision stamp authored in the seed, not derived from the anchor. |
| `referenceDate` | (not present in this snapshot) | Mock-data reference date. |
| `birthDate`, `dateOfBirth` | (not present in this snapshot) | A birthday must never move when the anchor moves. |

### Free-text keys (verbatim)

Entire subtrees under these keys are never rewritten, even when the text
mentions a date: `answer`, `note`, `text`, `name`, `label`, `title`,
`description`, `instructions`, `reason`, `goal`, `message`, `subject`,
`visuals`. (`goal` the habit text is verbatim; `goals` - the plural
`plans.goals[]` list - is a structured list whose `date` fields do convert.)

Strings that merely *contain* a date but are not pure date values stay
verbatim under every key: `eventId` (`recurring:client-001:2026-10-12`),
training-log ids (`demo-log-2026-10-13-Tuesday-amara-upper-a-0`), and short
display timestamps without seconds (`2026-10-05T08:42` in `lastCheckIn`,
embedded `messages[].date` from the legacy roster data). A seeder that
re-anchors dates should treat ids as opaque identifiers - the embedded dates
are cosmetic.

### Photo / asset paths

`src` values are stored relative (`demo/physique/front-relaxed-1.svg`). They
map to `frontend/public/demo/…` - prepend `/` to use them as URLs in the app.

## Files

- `index.json` - manifest: `generatedAt` (the anchor), `schema`, the
  day-offset format description, the file list, and `{id, name, file}` per
  client. No wall-clock timestamps are stored; `generatedAt` is the anchor.
- `workspace.json` - every `CoachState` field except `clients`: `version`,
  `demoSeeds` (which demo enrichers ran), `templates`, `exerciseLibrary`,
  `extras` (additional check-in requests), `submissions`, `trainingLogs`,
  `messages`, `drafts`, `reviewDrafts`, `editorDrafts`, `preferences`,
  `coachNotes`/`coachTodos`/`timelineViews`/`timelineOrder` when present.
- `clients/client-NNN.json` - the full `CoachClient` object plus a `related`
  object holding that client's slice of the state-level collections:
  `submissions`, `messages`, `extras`, `trainingLogs`, `coachTodos`,
  `reviewDrafts` (keyed by submission id), and `draft` (the conversation
  draft) when present. `related` duplicates data that also lives in
  `workspace.json`; client files are self-contained bundles so a seeder can
  import one athlete without joining tables.

## Field map - client files

Identity and roster fields come from `src/data/mock-data.json` via
`createInitialClients()`; plan/tracking fields are populated by the demo
enrichers.

| Field | What it is | Read by | Backend relevance |
| --- | --- | --- | --- |
| `id`, `name`, `initials`, `email`, `archived` | Athlete identity | Coach roster (`clients.tsx`), every client header, client app | core |
| `label`, `template`, `phase`, `week`, `presentation`, `checkInStatus`, `recurringCheckIn`, `nextCheckIn`, `lastCheckIn`, `additionalCheckInDates`, `coachingSince`, `unreadCount`, `overdueTaskCount`, `trainingFlags`, `priorityMessages` | Legacy roster/display fields from mock data | Coach roster table, client list rows | mostly legacy display strings - `presentation` selects meal-plan vs macro UI |
| `bodyweightKg`, `bodyweightDate`, `heightCm`, `weightTrend` | Body metrics + sparkline series | Athlete profile header/overview | core |
| `assignment` | Assigned check-in template + immutable `snapshot` the client actually sees | Coach athlete profile tabs, template-driven views/questions, client app | core - snapshot must persist per client, not by reference |
| `plan` | Legacy summary targets (calories/protein/sets, instructions, program) | Coach plan header, check-in diffs | legacy - superseded by `plans`, still rendered |
| `plans.nutrition` | `mealPlan` / `iifym` lifecycles (`draft`, `active`, `history`) plus `temporary` date-ranged overrides (refeeds/diet breaks) | Coach Nutrition plan tab, client app nutrition screens | core |
| `plans.training` | Training plan lifecycle; sessions, rotations, overrides | Coach Training Program tab, client training logbook | core |
| `plans.activityTargets` | Versioned steps/cardio targets (`effectiveFrom`) | Timeline/roadmap activity columns, overview widgets | core |
| `plans.supplements` | Supplement plan (items, `savedAt`) | Coach Supplements tab, client app | core |
| `plans.otherTargets` | Date-less metric targets (sleep ≥, water range…) | Overview widgets, targets panel | core |
| `plans.goals` | Dated metric goals | Timeline/roadmap goal markers | core |
| `phases` | Named prep/recovery phases (`startDate`, `durationWeeks`) | Athlete profile phase strip, roadmap | core |
| `contestDate` | Show/goal date | Athlete profile countdown, roadmap | core |
| `timelineEvents` | Coach-added week tags (deload, diet break, refeed) | Timeline tab, athlete profile timeline | core |
| `schedules` | Weekly recurring check-in schedule (`effective`, `weekdays`) | Check-in calendar (`eventsBetween`), overdue logic | core |
| `entries` / `tracking` | Daily metric log (`tracking.entries` falls back to `entries`; `tracking.text` holds per-field notes) | Tracker view, weight/metric charts, check-in summaries | core |
| `habits`, `retiredHabits`, `habitLog` | Habit definitions + per-day completion dates | Habits tab, dashboard habit widget | core |
| `clientTasks` | Athlete-visible to-dos (`dueDate`, `status`) | Client app tasks, coach client profile | core |
| `coachTasks` | Legacy coach-side per-client tasks (empty in this snapshot) | - | legacy/optional |
| `internalNotes`, `generalNotes` | Private coach notes / shared notes | Coach notes tab on the athlete profile | core |
| `weekNotes` | Coach notes keyed by timeline-week Monday (absent here) | Timeline week detail | core when present |
| `checkIns`, `onboarding`, `messages` (embedded) | Legacy embedded history/Q&A/message stubs from mock data | Roster/profile fallback displays | legacy - real data lives in `related.submissions`/`related.messages` |
| `related.submissions` | Check-in submissions incl. `answers`, `flags`, `photos`, `response` | Coach check-ins section + review UI, client app history | core |
| `related.messages` | Coach↔athlete conversation | Coach messages section, client app chat | core |
| `related.extras` | Additional (non-recurring) check-in requests | Check-in calendar | core |
| `related.trainingLogs` | Finished/in-progress session logs (`scheduledDate`, `startedAt`, `finishedAt`, per-set entries) | Client training logbook, coach timeline | core |
| `related.coachTodos` | Coach to-dos linked to this client | Coach notes/todos surfaces | core when present |
| `related.reviewDrafts`, `related.draft` | Unsent feedback/message drafts | Browser-only composer state | browser-only - a backend may store or drop |

## Field map - workspace.json

| Field | What it is | Read by | Backend relevance |
| --- | --- | --- | --- |
| `version` | State schema version (1) | store migration | core |
| `demoSeeds` | Which demo enrichers ran (revision flags) | store hydration | seed bookkeeping - keep or drop |
| `templates` | Check-in template library (variants, fields, questions, widgets, roadmaps) | Coach templates section, assignment flow | core |
| `exerciseLibrary` | Exercise catalogue | Training plan builder, logbook | core |
| `submissions`, `messages`, `extras`, `trainingLogs` | State-level collections also sliced per client under `related` | Check-ins, messages, calendar, logbook | core |
| `coachNotes`, `coachTodos` | Coach-wide notes/to-dos | Coach notes section | core when present |
| `drafts`, `reviewDrafts`, `editorDrafts` | Unsent message/reply drafts and template-editor drafts | Browser composers | browser-only scratch state (empty in this snapshot) |
| `timelineViews`, `timelineOrder` | Timeline-tab column layouts and week ordering | Coach timeline tab | browser-only UI preference |
| `preferences` | Coach theme/accent/sidebar/notification prefs | Coach shell | browser-only UI preference |

## Determinism

`seedState({ today: ANCHOR })` pins every derived date. Generated ids use a counter
(`00000000-0000-4000-8000-<seq>`) installed by the script for the duration of
the seed - they are stable across runs and machines, and referential
integrity is preserved (`activeVariantId`, `selectedVariantId`, temporary
plan ids, etc.). Three demo ids are stable literals:
`demo-variant-refeed`, `demo-timeline-deload`, `demo-timeline-dietbreak`.
