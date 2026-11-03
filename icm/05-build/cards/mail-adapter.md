# MAIL-ADAPTER: real delivery for password reset and invitation emails

Owner ruling O22 (Marcel, 2026-10-22). Transactional email sending is APPROVED for the beta: password reset
links and invitation emails. This reverses O19 (which had parked mail delivery and routed password recovery
through an admin). Do not build an admin reset tool. Provider pick revised (P749, owner via Aleksey):
EmailLabs is REJECTED — deliver through a standard SMTP relay the deployment supplies; no paid service.

Repo `hanzlahsfc/The-great-tracker-`. Branch `beta/mail-adapter` off the latest `origin/Vari8-Beta`.
Worktree `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/mail-adapter`.
Pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding. Lane database `app_mail` on
127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first). Dev port 3945. May touch `db/`: no.

## Change (one PR, explicit pathspecs, never `git add -A`)

1. Add one production adapter to the adapters map in `lib/mail/index.ts` named `smtp`. It submits through a
   standard SMTP relay (net/tls builtins, EHLO/STARTTLS/AUTH LOGIN/MAIL/RCPT/DATA). No new npm dependency.
2. Env: `MAIL_DELIVERY_ADAPTER=smtp`, `SMTP_HOST`, `MAIL_FROM` (required), `SMTP_PORT`, `SMTP_TLS`
   (require|implicit|none), `SMTP_USER` + `SMTP_PASSWORD` (pair). Add the NAMES only to `.env.example`,
   never a value.
3. Boot check in `instrumentation.ts`: in production, when the adapter is `smtp` and a required name is
   missing or malformed, refuse boot. Same pattern the auth secret check already uses.
4. Send plain text plus simple HTML. No tracking pixels, no click tracking, no third-party scripts.
5. Errors: never log the message body, the recipient link, a token, or a credential. Fail closed without
   throwing a secret into the stack — SMTP replies carry a status code only.
6. Keep the client invitation email on the existing boundary (`createInvitationFromApi`, `/invite` link,
   `delivery_failed` mapping) and the reset link paths (`/reset` staff, `/me/reset` client).
7. Remove nothing the `dev-file` adapter needs. `dev-file` stays the default outside production.

## Acceptance (each test must fail when the protection it guards is removed; bite each one and report)

- Unit test against a task-owned local SMTP capture server asserting the wire transcript: EHLO,
  MAIL FROM, RCPT TO, DATA (from address, subject, base64 text and html parts), QUIT; AUTH LOGIN when
  both credentials are set.
- Unit test proving no message body, token or credential reaches errors or the wire transcript on
  failure; a half auth pair and a missing host are named configuration faults; CRLF injection is refused
  before the wire.
- Boot-refusal test: production plus `smtp` plus a missing required name refuses to start; a relay
  without STARTTLS fails closed under the default `SMTP_TLS=require`.
- Invitation email renders a `/me` link.
- Gates: `npx prettier --check .`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run index` then
  `npm run index:check` = 0. Report every exit code.

Report at `icm/05-build/reports/MAIL-ADAPTER.md`.

READY line goes in `$HOME/NEXUS_AI_CENTER/04_PROJECTS/Vari8-evidence/READY.log`:
`READY mail-adapter PR#<n> <head-sha>`. Do not merge your own PR. An independent verifier decides SHIP or FIX.
