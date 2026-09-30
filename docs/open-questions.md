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
> scripts and/or the original `.xlsx` arrive. See `TRACKER 2.0.md` §9.5.

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
`docs/product-decisions.md` #13–19). Several items are now **answered**; the rest stay
`TODO(human)` and still block the corresponding parts of S1-F.

16. **ANSWERED — Registration model:** invite-only for the initial product; coaches invite
    clients; public self-registration may be considered later (product-decisions #13).
17. **PARTIALLY ANSWERED — Invite permissions:** product roles are coach, optional
    assistant coach, and client; the founder questioned whether an "owner" role is
    product-facing (may be a gym owner — product-facing name still open,
    product-decisions #14). The intended policy (owner/admin invites
    COACH/ASSISTANT_COACH/CLIENT; COACH invites CLIENT only; others denied) is a
    conservative engineering interpretation, not yet approved or implemented.
18. **PARTIALLY ANSWERED — Existing users:** one `User` may hold memberships in multiple
    workspaces (multi-coach sharing, product-decisions #16). Still open: whether
    acceptance must occur while signed in as the invited email.
19. **ANSWERED — Client invites:** clients self-onboard — acceptance creates and links
    the `ClientProfile`; no coach pre-created profile (product-decisions #15).
20. **ANSWERED — Invite lifetime/invalidation:** 12-hour expiry; a replacement cancels
    previous matching links (product-decisions #17). Still open: owner revocation of a
    specific outstanding invite.
21. **`TODO(human)` — Invite acceptance details:** password set during acceptance; invite
    possession = email verification; `INVITED → ACTIVE` transitions; SUSPENDED/REMOVED
    membership behavior.
22. **`TODO(human)` — Recovery eligibility:** which user states may receive a reset
    (ACTIVE-only was the unapproved recommendation); always-generic public response.
23. **ANSWERED — Reset invalidation/logout:** 12-hour expiry; replacement cancels
    previous matching links; successful reset must log out other devices
    (product-decisions #17/#18 → `User.sessionVersion` foundation).
24. **`TODO(human)` — Password policy:** min length / complexity / breach-check / reuse —
    explicitly undecided pending the product name (product-decisions #19).
25. **`TODO(human)` — Email delivery:** provider, sender identity, and app base URL all
    undecided pending the product name (product-decisions #19).
26. **`TODO(human)` — Abuse protection:** rate limits/cooldowns/lockouts; no rate-limit
    infra exists; no existence oracles.
27. **`TODO(human)` — Token/audit specifics:** which invite/recovery outcomes are audited;
    how user-owned (non-workspace) audit rows are stored given `AuditEvent.workspaceId` is
    required; DENY-event volume policy; token-row retention + cleanup cadence; whether
    standalone `EMAIL_VERIFICATION` is in scope.

## Resolved (recorded for traceability)

- **Privacy policy:** committed artifacts preserve structure and redact identifiers/health
  values; unredacted output is local-only and fail-closed; demo data is synthetic; disclaimer,
  license, and footer text stay verbatim. See `docs/redaction-policy.md`.
- **Prime State reuse boundary:** technical foundation only; no product identity, data,
  formulas, seeds, or security assumptions. See `docs/reuse-assessment.md`.
