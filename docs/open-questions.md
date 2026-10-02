# Open questions

Unresolved items and `TODO(product)` decisions. `TODO(product)` marks behavior or content
that cannot be derived from the supplied HTML exports and must not be guessed.

## Blocking source gaps

1. **`TODO(product)` — Missing original `Copy of PRGRSS 2.0.xlsx`.** All formulas, data
   validations, conditional formats, and hidden rows/sheets are lost in the HTML export. The
   export contains 546 exercises and 599 foods versus the requirements' ~990 / ~1,170, so the
   HTML is likely partial. Extraction is HTML-only until the workbook is supplied; if it is
   added under `sources/`, `exceljs` becomes the primary source.
2. **`TODO(product)` — Missing image references.** `cellImage_2050288505_0.jpg` (referenced by
   `DAILY TRACKER.html`) and `cellImage_227302925_0.jpg` (referenced by `TIMELINE.html`) do not
   exist in `resources/`. The 12 available images are sufficient to continue layout work.

## Underivable semantics (PRGRSS 2.0)

> Status: `CRE8_Input_Flow_Overview.html` was received 2026-09-29 and documents the **CRE8**
> workbook (a related workbook that explicitly **excludes PRGRSS 2.0**). It does not resolve
> PRGRSS 2.0 behavior. It also has its own residual gaps (food/nutrient lookup chain, DOMS /
> training quality-duration / notes pulls, detailed Bloodwork cross-tab use, PED Change Log →
> Timeline route, fibre mapping mismatch, unsaved Supplements check-in decision, and several
> unconfigured Dashboard charts). PRGRSS 2.0 formulas remain underivable until the PRGRSS
> scripts and/or the original `.xlsx` arrive. See `docs/product-decisions.md` #7 and #12.

3. **`TODO(product)` — Calorie column** in DAILY TRACKER is marked "automatic"; the formula is
   not in the export.
4. **`TODO(product)` — Weekly averages/trends** semantics (Δkg, Δ%, session count, "no data",
   "0/0" empty) are values-only; rules unknown.
5. **`TODO(product)` — MENSES cycle-phase estimation** and next-period/ovulation estimation
   logic are unknown.
6. **`TODO(product)` — T-minus** computation is values-only.
7. **`TODO(product)` — MEALPLAN per-meal subtotals and overview sums**; formulas lost. The
   MEALPLAN overview values also disagree with the TIMELINE target values — reconcile.
8. **`TODO(product)` — Water/salt averages appear swapped** in the DAILY TRACKER export
   (columns [47]/[48]); verify against the xlsx whether labels or averaging are misaligned.
9. **`TODO(product)` — Sparkline/chart configuration** is a CSS artifact only; actual series
   definitions are absent.
10. **`TODO(product)` — SUPPLEMENTATION / PEAKING / SHOWDAY** have no confirmed wiring to the
    other sheets.

## Product / scope decisions

11. **`TODO(product)` — Product name and branding** are undecided; "App" is a placeholder. The
    repository slug is not the product name.
12. **`TODO(product)` — Pre-release redistribution/licensing review** for a shipped web app.
    Aleks and Marcel **confirmed permission to use the supplied workbook and the existing
    application for implementation** (see `docs/product-decisions.md` #8), so permission to
    implement is **not** open. What remains open is the separate pre-release legal/product
    determination of redistribution/licensing terms for distributing the app (the workbook is
    licensed material: `© 2026 INFINITYCRE8 · Licensed to PRGRSS GmbH · License ID
CK-2026-K8M3 · Redistribution, resale or sublicensing prohibited`).
13. **`TODO(product)` — PED/HRT data policy and legal review** before shipping any module that
    surfaces this data.
14. **`TODO(product)` — Localization.** Prime State has de/en localization; localization is
    omitted from this scaffold and may be requested later. Do not add i18n now.
15. **`TODO(product)` — `SHEETS_SOURCE_DIR` default.** Per ruling 2 the default is the supplied
    extracted folder and it is overridable via the environment; the extractor must fail clearly
    if missing and never write into the source directory.

## S1-F invite/recovery decisions (detailed options in `docs/tasks/s1-f-invites-recovery-plan.md` §2)

Founder answers were relayed by Hanzlah on 2026-09-30 (recorded in
`docs/product-decisions.md` #13–19; final answers #20–28). Most S1-F items are
now **answered**; the rest stay `TODO(human)`.

16. **ANSWERED — Registration model:** invite-only for the initial product; coaches invite
    clients; public self-registration may be considered later (product-decisions #13).
17. **ANSWERED (policy) — Invite permissions:** owner/admin invites
    COACH/ASSISTANT_COACH/CLIENT; COACH invites CLIENT only; ASSISTANT_COACH and
    CLIENT cannot invite; OWNER/SUPPORT/platform-admin invitations stay denied;
    workspace admin/head coach may revoke outstanding invites (product-decisions
    #25). Still open: the product-facing name of the technical `WORKSPACE_OWNER`
    role (admin / head coach / gym owner, #14).
18. **ANSWERED — Existing users:** one `User` may hold memberships in multiple
    workspaces; acceptance requires signing in as the exact invited email
    (product-decisions #20).
19. **ANSWERED — Client invites:** clients self-onboard — acceptance creates and links
    the `ClientProfile`; no coach pre-created profile (product-decisions #15).
20. **ANSWERED — Invite lifetime/invalidation:** 12-hour expiry; a replacement cancels
    previous matching links (product-decisions #17); workspace admin may revoke.
21. **ANSWERED — Invite acceptance details:** new users set a password during
    acceptance; invite possession = email verification; `INVITED → ACTIVE`
    transitions; SUSPENDED/REMOVED never silently restored — explicit
    re-invitation required (product-decisions #20/#21).
22. **ANSWERED — Recovery eligibility:** `ACTIVE` accounts only (product-decisions
    #22). Public reset response deliberately differs by account existence —
    an explicit accepted enumeration risk (product-decisions #24), never
    revealing status/role/workspace details.
23. **ANSWERED — Reset invalidation/logout:** 12-hour expiry; replacement cancels
    previous matching links; successful reset must log out other devices
    (product-decisions #17/#18 → `User.sessionVersion` foundation).
24. **ANSWERED — Password policy:** minimum 10 characters (explicit Aleks decision,
    below the 15-char recommendation — recorded risk); long passphrases allowed;
    no composition rules; no breach-check approved (product-decisions #23).
25. **`TODO(human)` — Email delivery:** provider, sender identity, and app base URL all
    undecided pending the product name (product-decisions #28 — backend stays
    provider-neutral).
26. **PARTIALLY OPEN — Abuse protection:** an existence oracle via the reset
    response is now an accepted risk; per-IP/per-identifier rate limiting is
    still required at the route layer and the mechanism is `TODO(human)` (no
    rate-limit infra exists).
27. **PARTIALLY ANSWERED — Token/audit specifics:** reset activity is
    account-level (not workspace) audit — schema design needed because
    `AuditEvent.workspaceId` is required today; token rows may be deleted after
    30 days; standalone `EMAIL_VERIFICATION` is deferred (invite possession
    verifies). Still open: DENY-event volume policy.

## P-006 blueprint decisions (owner)

28. **`TODO(human)` — Product-alignment decisions D-01…D-09** are pending owner
    approval; options, recommendations and blockers live in
    `docs/product-alignment-blueprint.md` §11. Until answered, the corresponding
    blueprint slices are blocked (e.g. calculation catalog D-06 gates all
    computed roadmap/dashboard stories).

## Resolved (recorded for traceability)

- **Privacy policy:** committed artifacts preserve structure and redact identifiers/health
  values; unredacted output is local-only and fail-closed; demo data is synthetic; disclaimer,
  license, and footer text stay verbatim. See `docs/redaction-policy.md`.
- **Prime State reuse boundary:** technical foundation only; no product identity, data,
  formulas, seeds, or security assumptions. See `docs/reuse-assessment.md`.
