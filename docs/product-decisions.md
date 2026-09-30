# Product decisions

Locked decisions for the new PRGRSS-derived product. Source: `TRACKER 2.0.md` §3 (relayed
stakeholder decisions). This document does not authorize a push, PR, deploy, or external change.

1. **New repository, new product.** This is a new repository and a completely different final
   product name. `App`, `The-great-tracker-`, `Prime Tracker Pro`, and `PRGRSS 2.0` are
   placeholders or source names, not an approved product name.
2. **The sheets are the base and core.** The 11-sheet professional workbook is the product's
   specification and source of truth.
3. **Layouts per form factor.** ~~Reproduce the sheet layouts and information architecture faithfully in
   the web UI; do not independently redesign them.~~ **SUPERSEDED (2026-09-30):**
   the sheets remain the source of data, workflow, relationships, and information
   architecture, but the literal spreadsheet layout is not the final UI. The app
   requires a full desktop/web redesign plus platform-appropriate tablet and
   mobile interfaces — one design system, per-form-factor navigation/density/
   panels, never a stretched or shrunk shared layout. Prime Tracker's visual
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
24. **Public reset response differs by account existence — accepted
    enumeration risk.** The public password-reset response deliberately differs
    depending on whether an account exists. Aleks was warned that this permits
    account enumeration and explicitly accepted the tradeoff. Boundaries still
    apply: the response may reveal only existence — never status, role,
    workspace membership, client status, or other details — and routes still
    require rate limiting, abuse monitoring, and minimized timing differences.
25. **Invitation revocation.** Workspace admin/head coach may revoke
    outstanding invitations.
26. **Token retention.** Consumed and expired/revoked token records may be
    deleted after **30 days**.
27. **Reset audit ownership.** Password-reset activity belongs in an
    account-level security log, not a workspace log.
28. **Provider neutrality.** Email provider, sender identity, product domain,
    and product name may be selected later; the backend remains
    provider-neutral.

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
