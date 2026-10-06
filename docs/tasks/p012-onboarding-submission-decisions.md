# P-012 — Client onboarding submission: decision record

- **Status:** decision package produced, independently reviewed, corrected
  decisions recorded; `9e59170` independently reviewed **PASS** (no
  P0/P1/P2) by `opencode-go/deepseek-v4.1-flash`; two P3 clarity issues
  plus one orchestrator-flagged lifecycle-notation ambiguity repaired in
  the following delta — **that delta has not yet received independent
  review. Documentation only — no implementation is authorized by this
  record.**
- **Branch:** `docs/p012-onboarding-decision-closure` (from `origin/main`
  `6d4ac03dc4e917564b7c3dbcf558f58dffe44a97`).
- **Authority:** the product owner delegated the product/engineering decisions
  to the orchestrator with an instruction to apply the most professional,
  common, recommended approach. These are product/engineering decisions; they
  are **not** legal conclusions.

## 1. Review thread

1. Devin (SWE-2 High) produced the P-012 decision package: an 18-area
   inventory, an owner decision table, eight grouped plain-language approval
   questions, and a recommendation to implement a staff-only assignment slice
   (schema + assign/cancel UI) before any submission storage.
2. `opencode-go/deepseek-v4.1-flash` independently reviewed that package and
   returned **FAIL** — the recommendations contained material defects that
   would have mis-set product policy if recorded as proposed.
3. The orchestrator relayed corrected decisions; this record captures them.

## 2. Reviewer findings (as relayed) and their resolution

| #   | Finding in the original package                                                                                                                                                                                                                     | Resolution in the corrected decisions                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Assignment metadata was described as containing "zero client data" — wrong: it links client, form/version, staff actor, and lifecycle state, so it is client-associated operational metadata with authorization, export, and retention consequences | product-decisions #34: classified as operational metadata; included in future export; preserved during the relationship; post-termination handling pending retention policy            |
| P1  | Submission immutability was worded as "can never be deleted by anyone" — contradicted lawful retention/erasure/legal-hold handling                                                                                                                  | product-decisions #36: immutable during the approved retention period; no in-place edits; authorized deletion/anonymization may still occur                                            |
| P1  | Owner "review/mark" submissions was proposed on the strength of the administrator role                                                                                                                                                              | product-decisions #37: rejected — workspace administration is distinct from coaching work; owner gets read at workspace scope only                                                     |
| P1  | "No server draft" was paired with browser-local autosave via local/session storage — still client-data persistence, unreviewed                                                                                                                      | product-decisions #35: no server drafts **and** no web-storage autosave; submit-only persistence with an explicit disclosure; draft persistence is a later separately-reviewed feature |
| P2  | Cardinality was framed as one active assignment per client — did not distinguish per-form concurrency                                                                                                                                               | product-decisions #32: one ACTIVE assignment per (client, form); different forms may be concurrently active                                                                            |
| P2  | No explicit rule that assignment must pin the latest published version / that historical versions are view-only for new assignments                                                                                                                 | product-decisions #32: assign latest published only; historical versions staff-viewable, not assignable                                                                                |
| P2  | Lifecycle vocabulary was borrowed from coach assignments (ACTIVE/REMOVED) and could not express submission linkage or supersede provenance                                                                                                          | product-decisions #33: ACTIVE / SUPERSEDED / CANCELLED / COMPLETED with actor+timestamp provenance on both ends; COMPLETED reserved for the future submission transaction              |
| P2  | Consent framing implied consent records are retained as evidence indefinitely                                                                                                                                                                       | product-decisions #38: consent-record retention itself is a pending legal/product decision; nothing is asserted as retained forever                                                    |
| P2  | Security framing risked equating an authenticated client submit with a public token endpoint (or waiving abuse checks)                                                                                                                              | product-decisions #40: the two surfaces get separate security bars; the authenticated submit still requires its own review                                                             |

## 3. Approved product/engineering decisions

Recorded in `docs/product-decisions.md` as items 30–40 (P-012 closure). Summary:

- **Entry point:** intake is authenticated and post-invite only; acceptance
  creates/links account, membership, and `ClientProfile` before intake; no
  anonymous or pre-account intake; no raw-token manual-delivery workaround.
- **Assignment authority (staff-only slice):** WORKSPACE_OWNER assigns any
  client; COACH assigns only clients under an ACTIVE assignment scope;
  ASSISTANT_COACH reads assigned-scope assignments only; CLIENT has no
  assignment-record access in the staff slice; SUPPORT/PLATFORM_ADMIN denied.
  Coach form-assignment does **not** imply `ClientAssignment` creation or
  client self-assignment.
- **Cardinality/pinning:** one ACTIVE per (client, form); assign latest
  published version only; permanent pin to the immutable
  `OnboardingFormVersion`; republishing never moves assignments; no in-place
  repinning.
- **Lifecycle:** `ACTIVE` makes exactly one terminal transition — to
  `SUPERSEDED`, `CANCELLED`, or (in the future submission transaction)
  `COMPLETED`; all three are terminal states and no terminal-to-terminal
  transition is allowed. Atomic supersede on replacement;
  `assignedBy/assignedAt` + `endedBy/endedAt` provenance; stable assignment ID
  suitable as a future `OnboardingSubmission` foreign key; no hard delete or
  overwrite.
- **Data classification:** client-associated operational metadata — normal
  workspace/assignment authorization; export coverage required later;
  post-termination retention pending the wider policy.
- **Drafts:** none in the first submission release — no server drafts, no
  `localStorage`/`sessionStorage`, no autosave claims; the UI must disclose
  that answers persist only on successful submission.
- **Submissions:** immutable for the approved retention period; no in-place
  edits; corrections = append-only revision chain; coach observations live in
  separate coach notes; authorized deletion/anonymization remains possible
  under approved policy.
- **Submission authorization (direction):** CLIENT own submit/read; owner
  workspace read (no review/mark); coach assigned read+review; assistant
  assigned read only; support/platform denied; multi-assigned-coach reads
  allowed; revocation fails closed immediately.

## 4. Still pending — legal/product gates (NOT approved)

- Jurisdiction, legal basis, controller/processor responsibilities.
- Privacy-notice and health-data consent text + versions; whether consent
  gates viewing a blank form vs submitting answers; form-vs-question-level
  sensitivity classification; withdrawal effects on writes/reads/processing/
  retention; retention of `ConsentRecord` evidence itself.
- Numerical retention periods; post-termination window; erasure and
  anonymization behavior; backup expiry; legal holds; minor/age policy;
  submission export format; operational erasure implementation.
- Email provider/sender/domain (PD#19/#28) remain open; client discovery of an
  assignment is in-app only for now.

**No real onboarding answers may be stored, and no client-submission feature
may be deployed, until the consent and retention gates are approved and
implemented.**

## 5. Boundary: assignment-only slice vs blocked submission feature

|                    | Staff-only assignment slice (future)                           | Submission slice (blocked)                                                                                                                             |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stores             | IDs, status, actor, timestamps only                            | Client-authored answers (personal data)                                                                                                                |
| Client surface     | none                                                           | required (blocked)                                                                                                                                     |
| Consent required   | no                                                             | yes — pending section 4                                                                                                                                |
| Retention duration | pending policy; fail-closed                                    | pending policy; hard gate                                                                                                                              |
| Security bar       | authenticated staff mutations                                  | client-facing action needs its own reviewed bar (authorization, Origin/CSRF, size limits, idempotency, abuse protection, atomicity, audit, validation) |
| Deployable         | not while retention/erasure unresolved (product-decisions #34) | no                                                                                                                                                     |

## 6. Confirmation

No implementation occurred: no schema, code, tests, RBAC, migration, route,
or workflow changes. This record plus the decision/blueprint/STATUS edits are
the entire delta.
