# MAIL-ADAPTER report

Card `icm/05-build/cards/mail-adapter.md`, issue #155, PR #156. Owner ruling O22 (Marcel 2026-10-22):
transactional email is approved for the beta (password reset links and invitation emails), reversing O19.
No admin reset tool, no new npm dependency.

## What changed

| File                                      | Change                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/mail/index.ts`                       | new `emaillabs` adapter in the existing registry: `POST` form-encoded to the vendor's transactional endpoint with HTTP Basic `app_key:secret_key`, plain text plus simple HTML generated from the text, 10 s timeout, provider status only on failure. New `assertMailDeliveryConfigured()` boot gate. Env name constants exported. |
| `lib/mail/invitation.ts`                  | **Removed in the P707 Beta reconciliation.** Current Beta already delivers invitations inline through `createInvitationFromApi` (`/invite?workspace=...&token=...` link, 502 `delivery_failed`, rate limits, authorization); the helper was a dead duplicate caller.                                                                |
| `instrumentation.ts`                      | boots the mail gate next to the auth-secret gate, same production-only refusal and the same `process.exit(1)` path.                                                                                                                                                                                                                 |
| `.env.example`                            | names only for `MAIL_DELIVERY_ADAPTER=emaillabs`, `EMAILLABS_APP_KEY`, `EMAILLABS_SECRET_KEY`, `EMAILLABS_SMTP_ACCOUNT`, `MAIL_FROM`, `EMAILLABS_API_URL`. No values.                                                                                                                                                               |
| `tests/unit/mail-emaillabs.test.ts` (new) | ten tests: provider form payload/basic auth/no request-injected tracking, no secrets in logs, boot refuse + boot allow, provider timeout propagation, non-2xx status-only rejection, current invitation boundary (`/invite` link + `delivery_failed` mapping), reset mail construction (`/reset` and `/me/reset`).                  |

`dev-file` is untouched and stays the default outside production. `sendMail`'s signature and the
`MailAdapter` port are unchanged, so the one existing call site (the reset flow at
`lib/auth/server.ts:200`) needed no edit.

## The provider contract, and why it is the legacy endpoint

The card says "the EmailLabs HTTP API" without pinning a path, and the vendor has two surfaces:

- the documented transactional endpoint `https://api.emaillabs.net.pl/api/new_sendmail`, form-encoded,
  HTTP Basic with the app key and secret key pair, fields `to[email]`, `smtp_account`, `from`,
  `subject`, `text`, `html` (emaillabs.io product page, with code samples in PHP, C#, Python and Node);
- a newer JSONAPI surface (`docs.emaillabs.io`) authenticating with `Application-Key` plus a
  128-character `Authorization` header, whose send path is only inside a Swagger file.

The card names `EMAILLABS_APP_KEY` and `EMAILLABS_SECRET_KEY`, which is the app-key plus secret-key
pair of the first surface, and that page is the one that publishes a complete request shape. The
adapter implements it and reads `EMAILLABS_API_URL` as an override, so moving to the JSONAPI surface
later is a URL plus a header change in one function, not a rewrite.

Two env names beyond the card's three were required by that contract and are added:

- `EMAILLABS_SMTP_ACCOUNT` is a required request field on the documented endpoint (the sending
  account, for example `1.panel.smtp`). Without it the provider rejects every message, so a
  production boot with `emaillabs` selected and no account configured would fail per message instead
  of at boot.
- `EMAILLABS_API_URL` exists so a sandbox, or a move to the JSONAPI host, needs no code change.

Both are names only in `.env.example`. A verifier that disagrees with either should reject this PR on
the contract, not treat them as undocumented additions.

## Historical gate results (pre-merge head `4af4e492`, Node v26.12.1 — superseded)

The table below is the PR's original evidence against the old base. It is
kept for provenance only — it is NOT evidence for the current head. The
authoritative results are in "P707 fix-forward verification" below.

| Gate        | Command                                                                    | Exit                                                    |
| ----------- | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| install     | `npm ci` (root) and `npm ci` (frontend)                                    | 0, 0                                                    |
| format      | `npx prettier --check .`                                                   | 0                                                       |
| typecheck   | `npm run typecheck`                                                        | 0                                                       |
| lint        | `npm run lint`                                                             | 0 errors, 81 pre-existing warnings                      |
| index       | `npm run index`                                                            | 0 (rewrote `docs/index/SYMBOLS.md` for the new exports) |
| index check | `npm run index:check`                                                      | 0                                                       |
| unit        | `npm run test`                                                             | 0                                                       |
| integration | `npm run test:integration` on `app_mail_it`                                | 0                                                       |
| targeted    | `npx vitest run tests/unit/mail-emaillabs.test.ts tests/unit/mail.test.ts` | 0, 9 passed                                             |

`verify-local.sh` does not run on this Mac at all: `icm/05-build/program-config.json:7` hardcodes the
Linux root checkout, lines 100 to 102 drive `docker exec vari8-db-1`, and `POSTGRES_PASSWORD` in
`.env` resolves empty. Gates were run as the individual commands the script wraps. The database
credentials problem was worked around with a lane-local login role `mail_lane` owning `app_mail` and
`app_mail_it`, password in `Vari8-evidence/scratch/mail-adapter/lanepw` (mode 600, never printed,
never committed); the shared `app` role has an empty password, which Prisma refuses with P1000. That
repair belongs to the SEC-DBROLE card.

## Bites (each guard removed, test watched fail, guard restored)

| Guard removed                                                     | Test that failed                                                                          | Result                        |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- |
| the `authorization: Basic ...` header                             | `posts the form the provider documents, with basic auth and no request-injected tracking` | failed, then green on restore |
| the boot refusal throw in `assertMailDeliveryConfigured`          | `refuses to boot in production when a named key is missing`                               | failed, then green on restore |
| the status-only error path, replaced by `console.error(to, text)` | `never puts a message, token or key into a log line`                                      | failed, then green on restore |

## What this card does not do

1. **The `lib/mail/invitation.ts` helper is removed (P707).** Current
   Vari8-Beta already delivers invitations inline through
   `createInvitationFromApi`: rate limit -> authorized
   `createWorkspaceInvitation` -> normalized `created.delivery`
   recipient/workspace/token -> `/invite?workspace=...&token=...` link ->
   `sendMail`, with `502 delivery_failed` on send failure and replacement
   as the recovery path. The PR-era helper was a dead duplicate and was
   dropped in the reconciliation rather than wired as a second caller.
   The served invitation path and its authorization are unchanged.
2. **No real send was performed.** There are no provider keys on this machine and the card forbids
   committing any. Delivery is proved against a mocked `fetch` that asserts the exact wire request,
   which is what the card's acceptance asks for.
3. **`/me` versus `/invite`.** O17's intent is that a client invitation opens on the client look.
   `app/invite/page.tsx` already resolves the look from the token's intended role through
   `getInviteShellRole` and renders `ClientAuthShell` for clients, so the link stays `/invite` with
   `workspace` and `token`, the only path that accepts those parameters today. A `/me` link would 404.

## P707 fix-forward (merge of Vari8-Beta, builder)

- `instrumentation.ts`: the mail gate now boots beside the current auth
  secret + media storage checks, refusing through the redacted
  `logError("boot_refused")` + `process.exit(1)` path (the PR's older
  `console.error` version and the dropped media check were superseded).
- Invitation routing, authorization, normalized delivery and the
  `delivery_failed` mapping are current Beta's — no second caller added.
- Deferred (proposed, not approved): production `dev-file` rejection and
  a mandatory canonical mail-link origin stay separate policy work.

## P707 fix-forward verification (head `bcc10a44`)

Builder results, fresh `npm ci` in an isolated worktree, Node **v24.22.1**:

| Gate      | Command                                                                                                                                              | Result                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| focused   | `npx vitest run tests/unit/mail-emaillabs.test.ts tests/unit/mail.test.ts tests/unit/password-reset-delivery.test.ts tests/unit/boot-checks.test.ts` | 4 files / **47 tests, exit 0**                        |
| full unit | `npm test` (+ `npm ci` in `tools/parity/reference`)                                                                                                  | **150 files / 1797 tests, exit 0**                    |
| build     | `npm run build`                                                                                                                                      | **exit 0**                                            |
| static    | `npm run typecheck` / `npm run lint` / `npm run format:check` / `npm run index:check` / `git diff --check`                                           | 0 / 0 errors (136 pre-existing warnings) / 0 / OK / 0 |

Builder results, Node **v22.21.1** (repo CI `node-version: 22`, isolated
exact-head checkout `a0817977`, `npm ci` + nested `tools/parity/reference`,
postgres :5433 with task-owned `DATABASE_URL`/`INTEGRATION_DATABASE_URL`,
mocked mail transport — no provider calls):

| Gate        | Command                                               | Result                                                                                                                                                      |
| ----------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prisma      | `npx prisma generate` / `validate` / `migrate deploy` | 0 / 0 / 0                                                                                                                                                   |
| format      | `npm run format:check`                                | 0                                                                                                                                                           |
| typecheck   | `npm run typecheck`                                   | 0                                                                                                                                                           |
| lint        | `npm run lint`                                        | 0 errors, 138 warnings                                                                                                                                      |
| full unit   | `npm test`                                            | **150 files / 1797 tests, exit 0**                                                                                                                          |
| integration | `npm run test:integration`                            | 1 failed / 1132 passed — `checkin-recurrence-i1` London-DST seasonal assertion; identical under Node 24.22.1 — pre-existing environmental, not this diff    |
| build       | `npm run build`                                       | **exit 0**                                                                                                                                                  |
| playwright  | `npx playwright install chromium`                     | 0                                                                                                                                                           |
| e2e         | `npm run test:e2e`                                    | 12 passed / 8 skipped / **4 failed** — `auth-card` + `me-auth-look` color/`data-mode` assertions, identical under Node 24.22.1 — pre-existing environmental |

Independent review results (opencode / deepseek-v4.1-flash, comment
`6586332599`), fresh under Node **v24.22.1**:

| Gate                                                            | Result                             |
| --------------------------------------------------------------- | ---------------------------------- |
| targeted (mail-emaillabs + mail + password-reset boundary/unit) | 4 files / **37 tests passed**      |
| full `npm test` with nested parity deps                         | **150 files / 1797 tests, exit 0** |
| fresh `rm -rf .next && npm run build`                           | **exit 0**                         |
| `tsc --noEmit` / `prettier --check .`                           | 0 / 0                              |

The reviewer's independent Node-22 run was not performed; the builder
checks above are the only Node-22 evidence on record. The same four visual
specs and the seasonal integration test also fail on the merged Beta alone
— the mail-adapter diff is not implicated.

## Request vs provider tracking

The adapter's request body is inspected: `simpleHtml` adds no tracking
pixel, no click rewriting and no remote asset — that is the extent of the
code guarantee. Whether EmailLabs injects open/click tracking is
account/provider configuration that no request inspection can prove; it
remains a deployment prerequisite (below), not a verified property.

## Remaining operational prerequisites

- Authorized EmailLabs credentials: App Key, Secret Key, SMTP account
  (`EMAILLABS_SMTP_ACCOUNT`), authorized `MAIL_FROM` sender domain
  (SPF/DKIM/DMARC as the provider requires).
- `MAIL_DELIVERY_ADAPTER=emaillabs` and a canonical HTTPS
  `BETTER_AUTH_URL`/`AUTH_URL` for real mail links.
- Written confirmation that account-level open/click tracking is disabled
  on the EmailLabs account, if the owner wants no tracking.
- An authorized sandbox send proving real delivery before integration
  relies on it. No real mail was sent; no production credentials exist in
  the branch.
