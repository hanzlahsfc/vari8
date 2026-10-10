# Product-alignment blueprint — configurable coaching system

**Documentation only — no application code, schema, migration, dependency, route, or UI
change is authorized or implied by this document.** Author: Juno (SWE-2 High). Branch
`docs/p006-product-alignment-blueprint` off verified `main`
`25994573cca028ba804fddb6883f65746b0ca74f`. Task P-006; task record
`docs/tasks/p006-product-alignment-blueprint.md`.

**Direction source:** Lilly's functional development brief ("Core coaching system",
partner handoff, 1 October 2026), relayed by Hanzlah as current product direction —
a _product-direction reference_, not executable instructions. Where the brief is
silent, items are marked **PENDING** owner decision, never guessed.

**Evidence labels:** **SOURCE-CONFIRMED** = stated in the brief or in an approved
product decision; **PROPOSED** = recommended technical default awaiting owner
approval; **PENDING** = unresolved owner decision (options + recommendation +
what it blocks); **GAP** = no current capability and not yet specified enough to
build.

This blueprint **supersedes the universal-schema assumption** of
`docs/tasks/phase-0-1-source-blueprint.md` per Hanzlah's relayed P-006 direction
and the brief: PRGRSS 2.0 is repositioned as **one source-backed starter
configuration** inside a configurable system, not the permanent fixed schema. This
is confirmed current direction, not a pending question — the Phase 0.1 document's
underlying evidence (manifest, crosswalk, unknowns) is preserved as the
authoritative field-level record of the PRGRSS sources; a dated status notice was
added to its header. `docs/product-decisions.md` #2 carries a matching dated
addendum.

Product name remains undecided. "Nexus" is excluded; "Infinity Cr8" is business
context, not the product name.

---

## 0. What the brief changes

The earlier planning assumed one workbook (PRGRSS 2.0) defines the data model. The
brief redefines the product: a **configurable coaching system** in which each coach
assembles the client tool from a parameter library, saves it as a named template
with variants, and assigns it per client. PRGRSS 2.0 supplies the first real
starter configuration and source-fidelity evidence; it no longer bounds the
domain.

Central rule (SOURCE-CONFIRMED, invariant): **switching views/variants within a
client's assigned template must preserve the client's data and never require a new
tracker.** This drives the separation of _configuration_ (templates, versions,
variants, field definitions) from _client data_ (entries, plans, submissions,
messages) throughout this blueprint. The data-preservation invariant is
confirmed; the technical rules that implement it below are PROPOSED defaults.

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
- **CoachProfile / ClientProfile** — role-shaped profiles attached to a
  membership.
- **ClientAssignment** — owner-managed coach↔client link; never crosses
  workspaces; audited. This is the `assigned` authorization scope.
- **ConsentRecord, AuditEvent, AccessToken** — consent ledger, audit spine, and
  invite/reset token machinery. Reset stays gated off (§5, §9).

Brief-role mapping (corrected against the actual matrix): the brief's "coach"
corresponds to a **COACH member acting through the `assigned` scope** for client
data (read/write where the matrix grants it). **WORKSPACE_OWNER is not "the
coach"**: the owner holds `workspace`-scope reads on several client resources but
its writes are limited to administration (members, invitations, assignments,
settings, exports) — several client resources are owner **read-only**. Product
"coach" therefore maps to the assigned-coach capability, never to owner edit
privileges. "Client" = CLIENT member with a ClientProfile (`own` scope).
ASSISTANT_COACH exists in the schema (read-assigned/write-denied pending
sign-off). The brief defines no staff tiers — nothing beyond the existing matrix
is assumed.

### Configuration objects (proposed)

- _TrackingTemplate_ — named, workspace-owned configuration container. Key:
  (workspaceId, templateId). Holds versions; never holds client data.
- _TemplateVersion_ — immutable published snapshot of a template, including a
  frozen copy of every referenced parameter's metadata (label, unit, rating
  scheme, options) — **versioned snapshots, not live references**, so later
  edits to shared parameter metadata can never rewrite how historical data
  renders. (Item-level `required`/placement config is frozen inside the
  version's section/item structure, not the parameter — per decision #43.)
  Key: (templateId, versionSeq). Once published it never mutates.
- _TemplateVariant_ — named presentation alternative inside a version. Key:
  (versionId, variantKey). A variant is a _view selection_, not a data fork.
  (Earlier drafts gave "meal-plan-based vs IIFYM-based" as an example —
  corrected: meal-plan structure is SOURCE-CONFIRMED per-client
  `MealPlanConfig`, not template-editor configuration. No approved variant
  payload exists yet; the concept remains unimplemented and deferred — see
  §2 and product-decisions #63.)
- _ParameterDefinition_ — stable-identity field in the parameter library (§3).
  Parameter _data semantics_ (kind, unit family, rating scheme) are versioned;
  a TemplateVersion references parameter ID **and** the parameter-metadata
  snapshot it was published with.
- _CheckInFormDefinition_ — versioned questionnaire inside a TemplateVersion
  (question IDs stable across versions; question text snapshotted at publish).
- _OnboardingFormDefinition_ — workspace's intake form (versioned); includes the
  core profile fields plus coach-added questions.
- _DashboardLayout_ / _WidgetSelection_ / _RoadmapSelection_ — view
  configuration records inside a TemplateVersion (widgets, sizes, parameters,
  approved calculations only).

### Client-owned objects (proposed — always keyed to the client, never the template)

- _ClientSetup_ — the join: (clientProfileId) → assigned TemplateVersion +
  active variant + per-client plans. One active setup per client. **Distinct
  from ClientAssignment**: ClientSetup selects configuration; ClientAssignment
  grants authorization. Version/variant changes never modify ClientAssignment.
  **Update (product-decisions #49–#57):** the C1 product behavior — one current
  assignment, server-pinned latest published version, scoped cancellation,
  retained history — is approved; variant choice and per-client plans remain
  deferred (C3+, D-12); the concrete schema stays an engineering decision.
- _DailyEntry_ — client-owned dated measurement values keyed by **parameter
  identity** and carrying the **write-time metadata snapshot** (unit, rating
  scheme, label) so history renders as entered regardless of later
  configuration edits. **Update (product-decisions #64–#78, P-019):** the
  product rules are approved — one entry per client per declared date,
  append-only revisions, explicit save, client-only writes, fail-closed
  stale/revocation behavior, `GENERAL_HEALTH`-only eligibility, normalized
  parameter-keyed values, and binding structural-eligibility-vs-runtime-access
  constraints. Implementation and production remain separately gated; full
  record: `docs/tasks/p019-daily-entry-persistence-decisions.md`.
  **Update (product-decisions #79–#81, P-022):** read-only staff review is
  approved-but-not-implemented — authorized staff see each entry's latest
  revision + revision count only (no superseded values), one structural
  `READ` audit per committed explicit detail access, and client-facing
  staff-visibility disclosure is required before production enablement.
  Full record: `docs/tasks/p022-staff-daily-entry-review.md`.
- _ClientTargets / PlanSet_ — effective-dated coach-prescribed targets
  (nutrition/activity/etc.); each change appends a new effective-dated version;
  old versions stay readable for history and roadmap comparisons.
- _MealPlanConfig_ — per-client meal structure (count, labels, times, swaps,
  equivalent portions) and nutrition-variant schedule; built-in client-setup
  surface, **not** a template object (SOURCE-CONFIRMED: "built-in client setup
  rather than a meal-plan structure customized in the template editor").
- _TrainingProgram_ — per-client program: `EVERGREEN` or
  `WEEK_BASED(weekCount)`; prescriptions effective from a chosen week onward
  (§6 Training).
- _TrainingLog / SetLog / SetNote_ — client performance entries retaining
  exercise/set context; SetNote has an optional `flaggedForReview` marker.
- _HabitDefinition / HabitStatus_ — per-client habit setup (name, frequency,
  goal, reason) and dated status log. Independent of DailyEntry parameters
  (SOURCE-CONFIRMED separation).
- _CheckInSubmission_ — versioned questionnaire response (full or custom)
  attached to the client. Submissions are **immutable**: a resubmission creates
  a new revision, never overwrites the original. Raw submitted answers are
  retained **under the approved retention/deletion/consent policy**
  (ConsentRecord + product-decisions #26 token-retention precedent); the
  duration and enforcement rule for submissions is **PENDING D-10**. Note: a
  retained submission is live client data inside the application's store under
  that policy — categorically different from committing raw source/client data
  to Git, which stays forbidden. States: `submittedAt`, `openedAt`,
  `respondedAt` are distinct timestamps (§6).
- _CheckInSchedule_ — per-client recurring day(s)/frequency plus
  coach-requested additional out-of-plan dates.
- _Conversation / Message_ — coach↔client channel; messages may carry voice
  notes, files, photos and videos (M01) and optional context links
  (workout/meal/check-in references) plus a client-permitted priority flag.
- _CoachNote / CoachTask_ — coach-private work items, optionally linked to a
  client for coach-facing profile context; never client-visible (§5 records the
  current-vs-proposed privacy boundary).
- _ClientTask_ — item deliberately assigned to the client with its own
  completion/overdue state. Distinct type from CoachTask (SOURCE-CONFIRMED).
- _FeedbackResponse_ — coach's reply to a CheckInSubmission: video-feedback
  reference, text, and auto-generated change-summary links to updated plans.
- _OnboardingSubmission_ — versioned intake response that creates/links the
  coaching client record (§4); immutable, revision-on-resubmit, retained under
  the same pending retention policy.

### Conceptual constraints

- All client-data objects carry (workspaceId, clientProfileId); every access is
  authorized through `authorize()` — configuration or route presentation can
  never widen it.
- Deleting/archiving a template or parameter never deletes client data; reads of
  historical entries resolve the parameter identity and its write-time
  metadata snapshot.
- Where multiple coaches hold active ClientAssignments to one client
  (matrix-supported), template _editing_ is a workspace-library operation while
  _that client's setup_ (variant choice, per-client overrides, plans) is
  editable by that client's assigned coaches only — multi-coach edit rights for
  a shared active setup are **RESOLVED (D-11, product-decisions #52)**: any
  currently ACTIVE assigned coach may manage the client's template assignment,
  audited; a revoked or unassigned coach fails closed; assistant coaches stay
  write-denied. (Template library is workspace-shared — D-03 RESOLVED,
  product-decisions #41–#42.)

---

## 2. Template / version / variant rules

Lifecycle (PROPOSED mechanics implementing the brief's "name, save, assign"
flow; **P-015 update:** the C1 subset — server-pinned latest-published
assignment, scoped cancellation, retained history, archive effects — is
APPROVED and implemented per product-decisions #49–#57; **P-017 update:** the
C2 product rules — latest-published-only upgrade target, any-earlier-retained
rollback target, frozen archived templates, mandatory structural review, and
timing — are APPROVED per product-decisions #58–#62 with implementation
explicitly deferred until immediately before DailyEntry or another first
data-consuming slice; **P-018 update:** C3 template variants are DELIBERATELY
DEFERRED — product-decisions #63 records that no approved variant payload
exists; both C3 decisions and implementation await a specifically named,
approved variant-controlled consumer; per-parameter visibility (C4) remains
PROPOSED/pending):

- **Draft** — mutable; workspace-staff visible; assignable to nothing.
- **Publish** — freezes the draft into an immutable TemplateVersion containing
  snapshotted parameter/question metadata. Assignments pin to a version, never
  to the mutable template.
- **Edit** — opens a new draft seeded from a chosen version. Publishing creates
  versionSeq+1; existing assignments stay pinned to their version.
- **Upgrade** — explicit coach action reassigning a client to the template's
  **latest published version only, selected by the server** (**C2 rule
  APPROVED**, product-decisions #58; implementation deferred per #62). The
  earlier proposal text (coach-reviewed mapping record, atomic repin, flagged
  conflicts) is retained as the engineering shape of the approved mandatory
  structural review: an upgrade produces a structural change summary (added /
  removed / moved / required-or-semantic-changed items) that the coach reviews
  and confirms before applying; the repin applies **atomically** — a failed or
  unconfirmed review never leaves the client half-upgraded. A version
  published between review and apply invalidates the review (stale, refresh
  required). Nothing upgrades automatically; editing a template never moves
  any client. Conflicts (e.g. a removed parameter) are flagged to the coach,
  not auto-resolved; data-aware blocking rules are defined with the first
  data-consuming slice, not pre-decided here.
- **Rollback** = explicit reassignment to any earlier retained published
  version of the same template (**C2 rule APPROVED**, product-decisions #59;
  implementation deferred per #62). The target need not have been previously
  used by the client; same-version transitions are not offered; rollback never
  changes `ClientAssignment`. Versions are retained, not destroyed (PENDING
  retention policy family, D-10).
- **Archive/retire** — hides the template from new assignment; existing
  assignments keep working. **APPROVED for template assignments**
  (product-decisions #53): archived templates cannot be newly assigned;
  existing pins to their immutable versions stay effective and readable;
  archive never silently cancels or rewrites client setup/history; authorized
  cancellation remains possible. **Upgrade/rollback interaction RESOLVED
  (product-decisions #60):** archived templates are frozen — no upgrade or
  rollback may create a new pin on an archived template; the exit path is
  cancellation followed by assignment of a different eligible template.
- **Variant switch** — picks another TemplateVariant inside the _same_ assigned
  version (C3 — **deferred by decision #63: no approved payload exists**; both
  product decisions and implementation await a named approved consumer).
  SOURCE-CONFIRMED invariant (preserved regardless): identical
  client/assignment/history/plans/check-ins/messages; no new tracker; nothing
  deleted; ClientAssignment untouched. All variant mechanics — stable keys,
  tombstones, defaults, archive interaction, upgrade mapping, persistence
  shape, authority, audit, UI — remain unresolved and non-binding.

Per-client configuration and precedence (PROPOSED):

- "Client-overridable" means **per-client configuration stored on the client
  setup and edited by an authorized assigned COACH** — not self-service writes
  by the CLIENT principal. Actor permissions are unchanged by configuration
  precedence: a plan-value override is a coach write under `assigned` scope; it
  can never grant the CLIENT writes the matrix denies (e.g. `meal plans` stays
  client `own` **read-only** today). Any expanded client edit rights need an
  owner decision (D-12/D-14).
- Precedence order (configuration resolution, not authorization): per-client
  setup override → variant selection → versioned template defaults →
  parameter-library defaults. **Library defaults are resolved and snapshotted
  into the TemplateVersion at publish** — a later library edit never changes
  what a pinned version means (no live fallback).
- Permitted per-client overrides: active variant, per-parameter show/hide
  within the version's selected set, and per-client plan/target values.
  **Limits:** a client setup may not add parameters outside the assigned
  version's selected set, and may not alter parameter types/units — those
  require a version upgrade. Which elements are per-client configurable at
  all is **PENDING D-12** (recommendation: the three listed above only).
- Upgrade/rollback override handling (**PENDING D-12** — per-client overrides
  do not exist yet; C2 decision #58–#62 did not resolve them): on a version
  repin, per-client overrides that remain compatible are **retained**;
  overrides referencing removed or incompatibly-changed parameters are
  **flagged to the coach and rejected before the repin applies** — never
  silently reset, never dropped history.
- What survives upgrade/rollback: all client data, all prior version snapshots
  needed to render it, plan/target effective-dated history, submissions,
  messages, habit data.

Field-change rules (PROPOSED):

- Parameter identity = stable ID. Labels/descriptions may change; the published
  snapshot preserves what clients saw.
- **Unit change**: recorded as a unit-conversion record (from→to, factor/offset,
  appliedAt, provenance). Old data remains stored/readable in original units;
  display converts. **Rating-scheme change (1–10 ↔ 1–5 ↔ word-labels):** never
  an implicit conversion — a scheme change creates a new parameter version;
  historical ratings render in their original scheme. (Helios finding folded
  in: preservation is explicit, not implied.)
- **Type change** (number→rating, etc.): not in-place — add a new parameter,
  hide the old; old data stays readable.
- **Adding** a parameter: visible going forward; history shows "not collected".
- **Hiding**: removes from entry UI and default views; data retained, readable
  in history/exports.
- **Removing** a check-in question does not delete prior answers — the
  versioned form snapshot keeps the question text for old submissions.

Terminology locked (SOURCE-CONFIRMED): _template variant_ (overall presentation;
switch preserves data) ≠ _nutrition variant_ (meal/target schedule or manually
selected nutritional option) ≠ _template-version upgrade_ (explicit
reassignment).

---

## 3. Configurable parameter library

_Approved_ P-014 contract for each _ParameterDefinition_
(product-decisions #41–#45; binding details in
`docs/tasks/p014-parameter-template-foundation.md`):

- **Identity:** a server-minted opaque stable key — immutable, never
  reusable, never caller-chosen; human naming lives in `label`. `kind` ∈
  {measurement, rating, time, duration, option, text} — immutable from
  creation.
- **Semantic metadata:** `unit` (measurement/time/duration only),
  `ratingScheme` ∈ {scale-1-10, scale-1-5, word-labels} (ratings only), and
  option identity/value set (OPTION kind only; option IDs server-minted,
  never reused) — editable only before the parameter first appears in a
  published template; afterwards a change requires a new parameter with a
  new key. `validation`, if included in the first implementation, is
  declarative `min`/`max` only, is semantic metadata (same post-publish
  lock), and is omitted entirely if its semantics cannot be made
  unambiguous — patterns, formulas, expressions, arithmetic, conditional or
  cross-field rules, and derived output are never part of P-014.
- **Placement fields are NOT on the parameter:** `required`/optional/hidden
  placement behavior belongs to the template item, per decision #43.
- `group` may carry the coarse library grouping (bodyweight, health, sleep,
  activity, biofeedback, nutrition, …).
- **Deferred wider contract (NOT P-014 implementation scope):**
  `source`/wearable provider configuration, `defaultVisibility`, dashboard/
  roadmap/check-in bindings, variants, and per-client overrides are future
  conceptual fields awaiting their own reviewed slices — they authorize
  nothing here.
- **Broader future direction (NOT P-014 scope):** the same contract is
  intended to type the library entries for tracker fields, dashboard widget
  data sources, roadmap selections, exercise prescription fields
  (tempo/set-type/rest etc. — P01), and versioned check-in form questions.
  Those consumers are not part of P-014 — their permissions, formulas,
  visibility rules, assignments, and persistence remain separately gated;
  P-014 provides only the staff-managed parameter/template foundation.
- **PRGRSS 2.0 ships as one source-backed starter configuration** —
  _deferred per product-decisions #48_: the initial parameter/template
  foundation slice ships **without** a seed — it supports authorized
  staff-created parameter definitions (owner + coach), with synthetic
  fixtures for development/test evidence only. A future starter set is a
  separate slice with its own source-fidelity review: every field
  enumerated with per-field evidence and no inferred
  units/schemes/enums/bounds; `CALORIES` stays excluded absent new
  evidence. Authorized workspace owners or coaches may add, hide, or
  relabel; a starter set is never
  mandatory and never blocks specialist history — a coach who removes a
  group still retains any client data logged against it
  (hidden-but-readable).
- Specialist fields are **excluded from the starter set**: menses cycle/HRT,
  peaking, show-day, and supplementation parameters are not seeded at all.
  Per `docs/security/authorization-model.md` (cycle/bloodwork ⚠ gates; PED/HRT
  hard-denied for every role pending legal/policy sign-off) and
  `docs/open-questions.md` #13, those domains need owner/legal approval before
  they exist even as library candidates. (Correction vs. draft: earlier text
  wrongly cited product-decisions #13 and ambiguously allowed "disabled
  candidates"; the consistent rule is full exclusion until sign-off.)

---

## 4. Onboarding — end to end

SOURCE-CONFIRMED flow (brief "Client onboarding and setup" + W11): coach builds
a custom intake form including core profile fields → sends it → the submission
**creates the client record automatically and retains the full form** → coach
assigns a template → sets plans/targets/habits → configures recurring +
additional out-of-plan check-in dates.

Reconciliation with the implemented invite-first identity workflow (PROPOSED,
explicit order):

1. **Invitation issued** — a durable _invitation/request record_ is created:
   (workspaceId, email, intendedRole=CLIENT, invitationId). The raw access token
   remains credential material only — it expires (12h), is re-issued on resend,
   and token rows are deletable after 30 days (product-decisions #17/#26).
   **A raw bearer token or its hash is never a domain identity, idempotency
   key, or long-lived foreign key.**
2. **Identity acceptance** (existing Phase 3.1 behavior, unchanged) — two
   explicit paths:
   - **New user:** sets a password at acceptance; User + ACTIVE CLIENT
     membership + ClientProfile shell are created and linked.
   - **Existing user:** must sign in as the _exact invited email_
     (product-decisions #20); acceptance links the existing identity to the
     workspace/client profile — no password reset, no duplicate identity.
3. **Intake submission** — the onboarding form (versioned) binds to the
   durable invitationId and the clientProfileId. The submission carries its own
   durable `submissionId`; it **populates the coaching client record** (core
   profile fields + full retained form) — today Phase 3.1 already creates the
   ClientProfile at acceptance; "submission creates the client record" is
   satisfied in the workflow sense that the client becomes coaching-ready only
   after intake. Which answers may populate profile fields is a separate
   field-catalog decision (still pending). Update (P-012 closure,
   product-decisions #30–#40): the identity/entry path is APPROVED; assignment
   authority, lifecycle, cardinality, and pinning are APPROVED for a
   staff-only slice. **Update (P-023 closure, product-decisions #82–#85):**
   a dev-gated client submission slice is APPROVED in product terms —
   synthetic-only, default-off, production fail-closed, no resubmission in
   v1 — but real-answer collection remains BLOCKED on the pending consent
   (#38) and retention (#39/D-10) gates, and implementation itself is not
   yet begun (it requires a separate implementation prompt after the
   decision record merges).
4. **Retries/concurrency** — idempotent on `submissionId`/attempt keys: a
   retried POST returns the same submission; duplicate invites for the same
   (workspaceId, email) reuse the open invitation rather than stacking.
   A second _distinct_ client-invite for an identity that already holds an
   ACTIVE client record links to the existing ClientProfile — never a
   duplicate record.
5. **Re-invites after SUSPENDED/REMOVED** — honor product-decisions #21: never
   silently restored; an explicit new invitation links the _same_ identity and
   its preserved history rather than minting a duplicate client.
6. **Resubmission** — a corrected/refreshed intake creates a new immutable
   revision linked to the same submission chain; the original is never
   overwritten. **Update (product-decisions #82):** v1 ships **no**
   resubmission — COMPLETED is terminal and a future re-intake workflow
   needs its own approved decision; this source-described revision model
   remains deferred.

Current staff routes are **not** client self-service: `/workspace/[id]/daily`,
`/nutrition`, `/exercises` are staff-only surfaces. Client surfaces are new work
under the `own` scope (§5); nothing here assumes existing routes become
client-visible.

**D-01 — RESOLVED (product-decisions #30, P-012 closure):** intake is
authenticated and post-invite only; no anonymous or pre-account intake variant
exists. Note: only the entry path is resolved — the submission mechanics above
remain gated on the pending consent/retention decisions (product-decisions
#38–#39).

---

## 5. Ownership and permissions

Mapping onto the actual matrix (`docs/security/authorization-model.md`), not
inventing capabilities:

- Coach roster/profile access = `assigned` scope on client resources; roster
  listing = collection query scoped by workspace + assignment. Multiple active
  coach assignments per client remain supported.
- **Coach notes/to-dos — current vs proposed.** The existing `coach notes`
  matrix row grants OWNER `workspace` read and ASSISTANT_COACH / other
  assigned coaches `assigned` read — it is workspace-scoped staff visibility,
  **not** author-only privacy. The brief's "internal notes" direction
  (SOURCE-CONFIRMED: linked coach items stay part of the coach workspace,
  never client-visible) is satisfied today at the client boundary; whether
  staff visibility should narrow to author-only is **PENDING D-13**
  (recommendation: keep workspace-scoped staff read — covers coach absence;
  client read stays denied either way). A note _linked_ to a client appears in
  that client's coach-facing profile only; linkage never widens visibility.
- **Client tasks** = new resource `client tasks` (own/own for CLIENT; asg/asg
  for coach) — separate from `coach notes`. PROPOSED matrix row, pending owner
  sign-off.
- General-notes area visibility (W04): **PENDING D-02** — "needs a defined
  rule". Recommendation: coach-only by default with a per-note
  `visibleToClient` flag. Blocks the general-notes client surface only.
- Priority messaging permission (W08/M04): PROPOSED per-client boolean
  `maySendPriorityMessages` on the client setup/assignment; governs
  flagged-message notification only — orthogonal to set-note flags (§6).
- Reassignment/deactivation: owner-managed ClientAssignment changes are
  audited. **Deactivation wording corrected:** records are _preserved_ under
  retention policy, but _access fails closed_ — a non-ACTIVE user, membership,
  or workspace is denied immediately regardless of preserved data; history
  remains readable only to still-authorized ACTIVE staff.
- Attachments follow `private media/files` (asg/asg coach, own/own client).
- Health-data access stays server-enforced, workspace/role-scoped,
  consent-aware, audited — configuration can never grant it.
- Invite/password-reset scope unchanged: reset routes stay gated off
  (`lib/auth/password-reset-delivery.ts`, empty frozen registry). Public
  activation requires **all** of the deferred preconditions — a real registered
  adapter **plus** route rate limiting, request-path timing equalization, and
  token→cookie hardening — each reviewed before exposure. Adapter registration
  alone is never approval: the registry going non-empty flips the capability
  gate, so a future adapter must not ship until the full precondition set has
  been reviewed together.

---

## 6. Connected workflows and views

The six core client tabs (SOURCE-CONFIRMED set): **Dashboard, Tracker,
Timeline/Roadmap, Mealplan, Training Program, Check-In**, plus optional
**Habit Tracker** and **Messaging**.

Data contracts:

- Daily measurements → feed dashboard widgets, roadmap summaries, and check-in
  included-summaries — via _selected_ parameters only; an unselected parameter
  is never silently surfaced.
- Meal plans/targets + food entries → daily totals, roadmap comparisons,
  check-in summaries. Target comparisons evaluate against the _applicable_
  nutrition variant for that date.
- Training prescriptions + logged sets → training view, configured volume
  display, check-in review (with flagged set notes in context).
- Check-in submissions → awaiting-response overview; opening ≠ responding —
  `openedAt` on view, `respondedAt` on feedback submit; the submission stays
  awaiting-feedback until responded (SOURCE-CONFIRMED).
- Habit definitions/statuses → habit widgets and check-in summaries read the
  habit store only; Tracker measurement fields never carry habit data.
- Post-submit entry edits and plan/client-record edits need rules
  (**PENDING D-14** — recommendation: client daily entries are editable same-day
  with an edit history retained; coach plan edits always produce new
  effective-dated versions, never in-place mutation).

Tab rules (SOURCE-CONFIRMED where cited):

- **Dashboard (D01–D05):** iOS-widget-style grid; widget gallery grouped by
  type; per-widget parameter/summary configuration; size adapts detail level.
  Coach configures; client sees published content — the coach↔client layout
  relationship is **PENDING D-04** (recommendation: same layout, client sees
  the client-visibility subset).
- **Tracker (T01–T04):** parameter-library selection drives entry fields;
  units and rating scheme are template-level configuration applied
  consistently across connected views; mobile+desktop easy entry.
- **Timeline/Roadmap (R01–R04):** coach-selected parameters + _approved_
  calculations + planning info. The brief's list (phase, planned/actual
  bodyweight, ROG/ROL, nutrition, activity, circumferences/skinfolds, show
  planning) is illustrative — **not** a fixed field set and **not** approved
  calculations (§7).
- **Mealplan (N01–N08):** per-client meal structure; fixed/range/minimum
  targets; nutrition-variant schedules; archived effective-dated options;
  food logging (search, barcode scan, custom foods, quick-add — provider
  contracts deferred); **reusable entries — recipes/favorites, copying previous
  meals or whole days, serving adjustment (N05)**; coach review of entries.
- **Training (P01–P08):** prescription-field selection in the template;
  evergreen or week-count programs; carry-forward rule (SOURCE-CONFIRMED):
  week N mirrors week N−1 until a coach change, which applies from that week
  onward while earlier weeks retain their instructions; set notes keep
  exercise/set context; coach notes may target future sets; volume display is
  a configured view — volume semantics/calculation PENDING (§7).
- **Check-In (C01–C07):** versioned form builder; included-summary selection;
  full vs custom (bodyweight-default) submissions; review opens submission +
  tracker + flagged notes; integrated video feedback; automatic change-summary
  with links to changed plans. Custom check-in vs scheduled dates:
  **PENDING D-05** (recommendation: a custom submission satisfies a scheduled
  date only when the coach marks it as covering it).
  **Update (P-025 closure, product-decisions #92–#97):** a dev-gated
  Check-In v1 is APPROVED in product terms — one-off staff-scheduled
  instances on immutable published forms, one due timestamp with visibly
  marked late submission, owner+coach management (owner cannot mark),
  terminal staff acknowledgement only, and cancellation only before
  submission. Recurrence, custom Check-Ins (D-05 stays pending), and
  rich feedback stay deferred. Synthetic-only, default-off, production
  fail-closed; implementation requires a separate authorized prompt.
- **Habit Tracker:** optional per-template feature; per-client habit
  definitions/frequency/goals/reasons; own status log.
- **Messaging (M01–M05):** WhatsApp-like thread; **voice notes, files, photos
  and videos** (M01); context links to workout/meal/check-in; coach
  availability/notification prefs; conversation search and reply snippets;
  per-client priority flag honored with distinct attention; feedback submit
  from the check-in workflow. Context links survive variant switches
  (SOURCE-CONFIRMED).
- **Coach workspace (W01–W11):** roster table/cards with filter/sort;
  attention surface (overdue check-ins, unread flags, pending tasks); profile
  with labels (e.g. prep/lifestyle), coaching start date/duration indicator,
  recurring check-in day(s) and additional dates; private notes + general
  notes; client tasks; check-in calendar from recurring + out-of-plan dates;
  universal coach work items linkable to a client; template library;
  onboarding builder.
- **Deferred direction (not implemented here):** wearable connectors
  (providers, imported-measurement mapping, sync/manual-entry handling all
  need separately scoped contracts), migration, export. Recorded as intent;
  no authorization implied.

---

## 7. Calculation governance

No formula ships from values-only exports (product-decisions #7;
open-questions "Underivable semantics"). PROPOSED catalog contract for every
calculation:

- `calculationId`, version, provenance (definer + source document/decision
  link), input parameter IDs + required history window + timezone rule, output
  type/unit, missing-data semantics (skip/null/partial), duplicate-entry
  policy, outlier handling, rounding/display rule, reproducibility requirement
  (recompute from stored inputs + code version; snapshots optional),
  supported-parameter mapping, owner-approval state, and fixtures with
  expected outputs.
- **Nothing computes until a catalog entry exists AND the owner approves it.**
  Roadmap/dashboard widgets bind only approved calculations.

Requested-but-blocked candidates (UNKNOWN formulas — open-questions #3–#10;
brief roadmap examples): weekly averages/trends (Δkg/Δ%), ROG/ROL
planned-vs-actual, adherence %, calorie column, meal subtotals, T-minus,
skinfold→body-fat, menses estimation, volume semantics. Blocked product
stories: roadmap planned-vs-actual comparisons, computed dashboard summaries,
check-in included averages, training volume views. **PENDING D-06**: owner
supplies formula definitions (or defers the dependent stories).
Recommendation: ship configurable _raw-value_ widgets first; add
calculation-backed widgets per approved catalog entry.

---

## 8. Revised dependency roadmap

Classification of existing work (keep/adapt/defer/supersede):

| Existing item                                                            | Disposition                                                                | Rationale                                                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Identity/auth/session/sessionVersion                                     | keep                                                                       | foundation for client self-service                                                                     |
| Workspace/membership/ClientProfile/ClientAssignment/Consent/Audit models | keep                                                                       | §1 reuses them directly                                                                                |
| Invite flow (Phase 3.1)                                                  | keep                                                                       | onboarding rides it (§4)                                                                               |
| Password-reset foundation (Phase 3.2)                                    | keep — stays gated off                                                     | activation needs adapter + rate limiting + timing equalization + token→cookie, all reviewed first (§5) |
| Authorization model + guard                                              | keep                                                                       | §5 maps brief roles onto it                                                                            |
| Daily Tracker shell (Phase 1.1, staff, nonpersistent)                    | adapt → staff preview of a client-configured tracker once parameters exist | hardcoded PRGRSS sections become one template's rendering                                              |
| Nutrition catalog route + import (Phase 2.1)                             | keep (staff catalog)                                                       | feeds food logging/search later; client surface is new work                                            |
| Exercise catalog route + import (Phase 2.2)                              | keep (staff catalog)                                                       | feeds training prescription pickers                                                                    |
| PRGRSS extraction pipeline + spec artifacts                              | keep (evidence; starter seed deferred per #48)                             | no longer the universal schema                                                                         |
| Phase 0.1 blueprint doc                                                  | supersede (preserved)                                                      | this document supersedes its universal-schema assumption only                                          |
| Sheet/dev viewers (`/sheets`, `/daily` prototype flags)                  | defer → keep dev-only fail-closed                                          | unchanged policy                                                                                       |
| Menses / peaking / showday / supplementation / PED-HRT                   | defer                                                                      | specialist modules; legal/consent gates open                                                           |
| Wearables, migration, export                                             | defer                                                                      | intended direction; needs scoped contracts/providers                                                   |
| Rate limiting, email adapter, canonical URLs                             | defer (unchanged deferrals)                                                | Phase 3.2 task record §8                                                                               |

Recommended slice order (each independently reviewable; **no implementation
authorized**). Onboarding is first because intake is the prerequisite for any
client existing — it cannot trail the persistence slices:

1. _Onboarding form + submission → client record_ — versioned intake,
   idempotent submission, durable IDs per §4. Acceptance: retry → one
   ClientProfile + one submission revision; re-invite links existing identity
   (PD#21); E2E at 1440/834/390.
   **Update (P-023, product-decisions #82–#85):** the form builder (P-008)
   and staff assignment layer (P-013) are merged; the client submission
   slice is independently reviewed PASS and owner-approved for
   **synthetic-only, default-off, production-fail-closed** development —
   no resubmission in v1, no staff answer-review surface, no drafts.
   Real-answer collection stays blocked on #38/#39/D-10; implementation
   requires a separate authorized prompt.
   **Update (P-024 closure, product-decisions #86–#91):** a dev-gated
   staff review surface over submitted onboarding responses is APPROVED
   in product terms — one terminal workspace-wide review per submission,
   informational only, explicit detail reads structurally audited,
   UI-sequenced mark with independent server re-authorization, bounded
   staff-only reviewer identity. Synthetic-only, default-off, production
   fail-closed; implementation requires a separate authorized prompt.
2. _Parameter library + template draft/publish skeleton_ — config tables,
   authorized staff-created definitions (owner + coach per #41–#42), publish
   immutability + snapshots. No source-derived seed ships in this slice
   (#48); development/test evidence uses synthetic fixtures. Acceptance:
   create draft → publish immutable v1 → edit a later draft → publish v2;
   v1 remains byte/semantically unchanged; no assignment or propagation
   behavior exists yet; unit/integration green.
3. _Client setup_ — reviewed decomposition (P-015): **C1** client-setup
   identity + latest-published assignment + cancellation/history (**product
   behavior APPROVED — product-decisions #49–#57**; acceptance: assign yields
   one current assignment + retained history, cancel works for authorized
   actors only, assistant/client read rules hold — E2E at 1440/834/390);
   **C2** explicit upgrade/rollback with reviewed structural diff (product
   rules APPROVED — product-decisions #58–#62; implementation DEFERRED until
   immediately before DailyEntry or another first data-consuming slice, not
   authorized);
   **C3** versioned variants + switching (DEFERRED by product-decisions #63 —
   no approved variant payload exists; both decisions and implementation await
   a named variant-controlled consumer; the data-preservation invariant is
   preserved);
   **C4** per-parameter visibility (PENDING).
4. _Configured daily entry persistence_ — client `own`-scoped writes for
   selected parameters only, write-time metadata snapshot. Acceptance:
   unselected parameter write denied (403); entry readable as entered.
   **Sequencing note (product-decisions #62–#63, P-019 #64–#78):** the
   DailyEntry product rules are now approved; it does not require C3 or C4.
   Fixed order ahead: corrected C2 data-aware plan (folding #71's
   warn/confirm/block rules) → independent review → separately authorized
   C2 implementation/merge → separately authorized dev-gated DailyEntry
   implementation/merge → D-10/consent/privacy readiness → deployment by
   separate authorization. C2 must merge before DailyEntry. Nothing here
   authorizes C2 or DailyEntry implementation, production enablement, or
   deployment.
5. _Check-in v1_ — versioned form, immutable submissions, awaiting-feedback
   states. Acceptance: open≠respond; submit idempotent.
6. Later: coach workspace surfaces (W01–W11 remainder), mealplan setup,
   training programs, messaging, habits — each gated on earlier slices +
   owner decisions.

Every slice needs its own plan doc, TDD, real-browser proof at 1440/834/390,
and a different-model review **before** merge — the P-005 postmerge audit
recorded a missed premerge independent-review gate as a **historical
deviation; it is never retroactively satisfiable** and must not recur.
Version/upgrade/override policies (§2) additionally need owner sign-off before
their slices ship. **Update (P-014 approvals, #41–#48):** for the
parameter/template foundation slice, the draft → immutable-publish →
terminal-archive mechanics, semantic-stability rule, archived-reference
fail-closed rule, and duplicate-name policy ARE approved; upgrade/rollback/
variant/override policy remains PENDING and untouched — no assignments or
propagation exist in that slice. **Update (P-015 approvals, #49–#57):** only
C1 client-setup product behavior is approved — one current assignment per
client, server-pinned latest published version, scoped cancellation, D-11
any-assigned-coach editing, archived-template rules, history visibility,
deferred cross-template change, terminology, and the interim data posture
(immutable through ordinary product editing — never legally undeletable;
retention/erasure pending D-10/legal). **Update (P-017 approvals, #58–#62):**
the C2 product rules are approved — server-selected latest-published upgrade
target, any-earlier-retained rollback target, frozen archived templates,
mandatory bound structural review (including empty diffs, stale-fails-closed),
and deferral of implementation until immediately before DailyEntry or the
first data-consuming slice; free-text transition reasons are excluded pending
D-10/legal. **Update (P-018 approval, #63):** C3 template variants are
deliberately deferred — no approved payload exists; both decisions and
implementation await a named variant-controlled consumer; the
data-preservation invariant is preserved; all variant mechanics remain
non-binding. C4 per-parameter visibility remains PENDING/proposed; nothing
about these records authorizes implementation.

---

## 9. Synthetic acceptance scenarios (future tests — none exist yet)

Acceptance criteria for the slice that introduces each; synthetic fixtures
only, at desktop 1440px, tablet 834px, mobile 390px:

1. Variant switch preserves client IDs, entries, plans, check-ins, messages —
   identical history before/after.
2. Template edit publishes a new version; zero propagation to existing
   assignments until explicit upgrade.
3. Unit change renders old entries in original units with conversion
   provenance; rating-scheme change preserves old ratings in the original
   scheme; relabel never orphans history.
4. An **unassigned or unauthorized** coach is denied another coach's client
   data (403); multiple _assigned_ coaches retain access per the matrix.
5. A coach note linked to a client never appears to that client (any surface,
   direct action, or guessed URL).
6. Onboarding submit retry yields exactly one ClientProfile + one immutable
   submission revision; a distinct re-invite links the existing record;
   re-invite after removal requires explicit new invite (PD#21).
7. Per-client meal plans/targets exist independently of template config;
   archived nutrition options stay readable for their effective dates.
8. Week-based program edit at week N leaves weeks < N byte-identical and
   carries the change to weeks ≥ N.
9. Opening a check-in sets `openedAt` but never `respondedAt`; awaiting-
   feedback persists until feedback submit.
10. Unapproved/unknown calculations are unavailable in pickers (fail closed),
    not silently approximated.
11. `/reset-request` and `/reset` keep returning 404 and login keeps hiding
    the reset link while no delivery adapter is registered.
12. Client-task completion never touches coach work-item state and vice
    versa.
13. Client same-day entry edit retains prior values in edit history;
    coach plan edits never mutate prior effective-dated versions.

---

## 10. Traceability matrix

Brief ID → proposed domain/workflow → current capability → disposition.

| ID            | Brief function                                                                                       | Proposed domain/workflow                             | Current capability                                                           | Disposition                            |
| ------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| W01           | Roster (table/cards, filter/sort)                                                                    | workspace roster over ClientProfile+Assignment       | P-010 read-only staff roster exists; filtering/sort/profile features pending | Slice 6                                |
| W02           | Attention summary                                                                                    | overdue/unread/pending aggregates                    | none                                                                         | Slice 6; needs check-ins+tasks         |
| W03           | Client profile                                                                                       | profile + labels + check-in days + links             | ClientProfile model only                                                     | Slice 6; D-07                          |
| W04           | Coach notes + general notes                                                                          | staff-visible internal notes; general-note rule      | `coach notes` matrix row                                                     | Slice 6; **D-02, D-13**                |
| W05           | Client tasks                                                                                         | ClientTask completion/overdue                        | none                                                                         | Slice 6; PROPOSED matrix row           |
| W06           | Check-in calendar                                                                                    | recurring + additional out-of-plan dates             | none                                                                         | Slice 5                                |
| W07           | Universal coach work items                                                                           | CoachNote/CoachTask + client link                    | none                                                                         | Slice 6; D-13                          |
| W08           | Priority-message permission                                                                          | per-client flag on setup/assignment                  | none                                                                         | Slice 6; PROPOSED field                |
| W09           | Check-in history/awaiting                                                                            | submittedAt/openedAt/respondedAt states              | none                                                                         | Slice 5                                |
| W10           | Template library                                                                                     | CoachingTemplate/Version + ParameterDefinition       | none                                                                         | Slice 2; D-03 resolved (#41–#48)       |
| W11           | Onboarding builder + send                                                                            | versioned intake; submission→client record           | invite flow (identity only)                                                  | **Slice 1**; D-01                      |
| D01–D05       | Dashboard grid/widgets/sizing/client view                                                            | DashboardLayout+WidgetSelection                      | none                                                                         | Slice 6; D-04; calc widgets §7-blocked |
| T01–T04       | Parameter library + units/ratings + entry                                                            | ParameterDefinition; DailyEntry `own`                | staff-only nonpersistent shell                                               | Slices 2–4 (adapt shell)               |
| R01–R04       | Roadmap parameter/calc/planning selection                                                            | RoadmapSelection binds approved calcs                | none                                                                         | Slice 6; **BLOCKED §7 + D-06**         |
| N01–N08       | Mealplan setup/targets/variants/logging/history incl. N05 recipes/favorites/copy-meals+days/servings | MealPlanConfig + effective-dated targets + FoodEntry | nutrition staff catalog                                                      | Slice 6; provider contracts deferred   |
| P01–P08       | Prescription fields, volume, evergreen/week-count, carry-forward, set flags, future-set notes        | TrainingProgram/SetLog/SetNote                       | exercise staff catalog                                                       | Slice 6; volume §7                     |
| C01–C07       | Check-in builder, full/custom, review, video, change summary                                         | CheckInForm/Submission + FeedbackResponse            | none                                                                         | Slice 5; video provider deferred       |
| Habit Tracker | optional feature, own setup/status                                                                   | HabitDefinition/HabitStatus                          | none                                                                         | Slice 6; Tracker-independent           |
| M01–M05       | Messaging + voice/files/photos/videos, context links, controls, priority, review feedback            | Conversation/Message + context links                 | none                                                                         | Slice 6; attachment policy needed      |
| —             | Wearables                                                                                            | connector direction                                  | none                                                                         | Deferred; scoped contracts             |
| —             | Migration/export                                                                                     | in/out coverage agreement                            | export/erasure matrix row                                                    | Deferred; scoped spec                  |
| —             | Show-planning example                                                                                | optional roadmap content                             | none                                                                         | Example only; no module authorized     |

## 11. Pending owner decisions (PROPOSED unless marked)

Owner = product owner (relayed via Hanzlah) unless noted. Status: PENDING
unless marked RESOLVED. P-012 closure additionally recorded approved
assignment authority/lifecycle/pinning and submission semantics for the
onboarding slice in `docs/product-decisions.md` #30–#40; submissions remain
blocked on the pending consent/retention items, and the legal/privacy items in
#38–#40 stay PENDING.

| ID   | Decision                                                                                                                                                                                | Recommended option (reason / tradeoff)                                      | Alternative                   | Blocks                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------- | ------------------------- |
| D-01 | ~~Pre-account intake?~~ **RESOLVED (product-decisions #30)**: no — intake rides the invite                                                                                              | —                                                                           | —                             | resolved                  |
| D-02 | General-note visibility                                                                                                                                                                 | per-note coach flag, default private (flexible; slight UI cost)             | all-private / all-shared      | W04 client surface        |
| D-03 | ~~Template ownership scope~~ **RESOLVED (product-decisions #41–#42)**: workspace-shared library; owner+coach ws read/write management; assistant/client/support/platform-admin denied   | —                                                                           | —                             | resolved                  |
| D-04 | Coach↔client dashboard relation                                                                                                                                                         | same layout, client sees visibility subset (one config source)              | separate client layout        | D05 + client roadmap      |
| D-05 | Custom check-in vs scheduled dates                                                                                                                                                      | satisfies only when coach marks coverage (no silent fulfillment)            | auto-match nearest date       | C03/C04 + W06             |
| D-06 | Formula supply path                                                                                                                                                                     | owner supplies definitions per §7 catalog contract                          | defer calc-backed widgets     | §7 computed stories       |
| D-07 | Profile label vocabulary                                                                                                                                                                | free-text labels + coach tag set (matches sheets practice)                  | fixed enum                    | W03                       |
| D-08 | Wearables first move                                                                                                                                                                    | defer all wearables until scoped provider contract exists                   | pick a first provider         | wearable direction only   |
| D-09 | Video feedback provider                                                                                                                                                                 | embedded Loom-style link first (no build cost; external dep)                | in-house recording            | C06/M05                   |
| D-10 | Submission/record retention                                                                                                                                                             | owner-defined retention window + deletion/consent enforcement (like #26)    | indefinite retention          | submission retention rule |
| D-11 | ~~Multi-coach setup edit rights~~ **RESOLVED (product-decisions #52)**: any currently ACTIVE assigned coach may manage the client's template assignment, audited; PRIMARY-only rejected | —                                                                           | —                             | resolved                  |
| D-12 | Per-client configurable elements (edited by assigned coach, not the CLIENT)                                                                                                             | variant choice, per-param show/hide, plan values only (predictable)         | wider per-client override set | override implementation   |
| D-13 | Coach-note staff visibility                                                                                                                                                             | keep workspace-scoped staff read (continuity)                               | author-only                   | W04/W07                   |
| D-14 | Post-submit entry edit rules                                                                                                                                                            | same-day client edit w/ history; coach edits = new effective-dated versions | immutable entries             | entry-edit surfaces       |

Each row names one recommended model; alternatives exist only to show the
tradeoff. Owner sign-off is additionally required on the §2
version/upgrade/override policies before their slices ship.

---

## 12. Boundaries restated

- No real client data; fixtures synthetic; PRGRSS HTML exports and the brief
  file itself stay outside version control.
- No formulas implemented or inferred from values-only exports.
- No client-visible PED/HRT/menses behavior; no diagnoses; no automatic
  program changes.
- Invitation and password-reset scope unchanged; reset stays disabled.
- This document authorizes no implementation, push, merge, or deployment.
