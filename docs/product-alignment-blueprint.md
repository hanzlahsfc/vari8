# Product-alignment blueprint — configurable coaching system

**Documentation only — no application code, schema, migration, dependency, route, or UI
change is authorized or implied by this document.** Author: Juno (SWE-2 High). Branch
`docs/p006-product-alignment-blueprint` off verified `main`
`25994573cca028ba804fddb6883f65746b0ca74f`. Task P-006.

**Direction source:** Lilly's functional development brief ("Core coaching system",
partner handoff, 1 October 2026) — a _product-direction reference_, not executable
instructions. Where the brief is silent, items are marked **PENDING** owner decision,
never guessed. Where it conflicts with recorded product decisions, the conflict is
surfaced rather than resolved.

**Evidence labels:** **SOURCE-CONFIRMED** = stated in the brief or in an approved
product decision; **PROPOSED** = recommended technical default awaiting owner approval;
**PENDING** = unresolved owner decision (options + recommendation + what it blocks);
**GAP** = no current capability and not yet specified enough to build.

This blueprint **supersedes the universal-schema assumption** of
`docs/tasks/phase-0-1-source-blueprint.md`: PRGRSS 2.0 is repositioned as **one
source-backed starter configuration** inside a configurable system, not the permanent
fixed schema. The Phase 0.1 document remains the authoritative field-level record of
the PRGRSS sources and is **preserved unchanged** as historical evidence.

Product name remains undecided. "Nexus" is excluded; "Infinity Cr8" is business
context, not the product name.

---

## 0. What the brief changes

The earlier planning assumed one workbook (PRGRSS 2.0) defines the data model. The
brief redefines the product: a **configurable coaching system** in which each coach
assembles the client tool from a parameter library, saves it as a named template with
variants, and assigns it per client. PRGRSS 2.0 supplies the first real starter
configuration and source-fidelity evidence; it no longer bounds the domain.

Central rule (SOURCE-CONFIRMED, invariant): **switching views/variants within a
client's assigned template must preserve the client's data and never require a new
tracker.** This drives the separation of _configuration_ (templates, versions,
variants, field definitions) from _client data_ (entries, plans, submissions,
messages) throughout this blueprint.

---

## 1. Domain and relationships (conceptual — no schema edits)

Existing models are capitalized as implemented in `db/schema.prisma`; proposed
concepts are _italicized_ and carry no implementation detail beyond keys and
constraints.

### Identity and tenancy (exists)

- **User** — login identity, credential, `sessionVersion`, `platformRole`.
- **Workspace** — coaching tenancy boundary; status-gated.
- **WorkspaceMember** (MemberRole: WORKSPACE_OWNER/COACH/ASSISTANT_COACH/SUPPORT/
  CLIENT) — membership + status; every request is scoped to exactly one ACTIVE
  workspace membership (`docs/security/authorization-model.md`).
- **CoachProfile / ClientProfile** — role-shaped profiles attached to a membership.
- **ClientAssignment** — owner-managed coach↔client link; never crosses workspaces;
  audited. This is the `assigned` authorization scope.
- **ConsentRecord, AuditEvent, AccessToken** — consent ledger, audit spine, and
  invite/reset token machinery. Reset stays gated off (§5, §9).

Brief-role mapping (SOURCE-CONFIRMED mapping, PROPOSED semantics): the brief's
"coach" = COACH or WORKSPACE_OWNER acting through an active `assigned` scope;
"client" = CLIENT member with a ClientProfile; "assistant coach" exists in the
schema (ASSISTANT_COACH, read-assigned/write-denied pending sign-off). The brief
does not define staff tiers — do not invent capabilities beyond the existing
matrix.

### Configuration objects (proposed)

- _TrackingTemplate_ — named, workspace-owned configuration container. Key:
  (workspaceId, templateId). Holds versions; never holds client data.
- _TemplateVersion_ — immutable published snapshot of a template. Key:
  (templateId, versionSeq). Once published it never mutates; edits produce a new
  draft→publish cycle (§2).
- _TemplateVariant_ — named presentation alternative inside a version (e.g.
  meal-plan-based vs IIFYM-based). Key: (versionId, variantKey). A variant is a
  _view selection_, not a data fork.
- _ParameterDefinition_ — stable-identity field in the parameter library (§3).
  Templates _reference_ parameter IDs; they never redefine the parameter.
- _CheckInFormDefinition_ — versioned questionnaire inside a TemplateVersion
  (question IDs stable across versions).
- _OnboardingFormDefinition_ — workspace's intake form (versioned); includes the
  core profile fields plus coach-added questions.
- _DashboardLayout_ / _WidgetSelection_ / _RoadmapSelection_ — view configuration
  records inside a TemplateVersion (which widgets, sizes, parameters, supported
  calculations).

### Client-owned objects (proposed — always keyed to the client, never the template)

- _ClientSetup_ — the join: (clientProfileId) → assigned TemplateVersion + active
  variant + per-client plans. One active setup per client.
- _DailyEntry_ — client-owned dated measurement values keyed by parameter ID with
  the _unit/rating snapshot_ recorded at write time (§2 history rule).
- _ClientTargets / PlanSet_ — effective-dated coach-prescribed targets
  (nutrition/activity/etc.); each change appends a new effective-dated version;
  old versions stay readable for history and roadmap comparisons.
- _MealPlanConfig_ — per-client meal structure (count, labels, times, swaps) and
  nutrition-variant schedule; built-in client-setup surface, **not** a template
  object (SOURCE-CONFIRMED: "built-in client setup rather than a meal-plan
  structure customized in the template editor").
- _TrainingProgram_ — per-client program: `EVERGREEN` or `WEEK_BASED(weekCount)`;
  prescriptions effective from a chosen week onward (§6 Training).
- _TrainingLog / SetLog / SetNote_ — client performance entries retaining
  exercise/set context; SetNote has an optional `flaggedForReview` marker.
- _HabitDefinition / HabitStatus_ — per-client habit setup (name, frequency, goal,
  reason) and dated status log. Independent of DailyEntry parameters
  (SOURCE-CONFIRMED separation).
- _CheckInSubmission_ — versioned questionnaire response (full or custom) attached
  to the client; retains raw answers forever; carries `submittedAt`, `openedAt`,
  `respondedAt` as distinct states.
- _CheckInSchedule_ — per-client recurring day(s)/frequency plus ad-hoc
  coach-requested dates.
- _Conversation / Message_ — coach↔client channel; messages carry optional
  context links (workout/meal/check-in references) and a client-permitted
  priority flag.
- _CoachNote / CoachTask_ — coach-private work items, optionally linked to a
  client for profile context; never client-visible.
- _ClientTask_ — item deliberately assigned to the client with its own
  completion/overdue state. Distinct type from CoachTask (SOURCE-CONFIRMED).
- _FeedbackResponse_ — coach's reply to a CheckInSubmission: video-feedback
  reference, text, and auto-generated change-summary links to updated plans.
- _OnboardingSubmission_ — retained full intake response; populates/links
  ClientProfile core fields (§4).

### Conceptual constraints

- All client-data objects carry (workspaceId, clientProfileId); every access is
  authorized through `authorize()` — configuration or route presentation can never
  widen it.
- Template configuration is workspace-scoped; a coach sees only their workspace's
  templates. Whether templates are coach-personal vs workspace-shared is PENDING
  (D-03).
- Deleting/archiving a template or parameter never deletes client data; reads of
  historical entries must still resolve the parameter identity and its
  write-time unit/rating snapshot.

---

## 2. Template / version / variant rules

Lifecycle (PROPOSED, consistent with the brief's "name, save, assign" flow):

- **Draft** — mutable; visible only to workspace staff; assignable to nothing.
- **Publish** — freezes the draft into an immutable TemplateVersion. Assignments
  pin to a version, never to the mutable template.
- **Edit** — opens a new draft seeded from a chosen version. Publishing creates
  versionSeq+1; existing assignments stay pinned.
- **Upgrade** — a coach explicitly reassigns a client to a newer version.
  PROPOSED: upgrade produces a _mapping record_ (added/removed/changed parameter
  and question IDs) reviewed before apply; **no silent propagation** — a client
  on v1 is never moved to v2 by editing the template.
- **Archive/retire** — hides the template from new assignment; existing
  assignments keep working. Rollback = reassign to an earlier still-retained
  version; conflict rule: two versions may not carry the same parameter ID with
  an incompatible type change (see below).
- **Variant switch** — picks another TemplateVariant inside the _same_ assigned
  version. SOURCE-CONFIRMED invariant: identical client/assignment/history/plans/
  check-ins/messages; no new tracker; nothing deleted.

Field-change rules (PROPOSED):

- Parameter identity = stable ID; labels and coach-facing descriptions may change
  freely.
- Unit changes: allowed via a _unit-conversion record_ (from→to, factor/offset,
  appliedAt, provenance) so history remains readable in its original unit and
  displayable in the new one. Type changes (number→rating) are **not** in-place:
  add a new parameter, hide the old one — old data stays readable.
- Adding a parameter: visible going forward; history shows "not collected".
- Hiding: removes from entry UI and default views; data retained, still readable
  in history and exports.
- Removing a question from a check-in form does not delete past submissions'
  answers (the versioned form snapshot keeps the question text).

Terminology locked (SOURCE-CONFIRMED): _template variant_ (overall presentation,
switch preserves data) ≠ _nutrition variant_ (meal/target schedule or manually
selected nutritional option) ≠ _template-version upgrade_ (explicit reassignment).

---

## 3. Configurable parameter library

PROPOSED contract for each _ParameterDefinition_:

- `parameterId` (stable, slug-form), `kind` ∈ {measurement, rating, time,
  duration, option, text}, `unit` (measurements only; canonical + display),
  `ratingScheme` ∈ {scale-1-10, scale-1-5, word-labels} (ratings only),
  `optionality` (required/optional/hidden per template selection),
  `validation` (min/max/pattern where derivable), `source` ∈ {manual, wearable:*
  (provider-specific — deferred)}, `defaultVisibility` (coach/client/check-in/
  dashboard/roadmap), `group` (bodyweight, health, sleep, activity, biofeedback,
  nutrition, …).
- The same contract stamps the library entries for tracker fields, dashboard
  widget data sources, roadmap selections, exercise prescription fields
  (tempo/set-type/rest etc. — P01), and versioned check-in form questions.
- **PRGRSS 2.0 ships as one source-backed starter configuration**: the confirmed
  DAILY TRACKER fields (Phase 0.1 crosswalk §2 — 9 sections, units verbatim) seed
  an initial parameter set marked `provenance: PRGRSS-2.0`. Coaches may add,
  hide, or relabel; the starter set is never mandatory and never blocks
  specialist history (e.g., a coach who removes the MENSES group still retains
  any client data logged against it — it becomes hidden-but-readable).
- Specialist module fields (menses cycle/HRT, peaking, show-day, supplementation)
  stay out of the starter set pending owner/legal sign-off
  (product-decisions #13, open-questions #13) — they may exist in the library as
  _disabled_ candidates only after that decision.

---

## 4. Onboarding — end to end

SOURCE-CONFIRMED flow (brief "Client onboarding and setup" + W11): coach builds a
custom intake form including core profile fields → sends to a new client →
submission **creates the client record automatically and retains the full form** →
coach assigns a template → sets plans/targets/habits → configures recurring +
extra check-in dates.

Reconciliation with the existing invite-first identity workflow (PROPOSED,
internally consistent):

- Identity stays invite-first (product-decisions #13, #15, #20): a workspace
  CLIENT invite creates the account path; acceptance sets the password and
  creates/links the ClientProfile — unchanged.
- The onboarding form is an _OnboardingSubmission_ attached to that
  ClientProfile. Recommended binding: the invite email doubles as the onboarding
  send; the invitee completes intake during/after acceptance, keyed by the same
  token domain (one outstanding invite per (workspaceId, email)).
- Duplicate/idempotency rule (PROPOSED): client-record creation is keyed
  (workspaceId, inviteTokenId) — a retried submission updates the same
  ClientProfile and the same OnboardingSubmission rather than duplicating; a
  second _distinct_ invite for an email that already has an ACTIVE client record
  links to the existing record instead of creating a second one.
- Current staff routes are **not** client self-service: `/workspace/[id]/daily`,
  `/nutrition`, `/exercises` are staff-only surfaces. The blueprint does not
  assume they become client-visible; client surfaces are new work under the
  `own` scope (§5).

PENDING D-01: whether coaches may send an onboarding form _before_ inviting
(pre-account intake). Recommendation: **no** — intake rides the invite, keeping
one identity path; blocks nothing if deferred because the submission form can be
sent post-acceptance.

---

## 5. Ownership and permissions

Mapping onto the actual matrix (`docs/security/authorization-model.md`), not
inventing capabilities:

- Coach roster/profile access = `assigned` scope on client resources; roster
  listing = collection query scoped by workspace + assignment.
- **Coach notes/to-dos stay coach-private** — the matrix already denies client
  read of `coach notes` (⚠ pending shared-visibility model). A coach note
  _linked_ to a client appears in that client's coach-facing profile only;
  linkage never widens visibility (SOURCE-CONFIRMED W04/W07 + visibility rule).
- **Client tasks** = new resource `client tasks` (own/own for CLIENT; asg/asg for
  coach) — separate from `coach notes`. PROPOSED matrix row, pending owner sign-off.
- General-notes area visibility (W04): **PENDING D-02** — brief says "needs a
  defined rule". Recommendation: default coach-only with a per-note
  `visibleToClient` flag; blocks the general-notes UI only.
- Priority messaging permission (W08/M04): per-client boolean
  `maySendPriorityMessages` set by the coach; governs flagged-message
  notifications only — orthogonal to set-note flags (§6). PROPOSED field on
  ClientAssignment or ClientSetup.
- Reassignment/deactivation: owner-managed ClientAssignment changes are audited;
  deactivation preserves history read access for the workspace; attachments
  follow the `private media/files` row (asg/asg coach, own/own client).
- Health-data access stays server-enforced, workspace/role-scoped,
  consent-aware, audited (AGENTS.md boundary) — configuration can never grant.
- Invite/password-reset scope is unchanged: reset routes remain gated off
  (`lib/auth/password-reset-delivery.ts`, empty frozen registry) until a real
  adapter lands.

---

## 6. Connected workflows and views

The six core client tabs (SOURCE-CONFIRMED set): **Dashboard, Tracker,
Timeline/Roadmap, Mealplan, Training Program, Check-In**, plus optional
**Habit Tracker** and **Messaging**.

Data contracts:

- Daily measurements → feed dashboard widgets, roadmap summaries, and check-in
  included-summaries — via _selected_ parameters only; a parameter the coach did
  not select is never silently surfaced.
- Meal plans/targets + food entries → daily totals, roadmap comparisons,
  check-in summaries. Target comparisons evaluate against the _applicable_
  nutrition variant for that date.
- Training prescriptions + logged sets → training view, configured volume
  display, check-in review (with flagged set notes in context).
- Check-in submissions → awaiting-response overview; opening ≠ responding —
  `openedAt` set on view, `respondedAt` set on feedback submit, and the
  submission stays in awaiting-feedback until responded (SOURCE-CONFIRMED).
- Habit definitions/statuses → habit widgets and check-in summaries read the
  habit store only; the Tracker's measurement fields never carry habit data.

Tab rules (SOURCE-CONFIRMED where cited):

- **Dashboard (D01–D05):** iOS-widget-style grid; widget gallery grouped by type;
  per-widget parameter/summary configuration; size adapts detail level. Coach
  configures; client sees published content — coach/client layout relationship is
  PENDING D-04 (recommendation: same layout, client sees client-visibility
  subset).
- **Tracker (T01–T04):** parameter-library selection drives entry fields; units
  and rating scheme are template-level configuration applied consistently across
  connected views; mobile+desktop easy entry.
- **Timeline/Roadmap (R01–R04):** coach-selected parameters + supported
  calculations + planning info. The brief's list (phase, planned/actual
  bodyweight, ROG/ROL, nutrition, activity, circumferences/skinfolds, show
  planning) is illustrative — **not** a fixed field set and **not** approved
  calculations (§7).
- **Mealplan (N01–N08):** per-client meal structure, fixed/range/minimum
  targets, nutrition-variant schedules, archived effective-dated options, food
  logging (search/barcode/custom/quick-add — provider contracts deferred),
  coach review of entries.
- **Training (P01–P08):** prescription-field selection in the template;
  evergreen or week-count programs; carry-forward rule (SOURCE-CONFIRMED):
  week N mirrors week N−1 until a coach change, which applies from that week
  onward while earlier weeks retain their instructions; set notes keep
  exercise/set context; coach notes may target future sets; volume display is a
  configured view — volume semantics/calculation PENDING (§7).
- **Check-In (C01–C07):** versioned form builder; included-summary selection;
  full vs custom (bodyweight-default) submissions; review opens submission +
  tracker + flagged notes; integrated video feedback; automatic change-summary
  with links to changed plans. Custom-check-in relationship to scheduled dates:
  PENDING D-05 (recommendation: custom submissions never satisfy a scheduled
  date unless the coach marks them as covering it).
- **Habit Tracker:** optional per-template feature; per-client habit
  definitions/frequency/goals/reasons; own status log.
- **Messaging (M01–M05):** WhatsApp-like thread; attachments; context links to
  workout/meal/check-in; coach availability/notification prefs; search/snippets;
  per-client priority flag honoring; feedback submit from check-in workflow.
  Context links survive variant switches (SOURCE-CONFIRMED).
- **Coach workspace (W01–W11):** roster table/cards with filter/sort; attention
  surface (overdue check-ins, unread flags, pending tasks); profile with labels
  (e.g. prep/lifestyle), coaching start date/duration indicator, check-in days;
  private notes + general notes; client tasks; check-in calendar from recurring
  - ad-hoc dates; universal coach work items linkable to a client; template
    library; onboarding builder.
- **Deferred direction (brief-tail, not implemented here):** wearable connectors
  (Apple Watch/Fitbit/Oura — provider list, imported-measurement mapping,
  sync/manual-entry handling all need separate scoped contracts), migration,
  export. Recorded as intent; no authorization implied.

---

## 7. Calculation governance

No formula ships from values-only exports (product-decisions #7; open-questions
§"Underivable semantics"). PROPOSED catalog contract for every calculation:

- `calculationId`, version, provenance (who defined it, source document/decision
  link), input parameter IDs + required history window + timezone rule, output
  type/unit, missing-data semantics (skip/null/partial), duplicate-entry policy,
  outlier handling, rounding/display rule, reproducibility requirement
  (recompute from stored inputs + code version; snapshots optional),
  supported-parameter mapping (which kinds it can bind to), owner-approval state,
  and fixtures with expected outputs.
- **Nothing computes until an entry exists in this catalog AND the owner has
  approved it.** Roadmap/dashboard widgets bind only approved calculations.

Requested-but-blocked candidates (all UNKNOWN formulas — open-questions
#3–#10; brief §Roadmap examples): weekly averages/trends (Δkg/Δ%), ROG/ROL
planned-vs-actual, adherence %, calorie column, meal subtotals, T-minus,
skinfold→body-fat, menses estimation, volume display semantics. Product stories
blocked by unspecified formulas: roadmap planned-vs-actual comparisons,
dashboard computed summaries, check-in included averages, training volume
views. PENDING D-06: owner supplies formula definitions (or defers the dependent
stories). Recommendation: ship configurable _raw-value_ roadmap/dashboard
widgets first; add calculation-backed widgets per approved catalog entry.

---

## 8. Revised dependency roadmap

Classification of existing work (keep/adapt/defer/supersede):

| Existing item                                                            | Disposition                                                                | Rationale                                                                                                                                            |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity/auth/session/sessionVersion                                     | keep                                                                       | foundation for client self-service                                                                                                                   |
| Workspace/membership/ClientProfile/ClientAssignment/Consent/Audit models | keep                                                                       | domain §1 reuses them directly                                                                                                                       |
| Invite flow (Phase 3.1)                                                  | keep                                                                       | onboarding rides it (§4)                                                                                                                             |
| Password-reset foundation (Phase 3.2)                                    | keep — stays gated off                                                     | activation is a later adapter task                                                                                                                   |
| Authorization model + guard                                              | keep                                                                       | §5 maps brief roles onto it                                                                                                                          |
| Daily Tracker shell (Phase 1.1, staff, nonpersistent)                    | adapt → staff preview of a client-configured tracker once parameters exist | today it is PRGRSS-shaped and write-free; blueprint makes PRGRSS a starter config, so the shell's hardcoded sections become one template's rendering |
| Nutrition catalog route + import (Phase 2.1)                             | keep (staff catalog)                                                       | feeds food logging/search later; client surface is new work                                                                                          |
| Exercise catalog route + import (Phase 2.2)                              | keep (staff catalog)                                                       | feeds training prescription pickers                                                                                                                  |
| PRGRSS extraction pipeline + spec artifacts                              | keep (evidence + starter-config seed)                                      | no longer the universal schema                                                                                                                       |
| Phase 0.1 blueprint doc                                                  | supersede (preserved)                                                      | this document supersedes its universal-schema assumption only                                                                                        |
| Sheet/dev viewers (`/sheets`, `/daily` prototype flags)                  | defer → keep dev-only fail-closed                                          | unchanged policy                                                                                                                                     |
| Menses / peaking / showday / supplementation / PED-HRT                   | defer                                                                      | specialist modules; legal/consent gates open                                                                                                         |
| Wearables, migration, export                                             | defer                                                                      | intended direction; needs scoped contracts/providers                                                                                                 |
| Rate limiting, email adapter, canonical URLs                             | defer (unchanged deferrals)                                                | recorded in Phase 3.2 task record §8                                                                                                                 |

Recommended small slices (each independently reviewable; **no implementation
authorized by this document**):

1. _Parameter library + template draft/publish skeleton_ — config tables,
   PRGRSS starter seed, publish immutability. Acceptance: publish→edit→publish
   creates v2; v1 assignments untouched; unit/integration green.
2. _Client setup + variant switch_ — pin version, switch variant, history
   unchanged. Acceptance: variant flip preserves entry count/content (E2E at
   1440/834/390).
3. _Configured daily entry persistence_ — client `own`-scoped entry writes for
   selected parameters only. Acceptance: unselected parameter write denied (403);
   entry readable with write-time unit snapshot.
4. _Check-in v1_ — versioned form, submission, awaiting-feedback queue states.
   Acceptance: open≠respond; submit idempotent on retry.
5. Later: coach workspace surfaces, mealplan setup, training programs,
   messaging, habits — each gated on the earlier slices + owner decisions.

Prerequisite note: every slice needs its own plan doc, TDD, real-browser proof at
1440/834/390, and a different-model review before merge — the P-005 postmerge
audit recorded a missed premerge independent-review gate as a **historical
deviation; it is never retroactively satisfiable** and must not recur.

---

## 9. Synthetic acceptance scenarios (future tests — none exist yet)

Each is a stated acceptance criterion for the slice that introduces it; all run
against synthetic fixtures only, at desktop 1440px, tablet 834px, mobile 390px:

1. Variant switch preserves client IDs, entries, plans, check-ins, messages —
   byte-identical history before/after.
2. Editing a template publishes a new version; existing assignments show zero
   propagation until explicitly upgraded.
3. Parameter unit change renders old entries in original units with conversion
   provenance; relabel does not orphan history.
4. Cross-coach and cross-workspace reads of another client's data denied (403).
5. Coach note linked to a client never appears to that client (any client
   surface, direct action, or guessed URL).
6. Onboarding submit retry produces exactly one ClientProfile + one submission
   (idempotent); second distinct invite links the existing record.
7. Per-client meal plans/targets exist independently of template configuration;
   archiving an old nutrition option keeps it readable for its effective dates.
8. Week-based program edit at week N leaves weeks < N byte-identical and
   carries the change to weeks ≥ N.
9. Opening a check-in sets `openedAt` but never `respondedAt`; submission stays
   in awaiting-feedback until feedback submit.
10. Unapproved/unknown calculations are unavailable in roadmap/widget pickers
    (fail closed), not silently approximated.
11. `/reset-request` and `/reset` keep returning 404 and login keeps hiding the
    reset link while no delivery adapter is registered (P-005 invariants hold
    across the whole matrix).
12. Client task vs coach to-do: completion of a client task never touches coach
    work-item state and vice versa.

---

## 10. Traceability matrix

Brief ID → proposed domain/workflow → current capability → disposition
(dependency / owner decision).

| ID                | Brief function                                                                                     | Proposed domain/workflow                               | Current capability                 | Disposition                                            |
| ----------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------ |
| W01               | Roster (table/cards, filter/sort)                                                                  | Coach workspace roster over ClientProfile+Assignment   | No roster UI; models exist         | New slice 5; needs D-03                                |
| W02               | Attention summary                                                                                  | overdue/unread/pending aggregates                      | none                               | Slice 5; depends on check-ins+tasks                    |
| W03               | Client profile                                                                                     | profile + labels + check-in days + links               | ClientProfile model only           | Slice 5; labels need D-07                              |
| W04               | Coach notes + general notes                                                                        | coach notes private; general-note rule                 | `coach notes` matrix row           | Slice 5; **PENDING D-02**                              |
| W05               | Client tasks                                                                                       | ClientTask w/ completion+overdue                       | none                               | Slice 5; PROPOSED matrix row                           |
| W06               | Check-in calendar                                                                                  | recurring + ad-hoc dates                               | none                               | Slice 4+                                               |
| W07               | Universal coach work items                                                                         | CoachNote/CoachTask + client link                      | none                               | Slice 5                                                |
| W08               | Priority-message permission                                                                        | per-client flag on assignment/setup                    | none                               | Slice 5; PROPOSED field                                |
| W09               | Check-in history/awaiting                                                                          | submission states opened/responded                     | none                               | Slice 4                                                |
| W10               | Template library                                                                                   | TrackingTemplate/Version/Variant                       | none                               | Slice 1                                                |
| W11               | Onboarding form builder + send                                                                     | versioned intake form; submission→ClientProfile        | invite flow exists (identity only) | Slice 4; **PENDING D-01**                              |
| D01–D05           | Dashboard grid/widgets/sizing/client view                                                          | DashboardLayout+WidgetSelection; client published view | none                               | Slice 5+; **PENDING D-04**; calc widgets blocked by §7 |
| T01–T04           | Parameter library + units/ratings + daily entry                                                    | ParameterDefinition; DailyEntry `own`-scoped           | staff-only nonpersistent shell     | Slices 1–3 (adapt shell)                               |
| R01–R04           | Roadmap parameter/calculation/planning selection                                                   | RoadmapSelection binds approved calcs                  | none                               | Slice 5+; **BLOCKED on §7 catalog + D-06**             |
| N01–N08           | Meal-plan setup/targets/variants/logging/history                                                   | MealPlanConfig + effective-dated targets + FoodEntry   | nutrition staff catalog exists     | Slice 5+; food-provider contracts deferred             |
| P01–P08           | Prescription fields, volume, evergreen/week-count, carry-forward, set-note flags, future-set notes | TrainingProgram/SetLog/SetNote                         | exercise staff catalog exists      | Slice 5+; volume calc **PENDING §7**                   |
| C01–C07           | Check-in form builder, full/custom, review, video feedback, change summary                         | CheckInForm/Submission + FeedbackResponse              | none                               | Slice 4; video provider deferred                       |
| H (Habit Tracker) | optional habit feature, own setup/status                                                           | HabitDefinition/HabitStatus                            | none                               | Slice 5+; independent of Tracker                       |
| M01–M05           | Messaging, context links, controls, priority, review feedback                                      | Conversation/Message + context links                   | none                               | Slice 5+; attachment storage needs policy              |
| —                 | Wearables                                                                                          | connector direction                                    | none                               | Deferred; scoped contracts required                    |
| —                 | Migration/export                                                                                   | in/out coverage agreement                              | export/erasure matrix row only     | Deferred; scoped spec required                         |
| —                 | Show planning example                                                                              | optional roadmap content selection                     | none                               | Example only; does NOT authorize a module              |

## 11. Pending owner decisions (all PROPOSED, none APPROVED)

| ID   | Decision                                   | Options (recommendation first)                                                      | Blocks                    |
| ---- | ------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------- |
| D-01 | Pre-account intake?                        | No — intake rides invite (keeps one identity path) / Yes — separate intake token    | none if no                |
| D-02 | General-note visibility                    | Per-note coach-set flag, default private / all-private / all-shared                 | W04 general-notes UI      |
| D-03 | Template ownership scope                   | Workspace-shared library / per-coach private libraries / hybrid                     | W10 slice                 |
| D-04 | Coach↔client dashboard relationship        | Same layout, client sees visibility subset / separate client layout                 | D05 + roadmap client view |
| D-05 | Custom check-in vs scheduled dates         | Custom never satisfies a schedule unless coach marks it / auto-matches nearest date | C03/C04 + W06             |
| D-06 | Formula supply path                        | Owner supplies definitions per catalog contract / defer calc-backed widgets         | §7 stories                |
| D-07 | Profile label vocabulary (prep/lifestyle…) | Free-text coach labels + tag set / fixed enum                                       | W03                       |
| D-08 | First wearable provider + field mapping    | Apple Watch first (single provider pilot) / defer all                               | wearable direction        |
| D-09 | Video feedback provider                    | Loom-style embedded link first / in-house recording later                           | C06/M05                   |

Each row is a recommendation awaiting the product owner; nothing here is
approved. Option columns name the recommended model first, per the
single-recommendation rule — alternatives exist only to show the tradeoff.

---

## 12. Boundaries restated

- No real client data; fixtures synthetic; PRGRSS HTML exports and the brief
  file itself stay outside version control.
- No formulas implemented or inferred from values-only exports.
- No client-visible PED/HRT/menses behavior; no diagnoses; no automatic program
  changes.
- Invitation and password-reset scope unchanged; reset stays disabled.
- This document authorizes no implementation, push, merge, or deployment.
