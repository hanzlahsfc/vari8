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

## P-022 read-only staff DailyEntry review — owner approval (relayed 2026-10-09)

The product owner approved the three-item P-022 decision package for a
read-only staff view of client DailyEntry history, following the
P-022→R4 review chain (final independent review P-022-R4-R1 **PASS** by
`opencode-go/deepseek-v4.1-flash`, no P0/P1/P2). Full record:
`docs/tasks/p022-staff-daily-entry-review.md`. This records product rules
only — it authorizes **no** implementation, production enablement,
real-client data, or deployment. DailyEntry staff review remains
development-gated and default-off.

79. **Staff revision depth (minimization).** Authorized staff see each
    entry's **latest revision only, plus its revision count**; superseded
    answer values are withheld from staff in this first slice. The client's
    own immutable revision history is unchanged. This is a
    disclosure-minimization boundary — superseded revisions are retained,
    never deleted or rewritten; widening staff visibility to full history
    would require a new owner decision.

80. **Staff-read audit.** One structural `READ` audit is recorded per
    successfully committed, explicitly submitted "View details" Server
    Action. List loads, pagination, link prefetch, refreshes, back/forward
    navigation, and RSC/responsive rerenders create no audit — there is no
    detail-bearing GET path. The action uses honest at-least-once POST
    semantics: a second successfully committed submission may create a
    second audit row; exact retry idempotency is deferred (no existing
    repository primitive). Audit metadata is `{changed:false}` only — no
    dates, values, labels, parameter keys, consent details, or
    browser-controlled fields. Audit and detail access commit or fail
    together in one transaction; audit failure returns no detail values.

81. **Client-facing privacy disclosure (production gate).** Client-facing
    disclosure that authorized workspace staff may view submitted
    DailyEntry information is **required before production enablement**.
    Legal/privacy wording is pending and must not be invented. This gate
    does not block development-only implementation; production remains
    unavailable and fail-closed until this and the other
    production-readiness gates (D-10, consent-policy versions,
    retention/erasure/export) are satisfied.

### P-022 settled authorization (recorded context, not new decisions)

The approved `dailyTracking/read` RBAC matrix plus decision #69 already
authorize staff read; this slice honors it verbatim:

- `WORKSPACE_OWNER`: workspace-scoped read (all workspace clients).
- `COACH`: `assigned` scope — requires an ACTIVE `ClientAssignment` to the
  member's row.
- `ASSISTANT_COACH`: `assigned` scope — operationally reachable through a
  `COACH`-role `ClientAssignment` (assistants are assignable only as
  `COACH`, never `PRIMARY`).
- `CLIENT`: `own` scope only; excluded from the staff route/layout.
- `SUPPORT`: denied. Platform role alone: denied. `PLATFORM_ADMIN` with an
  eligible ACTIVE workspace membership is evaluated through that membership
  role (`dailyTracking` is not among the special platform-admin-denied
  resources).
- Terminal (`REMOVED`) assignment ends coach/assistant access; owner
  workspace scope continues; retained data is not itself an access grant.

### P-022 binding engineering contract (not owner choices)

- Dedicated staff route `/workspace/[workspaceId]/clients/[clientProfileId]/daily`
  under the existing staff layout; the roster gains the entry-point link.
- Route is `force-dynamic` with route-scoped `Cache-Control: no-store`; the
  detail action's POST response is likewise no-store and must be proven by
  real HTTP/browser evidence.
- The existing DailyEntry feature-mode resolver is reused; no new feature
  flag. Off/invalid/conflicting/production-unconfigured modes reveal no
  entry existence or count.
- List GET: pure read, header data only (declared date, revision count,
  current-revision presence), newest-first, bounded page size, validated
  keyset cursor, zero health values, zero audits.
- Detail access: explicit `useActionState`/Server Action only;
  `workspaceId`/`clientProfileId`/`entryDate` are untrusted selection input,
  never authority; sanitized detail returns only after successful commit.
- Inside one `Serializable` transaction, in order: `csetup:{ws}:{client}`
  advisory → `member:{ws}:{actorUserId}` advisory → actor `WorkspaceMember`
  `FOR UPDATE` (re-derive status/role) → `authorize` via the
  transaction-backed repo → for `assigned` scope, re-resolve the ACTIVE
  `ClientAssignment` row id (authorization does not expose it;
  `getActiveAssignment` returns `{id}`) and lock it `FOR UPDATE` →
  `ClientProfile` `FOR UPDATE` with workspace/client equality → consent
  rows `FOR UPDATE` in deterministic kind order → entry lookup →
  current-revision coherence → per-revision immutable `templateVersionId`
  snapshot rendering → structural `READ` audit (if enabled) → commit.
- Serialization conflicts use the repository's bounded fresh-transaction
  retry; every retry reacquires all locks and re-runs authorization/consent;
  exhaustion fails closed with zero values and zero audit.
- No schema, migration, dependency, audit-allowlist, or feature-flag change
  is required. Existing indexes (`@@index([clientProfileId, entryDate])`
  plus the unique `(workspaceId, clientProfileId, entryDate)`) support the
  bounded queries.

### P-022 required concurrent-behavior evidence (implementation-time)

Membership-revocation race, assignment-removal race, and consent-revocation
race must each prove deterministic read-before-revoke or revoke-before-read
ordering; zero values and zero audit when the mutation wins; atomic
detail+audit when the read wins; audit-write failure rolls back; no
deadlock; zero audits from GET/prefetch/rerender; a second committed POST
produces a second audit (at-least-once, honestly asserted).

## P-023 client onboarding submission — owner approval (relayed 2026-10-09)

The product owner approved the four-question P-023 package for a
dev-gated client onboarding intake submission surface, after the
P-023 → R1 → R2 → R2-R1 → R3 → R3-R1 plan/review chain (final
independent review P-023-R3-R1 **PASS** by `opencode-go/deepseek-v4.1-flash`,
no P0/P1/P2). Full record:
`docs/tasks/p023-client-onboarding-submission.md`. These record product
rules and an authorization boundary only — they authorize **no**
implementation by themselves; implementation additionally requires the
normal protected-branch process and a separate implementation prompt.

82. **V1 resubmission lifecycle.** A client may submit an onboarding
    assignment only once in v1. Successful submission transitions the
    assignment from ACTIVE to terminal COMPLETED (#33). COMPLETED
    assignments cannot be reopened, reactivated, edited, resubmitted, or
    reused, and there is no same-chain submission-revision model in v1.
    Any future re-intake or correction workflow requires a separately
    approved product, consent, retention, and data-history decision. This
    decision intentionally does not resolve the broader #33/#36 tension
    beyond the bounded v1 rule.

83. **Temporary consent mapping (development only).** `BASE_CONSENTS`
    (PRIVACY_NOTICE + HEALTH_DATA) may be mapped to onboarding
    submissions only for synthetic development and automated-test data.
    This is a temporary technical mapping — not a claim that all
    onboarding answers are health data and not an approved production
    classification. The production consent registry for onboarding
    submissions remains unconfigured, so production fails closed until a
    field-level or form-level consent classification is explicitly
    approved. Decision #38 and retention/erasure items (#39, D-10)
    remain unresolved.

84. **Implementation authorization boundary.** P-023 implementation is
    authorized only under all of: synthetic data only; development and
    automated-test environments only; a dedicated feature gate; gate
    default-off; production fail-closed; no deployment; no production
    flag enablement; no real-client intake or submission collection; no
    real-client data; no staff answer-review surface; no resubmission; no
    drafts or autosave; no C3/C4 implementation; no cycle/MENSES data; no
    CALORIES input; no expansion into unrelated features. This
    authorization becomes actionable only after this decision record is
    independently reviewed and merged through the protected-branch
    process and a separate implementation prompt is issued.

85. **Reads after consent withdrawal.** After applicable consent is
    withdrawn: all new submission writes fail closed; detailed
    submission-answer reads fail closed, including the client's own
    detail view; staff detail access likewise remains unavailable.
    Bounded operational list metadata may remain visible where already
    authorized — limited to information such as the existence of the
    submission, assignment/form identity, status, and submission date —
    and must not contain answer content or reveal superseded values.
    Restoration or renewed-consent behavior remains deferred and requires
    a separate decision.

### P-023 binding engineering contract (not owner choices)

The independently reviewed plan fixes these engineering requirements for
the future implementation; they constrain the build, they are not
additional owner decisions:

- Answer payload is an ordered JSON **array** of `{fieldId, value}`
  records (max length 100 = `FORM_LIMITS.maxFields`); every entry is a
  plain object with exactly `fieldId` + `value`; duplicate `fieldId`s are
  rejected **before** canonicalization; unknown keys, sparse/malformed
  entries, and unsupported value shapes are rejected.
- v1 has no submission-revision table, revision pointer, or revision
  count — one immutable `OnboardingSubmission` plus revision-free
  `OnboardingSubmissionAnswer` rows per assignment.
- The existing `OnboardingForm @@unique([id, workspaceId])` is preserved
  (verified present on exact `origin/main` — an earlier review claim that
  it was missing was itself corrected).
- Implementation adds one wide unique to `OnboardingFormAssignment`:
  `@@unique([id, workspaceId, clientProfileId, formId, formVersionId])`,
  backing a single composite submission FK that enforces
  assignment/workspace/client/form/pinned-version coherence at the
  database level; remaining FK targets (`ClientProfile(id,workspaceId)`,
  `OnboardingFormVersion(id,formId)`, `WorkspaceMember(id,workspaceId)`)
  already exist.
- Transaction order (Serializable, bounded fresh-transaction retry):
  resolve the caller's own `ClientProfile` from `(workspaceId,
actorUserId)` server-side → scoped assignment pre-read (own profile +
  workspace + id; foreign/missing fail non-disclosingly before any
  advisory) → `onbassign` advisory → `member` advisory →
  `workspace_member` `FOR UPDATE` re-derive ACTIVE+CLIENT →
  `authorize(..., createPrismaAuthorizationRepo(tx))` requiring `own` →
  existing-submission lookup by `assignmentId` **before** ACTIVE-state
  enforcement → assignment `FOR UPDATE` full revalidation →
  `ClientProfile` `FOR UPDATE` → consent rows `FOR UPDATE` in kind order
  → pinned-version definition read → validate → insert submission +
  answers → assignment → `COMPLETED` with `endedByMemberId`/`endedAt`
  provenance → structural `CREATE onboarding_submission` audit last →
  commit; values are served only after commit.
- Replay: any structurally valid replay returns `already_submitted` plus
  the original committed submission — no second write, no second audit;
  malformed/oversized replay fails validation before the shortcut; the
  guarantee is at-most-one durable submission, not cryptographic
  exactly-once.
- Bounds: reuse `FORM_LIMITS` and `ASSIGNMENT_LIMITS.idMax = 128`; the
  R3-labeled engineering safety bounds (text char/byte caps, decimal
  grammar, date range, choice counts, `answersJson` ≤ 64 KiB, zero answer
  content in errors/logs/audit) are binding.
- `beforeunload` registers only while the form is dirty and is removed
  after a committed submit and on unmount; the irreversible-submit
  confirmation and #35 submit-only disclosure are required.
- The implementation record must state which typed-value cardinality
  rules are database CHECKs versus service checks (R3-R1 P3 note).
- Dedicated `(tracker)` client-onboarding layout; `no-store` on GET and
  the action POST; responsive/a11y verification at 1440px/834px/390px;
  synthetic fixtures only; production fail-closed; important assertions
  require mutation evidence per the conductor skill.

## P-024 staff onboarding-submission review — owner approval (relayed 2026-10-10)

The product owner approved the six-question P-024 package for a
development-gated staff review surface over submitted onboarding
responses, after the P-024 → R1 (FAIL, two P1s + three P2s) → R2 →
P-024-R2-R1 (**PASS**, no P0/P1/P2, reviewer
`opencode-go/deepseek-v4.1-flash`) plan/review chain. Full record:
`docs/tasks/p024-staff-onboarding-review.md`. These record product rules
and an authorization boundary only — they authorize **no** implementation
by themselves; implementation additionally requires the normal
protected-branch process and a separate implementation prompt.

86. **One workspace-wide terminal review.** A submitted onboarding
    response has exactly one workspace-wide review acknowledgement — not
    a per-coach checklist. The review record belongs to the workspace
    workflow; a later authorized staff member sees the existing reviewed
    state rather than creating another acknowledgement. This does not
    grant every workspace member permission to read the submission.
87. **Review acknowledgement is terminal.** Once committed, the review
    acknowledgement cannot be removed, reopened, reassigned, or replaced;
    it is immutable workflow evidence. There is no review deletion or
    "mark unreviewed" action in this slice. Correcting or changing
    submitted client answers remains out of scope.
88. **Review is informational, not a downstream gate.** The
    acknowledgement records that an authorized coach reviewed the
    submitted onboarding details. It does not block or unlock
    assignments, plans, tracking, check-ins, dashboards, messaging, or
    any other workflow. Any later downstream gating requires a separate
    owner decision and implementation task.
89. **Explicit detail reads receive structural READ audit evidence.** A
    successfully committed explicit "View details" action creates one
    structural READ audit record. List GETs, pagination, prefetch,
    refresh, back/forward navigation, loading, rerendering, and failed or
    unauthorized requests create zero READ audits. The detail response
    and audit commit atomically; audit failure returns no answer values.
    This is at-least-once POST behavior, not an exactly-once network
    guarantee.
90. **UI requires successful detail view before "Mark reviewed."** The
    intended flow requires the coach to open the details successfully
    before the interface enables "Mark reviewed"; the server still
    independently re-authorizes the mark action — the UI sequence is a
    user-experience rule, not a substitute for server authorization. A
    stale, revoked, withdrawn, foreign, or otherwise unauthorized mark
    request fails closed. Assistants cannot mark reviewed.
91. **Reviewer identity is bounded staff workflow metadata.** The
    reviewer's identity and review timestamp may be shown only to staff
    currently authorized to access that client's onboarding submission
    under the approved matrix. They are not public, client-facing, or
    generally workspace-visible; they must not appear in unauthorized,
    revoked, foreign-workspace, SUPPORT, PLATFORM_ADMIN, or client
    responses. The bounded display covers only who reviewed and when —
    never submission answers or superseded values.

### P-024 settled authorization matrix (decision #37 — not part of the six forks)

WORKSPACE_OWNER reads at workspace scope with no coaching
`ClientAssignment` requirement and cannot mark reviewed in this slice;
COACH reads and may mark only when the coherent coaching `ClientAssignment`
is ACTIVE and all current authorization/consent checks pass;
ASSISTANT_COACH reads through the same relationship and cannot mark;
CLIENT is denied the staff-review surface; SUPPORT denied; PLATFORM_ADMIN
denied **including a dual-role platform administrator holding an ACTIVE
workspace membership of any role** (`onboardingSubmissionReviews` joins
`PLATFORM_ADMIN_DENIED_RESOURCES` — a binding engineering requirement
derived from settled policy, not a seventh decision). Terminal
coaching-assignment removal or revocation ends coach/assistant access;
workspace-owner access continues per workspace scope subject to current
membership, workspace, consent, and feature-mode requirements.

### P-024 binding engineering contract (not owner choices)

The independently reviewed R2 plan fixes these requirements for the
future implementation; they constrain the build and are not additional
owner decisions:

- Dedicated staff route `/workspace/[ws]/clients/[cp]/onboarding` +
  `onboardingSubmissionReviews` resource; `force-dynamic` + route-scoped
  `Cache-Control: no-store` on GET and both action POSTs.
- Shared fail-closed resolver — the same flag + trusted dev/test runtime
  boundary as P-023; production/unclassified resolves unconfigured.
- Bounded header-only list (zero answer values, zero audits, strict
  `?c=` cursor); explicit `useActionState` "View details" and "Mark
  reviewed" POSTs.
- Answer-free workspace/client-scoped pre-read before any advisory; the
  advisory key `onbassign:{workspaceId}:{clientProfileId}:{formId}` is
  derived only from the server-resolved coherent row — never caller-
  supplied tuple components; foreign/missing/incoherent selections fail
  non-disclosingly before lock acquisition. `OnboardingFormAssignment`
  (intake pinning/completion) and `ClientAssignment` (coach↔client
  authorization) are distinct and never conflated.
- Explicit workspace vs assigned transaction branches: owner reads with
  no `ClientAssignment` dependency; assigned scope re-resolves and locks
  the coherent ACTIVE `ClientAssignment`. Member role, authorization,
  consent, client, form assignment, submission, and review state are all
  rebound inside the transaction.
- Consent checked before any answer query or existing-review return;
  review never mutates submission or answer rows.
- `OnboardingSubmissionReview`: terminal immutable record — no answer
  columns, no unjustified `updatedAt`, `unique(submissionId)` workspace-
  terminal anchor, all required Prisma backrelations, Prisma-declared
  composite coherence targets + raw-SQL composite FKs, `ON DELETE
RESTRICT`.
- Bounded one-time `P2002` recovery re-enters the full authorization +
  consent protocol; no outside-transaction shortcut may return reviewed
  state.
- Structural audits: `READ onboarding_submission {changed:false}` per
  committed detail; `CREATE onboarding_submission_review {changed:true}`
  per committed review; audit last, failure rolls back everything.
- Reviewer identity/timestamp exposure follows #91; the mark control
  follows #90 with independent server enforcement; RED-first evidence and
  mutation checks are required for the future implementation.

### P-024 implementation authorization boundary

Implementation is authorized only under: synthetic data only; development
and automated-test environments only; the existing default-off feature
gate; production fail-closed; no deployment; no production flag
enablement; no real-client data; no answer editing/resubmission; no
review notes/tasks/notifications/messaging; no check-ins, dashboards,
meal plans, training, or habits; no downstream workflow gating; no
C3/C4; no cycle/MENSES; no CALORIES input; no client-facing reviewer
disclosure; no retention/erasure/export implementation; no D-10
resolution; no expansion into unrelated features. This authorization
becomes actionable only after this decision record is independently
reviewed and merged through the protected-branch process and a separate
implementation prompt is issued.

## P-025 Check-In v1 — owner approval (relayed 2026-10-10)

The product owner approved the six-question P-025 package for a
development-gated Check-In v1 slice, after the P-025 → R1
(CONDITIONAL PASS, no P0/P1, four P2s) → R2 → P-025-R2-R1 (**PASS**,
no P0/P1/P2, reviewer `opencode-go/deepseek-v4.1-flash`) plan/review
chain. Full record: `docs/tasks/p025-check-in-v1.md`. These record
product rules and an authorization boundary only — they authorize
**no** implementation by themselves; implementation additionally
requires the normal protected-branch process and a separate
implementation prompt per slice.

92. **One-off Check-Ins only in v1.** v1 supports individually
    scheduled, one-off Check-In instances. Recurring schedules,
    recurrence rules, calendar materialization, skipped occurrences,
    rescheduling series, and reminder automation are deferred. A future
    recurrence feature may materialize additional instances into the
    same table but requires separate owner approval. This decision
    neither implements nor authorizes recurrence.
93. **Single due timestamp and late submissions.** Each v1 Check-In
    instance has one due timestamp; there is no separate opening or
    closing window in v1. Clients may submit after the due timestamp
    while the instance remains otherwise eligible, and late submissions
    are visibly marked late. `dueTz`, if retained as a display label,
    does not constitute an approved timezone or calendar policy; full
    timezone, DST, grace-period, and closure rules remain deferred.
94. **Client-created custom Check-Ins deferred.** Clients cannot
    create their own Check-In instances or questionnaires in v1; D-05
    remains unresolved for future custom/client-initiated Check-Ins.
    v1 Check-Ins originate from authorized staff-managed form
    definitions and scheduling. Custom Check-Ins require separate
    product, authorization, consent, and lifecycle decisions.
95. **Workspace-owner and coach Check-In management.** Workspace
    owners and coaches may create, edit, publish, archive, and schedule
    Check-In forms under current workspace authorization.
    Workspace-owner paths do not require a coaching `ClientAssignment`.
    Coach client-specific scheduling and read operations require a
    coherent ACTIVE `ClientAssignment`. Assistants cannot create, edit,
    publish, archive, or schedule forms in v1. Clients cannot manage
    form definitions or scheduling. Workspace owners may inspect
    authorized workspace workflow state but cannot mark client Check-In
    submissions reviewed in v1; assigned coaches perform review
    acknowledgement. Assistants receive only the separately authorized
    assigned read access and cannot mark reviewed. SUPPORT and
    PLATFORM_ADMIN remain denied. This decision does not authorize
    implementation.
96. **Terminal acknowledgement only; richer feedback deferred.** v1
    staff review is a terminal acknowledgement. Written feedback,
    video, audio, attachments, change summaries, coaching messages,
    and automated recommendations are deferred. The acknowledgement
    does not create messaging or notification behavior. Reviewer
    identity and timestamp follow decision #91's bounded staff-only
    visibility. Review acknowledgement is separate from any future
    feedback model.
97. **Cancellation only before submission.** Only an unsubmitted
    SCHEDULED Check-In instance may be cancelled. Submitted and
    reviewed Check-Ins cannot be cancelled in v1: submitted answers and
    review history remain immutable and historically visible, and no
    `SUBMITTED→CANCELLED` or `REVIEWED→CANCELLED` transition exists.
    Correcting, voiding, replacing, or administratively suppressing a
    submitted Check-In requires a separate future policy. Cancellation
    carries ending provenance and is terminal.
98. **Recurring Check-Ins: rule record plus materialized instances.**
    Recurring Check-Ins use one stored recurrence-rule record; the
    system materializes ordinary Check-In instances ahead over a
    bounded horizon. Submitted or reviewed instances are immutable and
    are never rewritten by later schedule edits. **Unresolved:** the
    recurrence grammar, timezone authority, DST behavior, horizon
    length, pause/skip behavior, edit-future semantics, and any default
    timezone remain unapproved — recurrence is not implementation-ready
    until those rules are decided. Calendar presentation does not
    depend on recurrence and may proceed independently over existing
    one-off instances. This decision does not authorize implementation.
99. **Custom Check-In coverage requires an explicit coach mark.** A
    custom Check-In does not silently satisfy a scheduled occurrence; a
    custom submission covers a scheduled date only when an authorized
    coach explicitly marks that relationship, and no automatic
    nearest-date matching exists. **Unresolved:** the D-05 details
    governing whether clients may initiate custom Check-Ins, exact
    eligibility and UI, and the future coverage-relationship data model
    remain open. This decision does not authorize implementation.
100.  **Selected summaries are immutable build-time field flags.**
      Summary selection is defined at form-build time: the immutable
      published Check-In definition records which of its own fields are
      eligible to display a running summary, and later edits create a new
      immutable version rather than altering prior submissions.
      **Excluded:** no AI-generated summaries; no automatic DailyEntry
      metric panel; no parameter foreign keys invented for this feature;
      no cross-domain summary behavior unless separately approved.
      **Unresolved:** exact supported field kinds, aggregation formulas,
      minimum sample thresholds, display periods, and empty-state
      behavior. This decision does not authorize implementation.
101.  **Feedback: bounded staff-authored text first.** The first
      feedback expansion beyond the terminal review acknowledgement is
      bounded staff-authored text feedback, as a separate future slice.
      Video links, attachments, messaging, tasks, notifications, and
      richer channels are not authorized by this decision and remain
      gated by D-09 (video provider), D-10 (retention), legal/privacy
      review, attachment storage/scanning/download controls, and the
      unresolved feedback edit/delete lifecycle. This decision does not
      authorize implementation.
102.  **Retention direction: owner-defined retention window.** New
      client-visible feedback/attachment records use an owner-defined
      retention window rather than indefinite retention. This is an
      approved direction only: the actual retention duration, defaults,
      per-workspace configurability, consent-withdrawal behavior, legal
      holds, and deletion/anonymization behavior remain unresolved, and
      D-10 is **not** resolved by this decision. This decision does not
      authorize implementation.
103.  **DailyEntry tracker context: explicit manual date selection.**
      P-025-D6 uses explicit manual declared-date selection: after an
      authorized staff member deliberately chooses "Show tracker
      context," they manually enter one `YYYY-MM-DD` DailyEntry
      `entryDate`; the server validates that date and independently
      re-authorizes the request, and may return only the latest committed
      revision of the DailyEntry for that exact selected date. There is
      no fallback to the current date, Check-In due date, submission
      date, nearest date, or latest entry across all dates; no passive
      preload; no unbounded history browsing; no automatic
      date-availability list; no new availability API; no raw internal
      identifiers in browser values; a missing entry returns a
      non-disclosing empty state; superseded DailyEntry values remain
      hidden. Manual date entry was approved; bounded answer-free
      available-date browsing was **not** approved and is not part of
      D6. This resolves the product gate for P-025-D6 but does not
      authorize implementation.

104.  **Check-In calendar: viewer-local day placement over one-off
      instances — APPROVED.** _(Chronology: this entry was first
      recorded as PROPOSED/pending at implementation time because
      development preceded explicit decision recording — the
      independent reviewer correctly held it as a product hold. The
      owner has since directly approved the four calendar product
      choices AND granted a one-time acceptance of starting the
      implementation before decision recording and the separate
      planning review, conditional on the truncation repair and a
      final independent review. The exception is bounded to the D2
      chronology: it waives neither tests, security/privacy
      requirements, final independent review, CI, separate merge
      approval, nor future planning discipline. Owner attribution —
      the browser-local-timezone choice was also supported by
      Marcel's conversation; the process exception is owner-supplied.)_
      P-025-D2
      presents existing one-off Check-In instances
      on a read-only calendar. Calendar day placement uses the
      **viewer's browser timezone**: each viewer sees each instance on
      their own local calendar day, and the surface is clearly labelled
      so viewers understand why calendar days may differ across
      timezones. This is a display-only rule — it does **not** establish
      a timezone authority, DST, or recurrence policy (those remain
      unresolved under #98). The calendar is provided to **staff and
      clients**, each strictly within the existing `checkinInstances`
      permission scopes. Presentation is a **month grid plus an
      accessible agenda list** rendering the same bounded data.
      **Cancelled instances remain visible** and are labelled with
      explicit "Cancelled" text. The calendar is read-only: it creates
      no stored status, no rescheduling, and no new mutations.
      Approval was granted directly by the owner after the technical
      repair; the product gate is resolved, while PR merge and
      deployment remain separately authorized.

### P-025-D binding engineering contract (not owner choices)

Independently reviewed requirements for the future P-025-D6
implementation, derived from the merged authorization/locking/consent/
audit protocols — recorded separately from decisions #98–#103 and
**not implemented**:

- D6 is a separate explicit server action in its own Serializable
  transaction — never nested inside the Check-In detail transaction.
- Authorization is the strict intersection of
  `checkinsCoachReviews/read` and `dailyTracking/read`; both scopes are
  captured and reconciled (workspace+workspace → workspace;
  workspace+assigned → assigned; assigned+assigned → assigned; any
  denial or unsupported combination → fail closed). Dual-role platform
  administrators remain denied through the Check-In resource before
  values are accessed.
- Assigned scope requires authoritative current assignment
  re-resolution and locking.
- Advisory order is `csetup → member` (the DailyEntry protocol order);
  `chkin` is never acquired after `member`. Check-In instance/
  submission coherence uses Serializable snapshot reads — no Check-In
  row locks — while member, assignment, profile, consent, and
  applicable DailyEntry locks/checks remain required.
- Fresh consent intersection (Check-In + DailyEntry policy kinds) is
  evaluated in-transaction before values.
- The existing structural `READ daily_entry` audit is written last;
  audit failure returns no values; passive rendering and denied/failed
  requests produce zero successful-read audits; repeated committed
  reveals keep the existing at-least-once semantics.
- No new database table, RBAC resource, or audit resource is authorized
  for D6; production remains default-off and fail-closed.
- Required tests include real-PostgreSQL barrier-driven deadlock/
  inversion coverage with explicit timeouts, the complete role/scope
  matrix, both asymmetric authorization cases, consent withdrawal,
  cross-tenant substitution, manual-date bounds, no-fallback behavior,
  no-entry behavior, latest-revision-only behavior, passive-query
  prevention, audit rollback, and biting security mutations.

### P-025 binding security requirements (not owner choices)

These are binding fail-closed engineering requirements for the future
implementation, derived from settled policy — they are recorded
separately from the six owner decisions and are **not yet implemented**:

- Future implementation must add `checkinFormDefinitions`,
  `checkinInstances`, and `checkinsCoachReviews` to
  `PLATFORM_ADMIN_DENIED_RESOURCES`. A platform administrator remains
  denied **including a dual-role administrator holding an ACTIVE
  workspace membership of any role**; SUPPORT and platform-only callers
  remain denied.
- The existing `checkinsCoachReviews` RBAC and consent entries are
  pre-stubbed, unexercised targets — evidence of intended architecture,
  **not** prior owner approval of any Check-In behavior.

### P-025 inherited policy precedents

- **#82** supplies the no-resubmission precedent: Check-In resubmission
  remains excluded without separate approval.
- **#85** supplies the consent-withdrawal visibility precedent: writes
  and detail reads fail closed; bounded operational list metadata may
  remain visible.
- **#86** supplies the workspace-terminal review precedent.
- **#91** governs reviewer identity and timestamp as bounded
  authorized-staff metadata.
- These are design precedents for P-025, not claims that Check-In
  exists.

### P-025 binding engineering contract (not owner choices)

The independently reviewed R2 plan fixes these requirements for the
future implementation; they constrain the build and are not additional
owner decisions and are **not implemented**:

- Check-In is a distinct domain from onboarding; safe reuse is limited
  to validation, renderer, authorization, consent, audit, and
  transaction patterns — no premature generic "everything is a form"
  abstraction. Proposed models: `CheckInForm`, `CheckInFormVersion`,
  `CheckInInstance`, `CheckInSubmission`, `CheckInSubmissionAnswer`,
  `CheckInReview`; published versions are immutable self-contained
  snapshots with a new domain `CheckInAnswerKind` preserving stable
  field IDs, labels, kinds, option IDs/text, required state,
  validation, display order, classification metadata, and
  retired-option tombstones.
- No mutable stored instance status: effective state is derived by one
  shared projector — CANCELLED from coherent cancellation provenance,
  else REVIEWED from a coherent review, else SUBMITTED from a coherent
  submission, else SCHEDULED. Submission, review, and cancellation
  serialize under the same advisory key
  `chkin:{workspaceId}:{clientProfileId}:{formId}` plus the instance
  row lock; lock tuples derive from bounded server-side tenant/client-
  scoped pre-reads; foreign or incoherent input fails before advisory
  acquisition.
- Workspace-owner paths have no coaching-assignment dependency;
  assigned coach/assistant paths re-resolve and lock a coherent ACTIVE
  `ClientAssignment`; client operations rebind to the own profile;
  consent is checked before answer queries; feature-mode and
  authorization recheck inside transactions; `P2002` recovery re-enters
  the full protocol once.
- Audit writes occur last and roll back the operation on failure;
  sensitive detail reads and structural audits commit atomically;
  passive GET/list/pagination/prefetch/refresh creates zero sensitive
  READ audits; lists carry bounded metadata and no answer values;
  errors never reflect submitted answers.
- Production consent classification remains unresolved and
  fail-closed; synthetic `BASE_CONSENTS` behavior is dev/test only; the
  shared server-only `ENABLE_CHECK_INS` resolver is default-off,
  trusted development/test only, production/unknown fail-closed, shared
  by pages/actions, and absent from client bundles.
- Historical rows use `ON DELETE RESTRICT`; required Prisma composite
  targets and relation backfields are declared; the answer coherence
  target is `CheckInSubmission(id, workspaceId, clientProfileId)` with
  answer FK `(submissionId, workspaceId, clientProfileId)`; no answer
  values are copied into instance or review rows; no production
  enablement or deployment.

### P-025 implementation slices (each separately authorized)

- **P-025-A** — Check-In form definitions and immutable published
  versions: enabling infrastructure, not independently client-visible.
- **P-025-B** — one-off instance scheduling and client submission:
  the first client-visible Check-In value.
- **P-025-C** — authorized staff detail and review acknowledgement.
- **P-025-D** — deferred: recurrence, custom Check-Ins, richer
  feedback.

Each slice requires separate authorization, RED-first evidence, real
disposable-PostgreSQL integration, production-build browser testing,
mutation checks, different-model review, separate PR and merge
approval, and default-off behavior. The currently recommended first
implementation slice is P-025-A; it remains unauthorized.

### P-025 future test/mutation contract (required at implementation)

Dual-role PLATFORM_ADMIN denial plus deny-set-removal mutation;
pre-stubbed RBAC cells not treated as approval; exact advisory-key
shape; zero advisory acquisition for foreign input; owner path with no
`ClientAssignment`; assigned path locking a coherent ACTIVE
`ClientAssignment`; client-own rebinding; immutable form versions;
derived-state consistency; cancellation/submission/review races; no
cancellation after submission; duplicate submission and review;
`P2002` full-protocol recovery; answer composite-FK coherence;
answer-kind/typed-column CHECK; consent-before-answer query; consent
withdrawal; audit atomicity and rollback; zero audit on passive reads;
trusted-environment feature boundary; bounded-list privacy; browser
behavior at 1440px/834px/390px; keyboard, focus, screen-reader, touch,
overflow, loading, empty, error, revoked, closed, submitted, and late
states; scratch mutations proving critical assertions fail.

### P-025 implementation authorization boundary

Implementation is authorized only under: synthetic data only;
development and automated-test environments only; the shared
default-off `ENABLE_CHECK_INS` feature gate; production fail-closed;
no deployment; no production flag enablement; no real-client data; no
recurrence/calendar materialization; no client-created Check-Ins; no
resubmission; no cancellation after submission; no
text/video/audio/attachment feedback; no notifications or messaging;
no dashboards/analytics or automated advice; no nutrition/meal plans,
training, or habits; no C3/C4; no cycle/MENSES; no CALORIES input; no
billing; no retention/erasure/export implementation; no D-10
resolution; no P-024 implementation; no expansion into unrelated
features. This authorization becomes actionable only after this
decision record is independently reviewed and merged through the
protected-branch process and a separate implementation prompt is
issued per slice.

## FRONTEND-INTEGRATION-P1 — owner approval (2026-10-11, implementation prompt)

**Decision #105 (APPROVED):** the Lily visual integration on the existing
client DailyEntry workflow is approved under four owner choices:

1. A declared-date picker with previous/next-day controls, using the
   EXISTING `parseDeclaredDate` bounds (#66) — the declared date stays a
   plain calendar date, never a timezone-converted instant.
2. The visual treatment applies ONLY to the persistent client DailyEntry
   form and its history — the surrounding application shell is unchanged.
3. The backend's existing fonts are kept; Lily's font assets are not
   copied.
4. The existing bounded client history is grouped by week
   (presentation-only, no new queries, aggregates, calculations, or
   "load more").

This approval covers the bounded implementation slice only — not PR
merge, deployment, production enablement, staff views, comments,
aggregates, new field kinds, or any other frontend feature. Decision
number 104 remains reserved for the pending Check-In calendar product
choices on `feature/p025d2-checkin-calendar` (proposed, unconfirmed) —
no collision is created by this record.

## FRONTEND-INTEGRATION-P2 — owner approval (2026-10-11, implementation prompt)

**Decision #106 (APPROVED):** a bounded client Home navigation surface in
Lily's visual direction is approved, connecting ONLY existing client
routes (daily tracking with its history, onboarding, check-ins/calendar)
with no next/latest data cards, no counts or aggregates, no dashboard
persistence or widget configuration, no new domains/permissions/settings.
Card visibility mirrors the existing client nav feature gates; staff see
the staff shell with a client-surface note instead of cards. Unmatched
Lily features stay on the roadmap (the P2 register); their intended
functionality is preserved as product intent without claiming their
behavior/permissions are settled.

## FRONTEND-INTEGRATION-I4 — owner approval (2026-10-12, implementation prompt)

**Decision #107 (APPROVED):** exactly one functional client Home card is
approved — the earliest unfinished scheduled Check-In — as a bounded
exception to #106's "no next/latest data cards" scope. Owner-approved
selection rule: overdue scheduled items precede future scheduled items;
cancelled, submitted and reviewed instances are excluded; ordering is
deterministic by `dueAt` ascending then instance id ascending;
eligible-state filtering must occur inside the bounded database query —
never post-filtered from a mixed-state limited list. The card links to
the existing authorized instance detail route, shows an overdue label
not carried by colour alone, reuses existing late/viewer-local
semantics, and renders a truthful no-pending state. No other dashboard
calculations, health-value cards, counts, aggregates, recurrence,
reminders, schema changes, or stored lifecycle status are introduced.

**Decision #108 (APPROVED):** persisted coach-configured client dashboard
layouts (DASHBOARD-I1, under the independently approved DASHBOARD-P3
contract). Owner-approved product rules: one shared arrangement per
client with a server-filtered client subset (`settings.visibility`
staff/client, default staff); automatic saving with truthful
Saving/Saved/Failed/Conflict feedback and no separate Save or Publish
step; workspace owners and ACTIVE assigned coaches may edit; assigned
assistants view only; clients view their own committed layout and
cannot edit; layout permission never grants widget-data permission;
unimplemented intended widgets remain truthful not-connected
placeholders preserving the 20-widget/9-category Lily catalogue.
Engineering contract: config-only `ClientDashboardLayout` (no
measurements/answers), bounded allowlisted validation, `cdash`-then-
`member` advisory order per the chkin/csetup convention, atomic
revision CAS with reconcile-on-409, structural write audits only,
trusted-runtime `ENABLE_CLIENT_DASHBOARD` gate. Personal appearance
preferences remain separate; no widget calculations or new data
domains.

**Decision #109 (APPROVED):** real client tasks (CLIENT-TASKS-I1, under the
independently reviewed CLIENT-TASKS-P2/P3 contract). Owner-approved product
rules: workspace owners and ACTIVE assigned coaches create/edit/cancel
tasks; assigned assistants read only; the client reads their own tasks and
performs complete/undo transitions only — staff cannot complete on a
client's behalf even when they also own a client profile; cancelled tasks
are hidden from the client but retained for authorized staff; tasks
survive removal of the assigning coach and remain completable by the
client while the removed coach loses access; overdue is computed display
metadata against the server-UTC calendar date, never a stored status;
CU03 "Client tasks" is the connected widget (`option` open/completed/both);
task-data authorization is independent of dashboard placement; the
`ENABLE_CLIENT_DASHBOARD` gate is reused. Engineering contract:
`ClientTask` rows with declared `@db.Date` due dates (strict `YYYY-MM-DD`,
proposed task-specific upper bound of server-UTC today + 5 calendar
years, leap-normalized — an engineering safety bound, not decision #66's
`today+1` rule); composite same-workspace coherence FKs; RESTRICT
deletion; paired provenance CHECKs (`completed_at` durable, the SetNull
`completedByUserId` pointer excluded); `ctask`-then-`member` advisory
order; operation split enforced inside the transaction after scope
resolution; explicit desired-state transitions (idempotent replay,
CAS conflict, no blind toggle); audit on changed ALLOW mutations only.
No attachments, comments, reminders, notifications, or private coach
tasks; retention/deletion stays deferred under unresolved D-10.
