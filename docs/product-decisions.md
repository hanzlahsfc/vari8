# Product decisions

Locked decisions for the new PRGRSS-derived product, relayed by Hanzlah from the stakeholders.
This document is the repository's authoritative decision record; it does not authorize a push,
PR, deploy, or external change.

1. **New repository, new product.** This is a new repository and a completely different final
   product name. `App`, `The-great-tracker-`, `Prime Tracker Pro`, and `PRGRSS 2.0` are
   placeholders or source names, not an approved product name.
2. **The sheets are the base and core.** The 11-sheet professional workbook is the product's
   specification and source of truth.
   **Update (relayed 2026-10-02, P-006 direction / Lilly's "Core coaching system"
   brief, 1 Oct 2026):** narrowed in scope — the product is a **configurable
   coaching system**; the PRGRSS workbook is a source-backed **starter
   configuration** and evidence corpus (parameter seed, workflow patterns), not
   the permanent universal schema. Coaches shape the tool from a parameter
   library; confirmed invariant: switching template variants must preserve all
   client data. The workbook remains authoritative for the fields it actually
   documents; see `docs/product-alignment-blueprint.md`.
3. **Layouts per form factor.** ~~Reproduce the sheet layouts and information architecture faithfully in
   the web UI; do not independently redesign them.~~ **SUPERSEDED (2026-09-30):**
   the sheets remain the source of data, workflow, relationships, and information
   architecture, but the literal spreadsheet layout is not the final UI. The app
   requires a full desktop/web redesign plus platform-appropriate tablet and
   mobile interfaces — one design system, per-form-factor navigation,
   information density, panel structure, tables, dashboards, and interactions;
   never a stretched or shrunk shared layout. Prime Tracker's visual
   design is not the target; the Prime Tracker repository is Marcel and Mike's
   and must not be modified. Product name still undecided.
   (Relayed by Hanzlah, 2026-09-30.)
4. **Data lives in the app.** Implement the sheet data and behavior inside the application; do
   not link to or embed the live sheets as the product.
5. **Sheet-derived catalogs.** Replace Prime State's food/exercise master data with the
   sheet-derived databases (`spec/data/foods.json`, `spec/data/exercises.json`).
6. **Prime State formulas are irrelevant.** Formula behavior must come from Lilly's schematic,
   the Google scripts, or another approved source — never from Prime State or guesswork.
7. **Unknown formulas wait.** PRGRSS 2.0 formulas/estimation not derivable from the HTML
   (calorie column, averages/trends, MEALPLAN subtotals, T-minus, MENSES estimation) remain
   blocked until the PRGRSS scripts and/or the original `.xlsx` arrive. The received CRE8
   input-flow overview (`CRE8_Input_Flow_Overview.html`, 2026-09-29) is a **different workbook
   that explicitly excludes PRGRSS 2.0**; it documents CRE8 wiring only and does not resolve
   PRGRSS 2.0 behavior.
8. **Use permission confirmed.** Aleks and Marcel confirmed the supplied workbook and the
   existing application may be used for implementation. Exact redistribution/licensing language
   still needs pre-release legal/product review; that review is **not** a blocker for local
   implementation.
9. **Licensing review is separate.** Pre-release redistribution/licensing determination remains
   an open, separate step; it is not the same as permission to implement.
10. **Supabase was a suggestion only.** Not approved. PostgreSQL + Prisma is the current stack;
    do not migrate providers without an explicit decision and migration plan.
11. **No data migration.** No existing Prime State client accounts or records are migrated unless
    explicitly requested later.
12. **CRE8 schematic received (reference only, not PRGRSS 2.0).** `CRE8_Input_Flow_Overview.html`
    (received 2026-09-29) documents CRE8 formula/script paths (Tracker→Backend, bodyweight
    averages/trends, Mealplan→Target Log snapshots, Timeline→Dashboard targets, cycle
    calculations, check-in submit/review, Programming→Logbook, PED Protocol→PED Change Log,
    Apps Script inventory). It **excludes PRGRSS 2.0** and has unresolved gaps of its own; it is
    not a substitute for the PRGRSS 2.0 formulas. `SCRIPT_CRE8.gs` is referenced but was not
    supplied.

## S1-F invite/recovery — founder answers (relayed by Hanzlah, 2026-09-30)

These are the founder's direct answers to the S1-F decision checklist
(`docs/tasks/s1-f-invites-recovery-plan.md` §2). The engineering interpretations
that follow them are recorded separately and are **not** founder decisions.

13. **Registration model: invite-only for the initial product.** Coaches invite their
    clients. Public self-registration may be considered later; nothing public exists now.
14. **Product-facing roles: coach, optional assistant coach, and client.** The founder
    questioned whether an "owner" role is product-facing and suggested it may represent a
    gym owner — the product-facing naming/semantics of the administrative role remain open.
15. **Client self-onboarding.** Clients receive an invitation and enter their own
    information; coaches do not pre-create or fill in the client's details. (Engineering
    consequence: client invite acceptance creates and links the `ClientProfile`; there is
    no pre-created profile to bind at issuance — `AccessToken` carries no
    `clientProfileId`.)
16. **Multiple coaches and sharing.** Users should be able to work with multiple coaches
    and easily share plans, training, and results. (Interpretation below scopes this to
    multiple `ClientAssignment` rows inside one workspace; true cross-workspace sharing
    stays open.)
17. **Link expiry: 12 hours** for both invitation and password-reset links. **A
    replacement cancels previous matching links** (re-requesting invalidates outstanding
    matching tokens).
18. **Reset logs out other devices.** A successful password reset must invalidate the
    user's existing sessions on other devices. (Engineering consequence: `User`
    `sessionVersion` incremented at reset-consumption time makes issued JWT sessions
    stale; validation wiring is a later step.)
19. **Partially undecided pending the product name:** email provider, sender
    identity, and product domain remain open. Password rules were resolved by
    Aleks's final answers (#20–#27 below).

## S1-F final policy answers (Aleks, relayed by Hanzlah, 2026-09-30)

Aleks approved the previously proposed defaults **with two explicit changes** —
recorded verbatim as approved, including the two deviations from the earlier
engineering recommendation:

20. **Invite acceptance.** New users set a password during acceptance; existing
    users must sign in using the exact invited email; possession of the
    invitation counts as email verification (no standalone
    `EMAIL_VERIFICATION` flow now).
21. **Membership restoration.** Suspended or removed memberships are never
    silently restored — a fresh explicit re-invitation is required.
22. **Reset eligibility.** Password reset is available only to `ACTIVE`
    accounts.
23. **Password policy.** Minimum **10 characters** — an explicit change from
    the proposed 15; long passphrases allowed; **no** uppercase/lowercase/
    number/symbol composition requirement. (Recorded risk: 10 is below the
    current 15-character recommendation for password-only authentication —
    accepted as a product decision, not silently overridden.)
    **Update (relayed 2026-10-01, Phase 3.1):** invite password _setup_
    additionally requires **at least one digit** — clarified as one ASCII
    `0–9` character (not a broadened Unicode-digit rule) — still no uppercase
    or symbol requirement. Ordinary sign-in performs no policy check.
    **Update (Phase 3.2):** reset-completion passwords use the same setup
    rule (≥10 + ≥1 ASCII digit) — the instruction explicitly confirmed it
    for passwords set through reset. Both setup surfaces share
    `validatePasswordSetup`.
24. **Public reset response differs by account existence — accepted
    enumeration risk.** The public password-reset response deliberately differs
    depending on whether an account exists. Aleks was warned that this permits
    account enumeration and explicitly accepted the tradeoff. Boundaries still
    apply: the response may reveal only existence — never status, role,
    workspace membership, client status, or other details — and routes still
    require rate limiting, abuse monitoring, and minimized timing differences.
    **Update (Phase 3.2):** the implemented public response is generic
    regardless of existence (per the Phase 3.2 instruction — a stricter,
    non-enumerating surface than the accepted risk requires). The service
    still distinguishes internally so delivery decisions stay correct.
25. **Invitation revocation.** Workspace admin/head coach may revoke
    outstanding invitations.
26. **Token retention.** Consumed and expired/revoked token records may be
    deleted after **30 days**.
27. **Reset audit ownership.** Password-reset activity belongs in an
    account-level security log, not a workspace log.
28. **Provider neutrality.** Email provider, sender identity, product domain,
    and product name may be selected later; the backend remains
    provider-neutral.

## P-008 scoped approval (relayed by Hanzlah via Apollo, 2026-10-02)

29. **Onboarding-form builder permissions (P-008 slice only).** WORKSPACE_OWNER
    and ACTIVE COACH may view/edit onboarding-form drafts in their workspace.
    ASSISTANT_COACH, CLIENT, SUPPORT and PLATFORM_ADMIN are denied for this
    slice. Published form versions are immutable; edits create a new
    draft/version and never silently alter an existing client flow. Editor
    identity and timestamps are recorded; ACTIVE user/membership/workspace is
    enforced server-side on every operation (including preview/publish/
    archive). Form-definition access never confers intake-submission access;
    no submission domain exists in this slice. This approval is narrowly
    scoped to P-008 and does not resolve blueprint D-03 (template library
    ownership) or any other pending decision.

## P-012 onboarding-submission decision closure (delegated authority, relayed 2026-10-06)

The product owner delegated these product/engineering decisions to the
orchestrator (instruction: apply the most professional, common, recommended
approach), following `opencode-go/deepseek-v4.1-flash`'s FAIL review of the
initial P-012 package. The corrected set below replaces the earlier proposals.
These are product/engineering decisions — **not** legal conclusions; the
legal/privacy items in #38–#40 remain pending. Full record:
`docs/tasks/p012-onboarding-submission-decisions.md`. **No implementation is
authorized by these entries.**

30. **Intake entry point.** Client intake is authenticated and post-invite
    only. No anonymous or pre-account intake exists. Invite acceptance creates
    or links the account, membership, and `ClientProfile` before intake.
    Invitation issuance remains externally fail-closed until its delivery and
    security prerequisites are met; no raw-token manual-delivery workaround.
31. **Onboarding-form assignment authority (staff slice).** WORKSPACE_OWNER
    may create/replace/cancel assignments for any workspace client. COACH may
    do so only for clients under that coach's current ACTIVE assignment scope.
    ASSISTANT_COACH reads assignments for actively assigned clients but cannot
    create/replace/cancel. CLIENT gets no assignment-record access in the
    staff-only slice. SUPPORT and PLATFORM_ADMIN are denied. Coach
    form-assignment is a newly approved onboarding capability only — it does
    not permit creating `ClientAssignment` rows or self-assigning clients.
32. **Assignment cardinality and pinning.** One ACTIVE onboarding assignment
    per (client, form); different forms may be active concurrently. New
    assignments pin the latest published version only; historical versions are
    staff-viewable but not assignable. An assignment pins permanently to its
    immutable `OnboardingFormVersion`; republishing never moves assignments;
    no in-place repinning.
33. **Assignment lifecycle and provenance.** Statuses `ACTIVE`, `SUPERSEDED`,
    `CANCELLED`, `COMPLETED`. An ACTIVE assignment makes exactly one
    authorized terminal transition — to `SUPERSEDED` (atomic replacement for
    the same client/form), `CANCELLED` (manual cancel), or, in the future
    submission transaction, `COMPLETED`. A transition may update only `status`
    and the applicable ending provenance (`endedByMemberId`/`endedAt`); the
    immutable form/version pin, the assignment's own identity,
    `assignedByMemberId`, and `assignedAt` never change. Terminal rows are
    never reused, repinned, returned to `ACTIVE`, or hard-deleted through
    ordinary product actions. `COMPLETED` is reserved for the future
    submission implementation and must not be claimed by the assignment-only
    slice.
34. **Assignment data classification.** Onboarding assignments are
    client-associated operational metadata (client + form/version + staff
    actor + lifecycle + timestamps) — correcting an earlier "zero client data"
    characterization. Normal workspace/assignment authorization applies; never
    expose emails, answers, tokens, or health data through them; include them
    in the future client-data export; preserve during the active relationship.
    Post-termination retention/deletion/anonymization/backup/legal-hold
    handling stays pending the wider retention/erasure policy. No deployment
    or real-client collection may claim GDPR/retention readiness while those
    are unresolved.
35. **No draft persistence.** The first submission release stores answers only
    on successful submit: no server-side drafts, no `localStorage`/
    `sessionStorage`, no autosave or cross-device resume claims. The UI must
    disclose submit-only persistence. Real draft persistence is a later,
    separately-reviewed privacy/security feature.
36. **Submission immutability.** A submitted response is immutable during its
    approved retention period; nobody edits a submitted revision in place —
    corrections are new append-only revisions in the same chain. Coaches
    record observations separately, never rewrite client answers. Authorized
    deletion/anonymization may still occur under an approved retention,
    erasure, or legal-hold policy; "immutable" never means "can never be
    deleted by anyone."
37. **Submission authorization direction.** CLIENT submits and reads own
    submissions; WORKSPACE_OWNER reads at workspace scope but does not review,
    approve, mark, or modify submissions (administration is distinct from
    coaching work); COACH reads and reviews only actively-assigned clients;
    ASSISTANT_COACH reads assigned clients, no review/mark; SUPPORT and
    PLATFORM_ADMIN denied; multiple ACTIVE assigned coaches may read; review
    writes stay assigned-coach scoped and audited; revocation fails closed.
38. **Consent gates — pending.** Applicable jurisdiction/legal basis; notice
    and consent text + versions; whether consent precedes viewing a blank form
    or precedes collecting/submitting; form-level vs question-level
    sensitivity; withdrawal effects on client writes, staff reads, processing,
    retention, and erasure; retention of `ConsentRecord` evidence itself.
    Conservative boundary stands: no real answer collection until an approved
    consent policy is configured; operations on unconfigured policy fail
    closed; PED/HRT, cycle, and bloodwork remain excluded.
39. **Retention, erasure, export — pending.** Jurisdiction, legal basis,
    controller/processor duties, numerical periods, post-termination window,
    withdrawal treatment, erasure/anonymization behavior, backup expiry,
    legal holds, minor/age policy, submission export format, and erasure
    operations all require product-owner + legal/privacy input. No real
    onboarding answers may be stored and no submission feature may deploy
    until these are approved and implemented.
40. **Security boundary distinction.** Public anonymous token routes keep
    their existing delivery/throttling/timing/route-security prerequisites.
    An authenticated client submission action is a different surface and needs
    its own review for authorization, Origin/CSRF behavior, request-size
    limits, idempotency, abuse protection, atomicity, audit, and input
    validation — neither automatically equated nor silently waived.

## P-014 parameter/template foundation — owner approval (relayed 2026-10-06)

The product owner approved the recommended P-014 decision package for the
**workspace parameter-library + coaching-template versioning slice** —
`client`-free staff configuration only. This round resolves blueprint D-03
and narrows that slice's mechanics; it does not resolve §2
upgrade/rollback/override policy, D-06, D-11, D-12, or #38–#40, and it does
not authorize implementation by itself.

41. **Workspace-shared ownership (D-03 resolved).** Parameter definitions
    and coaching templates belong to the workspace — never privately owned
    by their creator. Any authorized owner or coach may manage any
    definition or template in that workspace; there is no creator-only
    scope.
42. **Management permissions.** WORKSPACE_OWNER: workspace read/write.
    COACH: workspace read/write. Both may create, edit, publish, and
    archive. ASSISTANT_COACH, CLIENT, and SUPPORT are denied for this first
    management slice; PLATFORM_ADMIN is denied including when the same user
    also holds a workspace membership.
43. **Parameter identity and semantic stability.** The parameter key is
    server-minted, immutable, and never reusable. `kind` is immutable from
    creation. `unit`, `ratingScheme`, option identity/value set, and
    `validation` constraints are semantic fields: editable only before the
    parameter first appears in a published template; afterwards a semantic
    change requires a new parameter with a new key. Display metadata
    (`label`, `helpText`) may change with revision; existing published
    snapshots never change. `required` belongs to the template item, not the
    reusable parameter.
44. **Terminal archive.** Parameter and template archive is terminal in
    this slice — no restore/unarchive, no hard-delete product action;
    stable keys remain reserved after archive; historical immutable
    versions remain readable.
45. **Archived-reference rule.** Draft save rejects archived parameter
    references; publish rejects them even when the parameter was active at
    draft save — the coach must remove or replace the reference. No
    warning-only or retired-marker publication exception.
46. **Template names.** Duplicate display names are permitted; immutable
    IDs are authoritative; no workspace name-uniqueness constraint in this
    slice.
47. **Snapshot/version policy.** Publishing creates an immutable,
    self-contained template version freezing structure AND complete
    referenced-parameter metadata; later edits create a later version;
    nothing automatically propagates, repins, or upgrades. Variants,
    assignments, upgrade/rollback, and per-client overrides remain deferred.
48. **PRGRSS starter data deferred.** P-014 carries no bundled
    source-derived seed or automatically created definitions — the
    management surface supports authorized staff-created parameter
    definitions (WORKSPACE_OWNER and COACH are the authorized staff roles
    per #41–#42), and development/test evidence uses synthetic fixtures
    only. Any future starter set is a
    separate source-fidelity-reviewed slice: every field enumerated with
    per-field evidence; no inferred units, rating schemes, enums, bounds,
    or formulas; `CALORIES` stays excluded unless authoritative evidence or
    product approval resolves its automatic/computed status and unprinted
    unit; composite and specialist fields need separate explicit treatment;
    no raw exports or client data enter Git.

## P-015 client-setup decision closure — owner approval (relayed 2026-10-07)

The product owner approved the complete nine-decision P-015 C1 package for
the **client-setup / template-assignment slice**, following a final
independent `opencode-go/deepseek-v4.1-flash` planning review (PASS —
P0/P1/P2 none). This round resolves blueprint D-11 and approves **C1
product behavior only**; it does not resolve D-12, the §2
upgrade/rollback/variant/override policies, or #38–#40, and it does not
authorize implementation. Full record:
`docs/tasks/p015-client-setup-decisions.md`.

49. **Current template assignment and history.** Each client has exactly
    one current template assignment at a time; multiple concurrent
    current assignments are not approved. Prior assignments are preserved
    as append-only, immutable product history under the approved/interim
    retention posture — no ordinary product action rewrites, reactivates,
    reuses, or hard-deletes a historical assignment/version-pin record.
    Future authorized retention, erasure, anonymization, legal-hold, or
    regulatory workflows may act on these records once D-10 and the
    legal/privacy policy are approved and implemented. "Immutable" means
    no in-place business edit, never legally undeletable.
50. **Initial assignment version.** A new template assignment always uses
    the template's latest published version, selected and pinned
    atomically by the server; staff cannot initially select an older
    historical version. This does not authorize upgrade or rollback
    behavior.
51. **Cancellation authority.** WORKSPACE_OWNER may cancel any client's
    current template assignment. COACH may cancel only while currently
    and actively assigned to that client through `ClientAssignment`; a
    revoked or unassigned coach cannot cancel merely because they created
    the assignment. An actor who remains authorized may cancel even when
    the client, template, or pinned version is no longer otherwise
    eligible. Cancellation does not delete history.
52. **Multi-coach editing (D-11 resolved).** Any currently ACTIVE
    assigned coach may manage the client's template assignment, with
    audit evidence; management is not restricted to PRIMARY coaches.
    Template assignment never creates, modifies, or confers coaching
    `ClientAssignment` scope. ASSISTANT_COACH remains write-denied.
53. **Archived-template behavior.** Archived templates cannot be newly
    assigned. Existing assignments pinned to immutable versions of an
    archived template remain effective and readable; archiving never
    silently cancels or rewrites client setup/history, and authorized
    cancellation remains possible. Upgrade/rollback behavior for archived
    templates stays deferred to C2 and is not approved here.
54. **Assignment-history visibility.** WORKSPACE_OWNER may read all
    setup/assignment history in the workspace. COACH may read history
    only for clients currently assigned to that coach. ASSISTANT_COACH
    may read history only for clients currently assigned to that
    assistant and remains write-denied. CLIENT receives no
    setup/assignment-history access in this staff-only slice; SUPPORT and
    PLATFORM_ADMIN remain denied, including dual-role platform
    administrators.
55. **Cross-template change.** Atomic cross-template replacement is
    deferred; in C1, changing to another template requires two explicit
    audited actions — cancel the current assignment, then assign the
    different template. The temporary state with no current template
    assignment is valid and visible. No silent replacement or automatic
    propagation.
56. **User-facing terminology.** "Client setup" means the client's stable
    configuration context; "template assignment" and "version history"
    describe which template/version is or was applied; "coach assignment"
    is reserved for the `ClientAssignment` authorization relationship.
    UI and documentation must not conflate these concepts; internal
    database/table names remain engineering decisions.
57. **Data classification and interim posture.** Client setup and
    template-assignment records are client-associated operational
    metadata. Preserve them under the interim posture — ordinary product
    actions do not hard-delete them. Future client-data export must
    include the records that remain within the approved retention period.
    Retention, erasure, anonymization, legal-hold, backup, and regulatory
    behavior remain pending D-10/legal/privacy approval. This decision
    does not claim GDPR readiness, does not authorize real-client use or
    deployment, and infers no retention duration or erasure mechanism.

## P-017 C2 template-version transitions — owner approval (relayed 2026-10-08)

The product owner approved the complete five-item P-017 decision package for
the **template-version transition (C2) slice**, following independent
`opencode-go/deepseek-v4.1-flash` review (P-017-R2-R1: PASS — P0/P1/P2 none).
This round resolves the C2 product rules only; **implementation is deferred
until immediately before DailyEntry or another first data-consuming slice**
and remains unauthorized. Full record:
`docs/tasks/p017-template-version-transitions.md`.

58. **Upgrade target.** A client's template-version upgrade moves only to
    the template's latest published version, selected by the server. Staff
    do not select among arbitrary newer versions. Publication occurring
    after review invalidates the reviewed state and requires refresh and
    re-review. Nothing upgrades automatically.
59. **Rollback target.** A rollback may select any earlier retained
    published version of the same template; the target need not have been
    previously used by that client. Same-version transitions are not
    offered. Rollback never changes the client's coach assignment.
60. **Archived-template transitions.** Archived templates are frozen: no
    upgrade or rollback may create a new pin on an archived template.
    Existing pins remain readable and cancellable per #51–#53; the exit
    path remains cancellation followed by assignment of a different
    eligible template. The rejected alternative was rollback-only within
    an existing archived-template relationship.
61. **Mandatory structural review.** Every template-version transition
    requires an explicit structural review and confirmation before it may
    be applied — including transitions whose computed structural diff is
    empty. The review is bound to the exact active pin, target version,
    and structural diff; stale review state fails closed and requires
    refresh; no internal database IDs are exposed through
    browser-controlled values.
62. **Timing.** The C2 rules are approved and recorded now; C2
    implementation is deferred until immediately before DailyEntry or
    another first data-consuming slice. The existing C1 cancel-then-assign
    workflow remains the available behavior. Before C2 implementation the
    plan must be revisited alongside the first consumer's data-aware
    conflict and blocking rules. This approval authorizes no schema,
    service, route, UI, test, branch, PR, merge, or deployment work.

**Binding safety boundary (not an optional decision):** free-text
transition reasons are excluded from C2 — no transition-reason column,
summary field, audit field, browser value, or UI input. Explanatory free
text remains deferred until D-10 retention, erasure, export, and
legal/data-classification policy is resolved; D-10 is not resolved here.

**Engineering constraints (recorded for the future C2 implementation —
NOT owner decisions, and they authorize nothing):** a transition
atomically supersedes the current ACTIVE pin and creates exactly one
successor ACTIVE pin; `supersedesPinId` is lineage/anti-branching, not an
idempotency key; post-commit resubmission fails stale with no additional
writes or audits; structural diffs identify sections by `sectionId` and
items by `itemId`, with parameter identity demoted to an attribute and
multiple items per parameter supported; authorization precedes selection
resolution and any selection-derived response; transition-history
visibility follows #54; `clientSetups` RBAC is unchanged; audit metadata
carries no IDs, labels, free text, answers, or sensitive values; a
separate exact-match `ENABLE_CLIENT_SETUP_TRANSITIONS=1` gate is planned
beneath the existing client-setup gate; canonical hashing uses a
versioned, domain-separated, strictly unambiguous encoding with fixed
integer, boolean, and length-prefix representations; versioned
`transition_summary` JSON uses a closed allowlist and validated schema;
evidence prioritizes disposable-PostgreSQL integration and real-browser
tests, with focused unit tests for pure logic only.

## P-018 C3 template-variant disposition — owner approval (relayed 2026-10-08)

The product owner approved the single-item P-018 package for the
**template-variant (C3) slice**, following independent
`opencode-go/deepseek-v4.1-flash` review (P-018-R1: PASS — P0/P1/P2 none).
Full record: `docs/tasks/p018-c3-variant-feasibility.md`.

63. **C3 deferral — no approved payload.** Defer both C3 product decisions
    and C3 implementation until the first specifically named, approved
    variant-controlled consumer exists. No approved variant payload exists
    today: every meaningful candidate is either C4 per-parameter visibility
    or a deferred/absent capability (dashboards, roadmap, check-in or
    onboarding form selection, meal/training configuration, plans/targets,
    DailyEntry, themes); alternate section/item order, grouping, or
    presentation are theoretical and unevidenced. Do not create an empty
    variant registry, selector, default-variant model, switching history,
    schema, route, or UI without a defined payload.

    The SOURCE-CONFIRMED invariant is preserved unchanged: any future
    variant switch must keep the same client, must not create a new
    tracker, must not alter `ClientAssignment`, and must not delete or
    rewrite client-owned history.

    All proposed variant mechanics remain **unresolved and non-binding
    engineering considerations**: stable keys, tombstones, default
    variants, archived-template variant switching (unresolved — decision
    #60 governs C2 pin transitions only, not future variant switching),
    upgrade-time variant mapping, persistence/history shape (depends on
    the future payload and consumer), switching authority details, audit
    shape, and UI behavior.

    D-12 remains pending in full; C4 per-parameter visibility remains
    separate and pending; nutrition variants remain distinct from
    template variants; meal-plan configuration remains per-client and is
    not a template-variant payload. C3 deferral does not block C2, C4, or
    DailyEntry planning. This approval is documentation only — it
    authorizes no implementation.

## P-019 DailyEntry persistence — owner approval (relayed 2026-10-08)

The product owner approved the corrected P-019 DailyEntry persistence plan and
its fifteen-item decision package, including the binding correctness
constraints, following the P-019→R4 review chain (final independent review
P-019-R4-R1 CONDITIONAL PASS by `opencode-go/deepseek-v4.1-flash`, no P0/P1).
Full record: `docs/tasks/p019-daily-entry-persistence-decisions.md`. This
records product rules only — it authorizes **no** C2 implementation, DailyEntry
implementation, production enablement, specialist-data collection, real-client
data, or deployment.

64. **One value per parameter.** Every future `CoachingTemplateVersion`
    publish universally rejects duplicate references to the same parameter.
    DailyEntry exposes one logical input per parameter (parameter identity is
    the metric identity; `itemId`/`sectionId` are presentation provenance).
    Existing immutable versions are not rewritten; legacy duplicate-bearing
    versions are structurally ineligible for DailyEntry. Repeated placements
    sharing one value are rejected for v1 — no approved product need supports
    canonical repeated rendering.

65. **Cardinality + append-only revisions.** At most one DailyEntry per
    workspace, client, and declared calendar date. Every changed save appends
    an immutable revision; current state is selected through the
    current-revision pointer. Multiple independent entries per day are not
    approved.

66. **Declared-date semantics.** The entry date is a client-declared calendar
    `DATE`. Lower bound `1970-01-01`; upper bound = server UTC calendar date
    plus exactly one day — a tolerance/sanity limit, not a claim about the
    client's local today. Backdating is allowed within the range. No timezone
    conversion rewrites stored dates. IANA timezone behavior remains
    unresolved and separately gated.

67. **Explicit save.** DailyEntry v1 uses an explicit Save action — no
    drafts, autosave, or submitted/final workflow. Failed or incomplete
    requests persist nothing. Autosave remains deferred and would require
    later D-10 analysis.

68. **Client editing + read-only history.** Clients may revise their own
    current and past entries; revisions are append-only; history is
    read-only. Restoration is not included — separately deferred.

69. **No staff writes.** Staff do not write or correct client-authored
    DailyEntry data in v1; authorized staff access stays read-only per the
    approved RBAC. Attributed staff corrections remain deferred pending the
    unresolved D-14 staff-write decision.

70. **Stale-selection fails closed.** Saves fail closed when assignment, pin,
    C2 transition, authorization, or consent state changed after rendering;
    the user must reload before retrying; a stale request produces zero
    revision, value, or audit writes; silent remapping is forbidden. Safety
    boundary, not an optional preference.

71. **C2 transitions with DailyEntry history.** A C2 transition removing a
    parameter with history or rebinding an item to another parameter requires
    explicit warning + confirmation; authorized reviewers see counts and date
    bounds only, never stored health values; structurally ineligible targets
    are blocked; display-only/required-state changes may stay informational;
    the review stays bound to the exact pin, target, and diff and fails
    stale. These approved rules do not authorize C2 implementation.

72. **Development/production boundary.** DailyEntry implementation, if
    separately authorized later, must remain development-gated. Production
    enablement requires resolved D-10 controls, current approved
    consent-policy versions, privacy/deletion/export readiness, and separate
    authorization. No real-client health-data collection is approved;
    deployment remains separately authorized.

73. **Specialist-data boundary.** DailyEntry v1 accepts structurally eligible
    `GENERAL_HEALTH` parameters only. `CYCLE` may be classified solely so it
    can be identified and excluded — classification does not authorize
    collection. `BLOODWORK` and `PED_HRT` are reserved and unassignable by
    every role — including workspace owners, coaches, support, and platform
    administrators — pending their legal/policy gates. Specialist-data
    collection remains unauthorized. Safety boundary.

74. **Decimal input.** Input may use a comma or period decimal separator;
    values normalize to one canonical decimal representation; zero stays
    distinct from missing; overflow/excess precision is rejected; values are
    never silently rounded. Database precision/scale is a documented
    engineering safety bound, not a source-confirmed range.

75. **Unsupported kinds.** `TIME`, `DURATION`, and `RATING`/`WORD_LABELS` are
    ineligible for DailyEntry v1; their formats/vocabularies remain
    unresolved; no format may be invented in this slice.

76. **Post-revocation behavior (interim).** Both reads and writes fail closed
    after required consent is revoked or no longer current; stored rows are
    retained. Retention, erasure, export, and any legally required access
    remain governed by unresolved D-10. This makes no legal claim and does
    not authorize production collection.

77. **Restoration deferred.** Revision history remains read-only; no restore
    control or restoration service is approved. Any future restoration must
    validate against the current pin, current structural eligibility,
    current authorization, and current consent using new snapshots; old pin
    field sets must never be silently revived.

78. **Classification migration.** Parameter classifications have no default.
    Existing `NULL` classifications may transition only to `GENERAL_HEALTH`
    or `CYCLE` — every permitted transition is immutable and audited;
    `NULL→BLOODWORK`, `NULL→PED_HRT`, and every non-NULL→non-NULL change are
    rejected. Existing immutable published versions are not rewritten and
    remain structurally ineligible until a new version is published.
    Classification never authorizes collection.

### P-019 binding correctness constraints (not owner choices)

The following are binding engineering/security constraints recorded with the
approval; owner approval cannot waive them:

- **Structural eligibility vs runtime access.** `DailyEntryVersionEligibility`
  is a pure deterministic function of the immutable template-version snapshot
  (schema validity, duplicate references, snapshotted classification,
  supported kinds/schemes, option/validation coherence) — it never inspects or
  caches feature flags, identity, membership, role, assignment, pin, consent,
  or operation authority. Runtime access separately checks mode, session,
  RBAC, active `ClientSetup`/pin, structural eligibility, configured consent
  policy, current active consent, and operation authority. UI states must
  distinguish no-assignment, structurally-ineligible, consent-unavailable,
  denied, and stale without disclosing protected data. Neither layer is ever
  cached into the other.
- **Feature-mode conflict.** One shared resolver governs the DailyEntry page,
  route handlers, persistent actions, and prototype actions. Persistent and
  prototype flags enabled together are a configuration error — pages show a
  non-disclosing unavailable state and actions refuse before session lookup,
  input parsing, fingerprint resolution, or database access. Any flag value
  other than exact `"1"` is disabled.
- **Relational/service coherence.** Planned `ClientSetupPin` unique target
  `(id, workspaceId, templateVersionId)`; planned `DailyEntryRevision`
  composite FK `(clientSetupPinId, workspaceId, templateVersionId)` → that
  target (named raw-SQL constraint/FK acceptable where Prisma cannot express
  it; a non-unique index is never an FK target). Revision→entry membership,
  entry workspace/client identity, and revision→pin workspace/version
  identity are database-enforced; entry-client↔pin-client equality is a
  mandatory locked-transaction service invariant unless a later reviewed
  schema adds the redundant columns + composite FK for DB enforcement. Any
  coherence failure occurs before revision/value/audit writes and must be
  integration-tested for zero mutation.
- **Current revision.** When non-null, `currentRevisionId` references a
  revision of the same DailyEntry; creation may temporarily use null inside
  one transaction; the service sets the pointer before commit; the database
  does not independently prevent a committed null pointer — integration tests
  must prove successful creation never commits null and injected failure
  rolls back everything.
- **Atomicity/locking/audit.** All client-scoped C1, future C2, and
  DailyEntry mutations take the shared per-client advisory lock first; order
  = advisory → `ClientSetup` → template when needed → active pin →
  `DailyEntry` → revision/values → audit. Retries recompute authorization,
  consent, setup/pin, structural eligibility, current revision, and dedup
  inside a fresh transaction. Audit failure rolls back all persistence.
- **Canonical deduplication.** The canonical identity binds the ClientSetup
  pin, template version, parameter identity, classification, full immutable
  metadata snapshot, and typed values; `itemId`/`sectionId` are included via
  explicit tagged-nullable encoding distinguishing NULL, empty string, and an
  actual identifier — changed placement provenance produces a new hash and
  revision. A fixed synthetic canonical input + expected SHA-256 output is
  required before implementation acceptance (covering both fields-present and
  nullable-provenance-absent cases). Identical provenance/snapshot/values is
  a no-op with no new revision or audit; differing provenance creates a new
  revision.

### Residual classification trust risk (transparent, non-blocking)

Existing `WORKSPACE_OWNER` and `COACH` parameter managers may perform the
permitted `NULL→GENERAL_HEALTH`/`NULL→CYCLE` transitions; `BLOODWORK`/`PED_HRT`
stay unassignable by every role; transitions are immutable and audited;
accuracy cannot be inferred from labels, groups, units, or source columns —
**misclassification of a specialist field as `GENERAL_HEALTH` remains a trust
risk**. Owner-only classification or an owner-review workflow is optional
future hardening requiring separate approval; it is not a new approval here.

### Source-fidelity boundaries

Biofeedback remains Scale 1–10; DAY LABEL remains its source-confirmed enum;
cycle-related fields remain excluded from this slice; `CALORIES` stays
excluded and must not become an ordinary user-entered parameter without new
evidence and approval; no formulas, targets, transformations, units, numeric
ranges, or specialist consent semantics may be invented. Both decimal
separators are source-supported; numeric precision/range is an engineering
safety bound.

## Conservative engineering interpretations (NOT founder decisions)

Recorded for traceability so reviewers can distinguish assumption from decision:

- The technical `WORKSPACE_OWNER` role stays: every workspace needs an administrator. Its
  product-facing name (workspace admin / head coach / gym owner) is open.
- Current RBAC (`lib/auth/rbac.ts`, `authorization-model.md`) is **unchanged** by this
  decision round. The _intended future_ invitation policy — owner/admin may invite COACH,
  ASSISTANT_COACH, CLIENT; COACH may invite CLIENT only; ASSISTANT_COACH and CLIENT may not
  invite; OWNER/SUPPORT/platform-admin invitations stay denied — is recorded as direction,
  not implemented.
- Client records remain owned by exactly one workspace; sharing between coaches means
  multiple `ClientAssignment` rows inside that workspace. No client health data is copied
  or exposed across workspaces; true cross-workspace sharing is a separate future feature
  needing explicit consent and authorization design.
- Issuance of a replacement token must revoke all unconsumed, unexpired matching tokens in
  the same transaction.
- No user-facing token flow ships until password policy, email delivery configuration,
  audit ownership, throttling, and route security review are all complete.
