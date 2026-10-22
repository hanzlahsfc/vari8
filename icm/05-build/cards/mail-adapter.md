# MAIL-ADAPTER: real delivery for password reset and invitation emails

Owner ruling O22 (Marcel, 2026-10-22). Transactional email sending is APPROVED for the beta: password reset
links and invitation emails. This reverses O19 (which had parked mail delivery and routed password recovery
through an admin). Do not build an admin reset tool. Provider pick already made: EmailLabs.

Repo `hanzlahsfc/The-great-tracker-`. Branch `beta/mail-adapter` off the latest `origin/Vari8-Beta`.
Worktree `/Users/marcelspatz/NEXUS_AI_CENTER/04_PROJECTS/Vari8/.worktrees/mail-adapter`.
Pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding. Lane database `app_mail` on
127.0.0.1:5433 user `app` (export `POSTGRES_PASSWORD` first). Dev port 3945. May touch `db/`: no.

## Change (one PR, explicit pathspecs, never `git add -A`)

1. Add one production adapter to the adapters map in `lib/mail/index.ts` (the map is at line 24) named
   `emaillabs`. It POSTs to the EmailLabs HTTP API with `fetch`. No new npm dependency.
2. Env: `MAIL_DELIVERY_ADAPTER=emaillabs`, `EMAILLABS_APP_KEY`, `EMAILLABS_SECRET_KEY` (both secrets),
   `MAIL_FROM`. Add the NAMES only to `.env.example`, never a value.
3. Boot check in `instrumentation.ts`: in production, when the adapter is `emaillabs` and a required key is
   missing, refuse boot. Same pattern the auth secret check already uses.
4. Send plain text plus simple HTML. No tracking pixels, no click tracking, no third-party scripts.
5. Errors: never log the message body, the recipient link, a token, or a key. Log the provider status code
   only. Fail closed without throwing a secret into the stack.
6. Add the client invitation email. Today `sendMail` has one call site, the reset flow at
   `lib/auth/server.ts:200`. Invitations link to `/me` per owner ruling O17.
7. Remove nothing the `dev-file` adapter needs. `dev-file` stays the default outside production.

## Acceptance (each test must fail when the protection it guards is removed; bite each one and report)

- Unit test with a mocked `fetch` asserting the exact request shape: URL, method, headers, JSON body, from
  address, text and html parts.
- Unit test proving no message body, token or key reaches the captured logs on success and on provider error.
- Boot-refusal test: production plus `emaillabs` plus a missing key refuses to start.
- Invitation email renders a `/me` link.
- Gates: `npx prettier --check .`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run index` then
  `npm run index:check` = 0. Report every exit code.

Report at `icm/05-build/reports/MAIL-ADAPTER.md`.

READY line goes in `$HOME/NEXUS_AI_CENTER/04_PROJECTS/Vari8-evidence/READY.log`:
`READY mail-adapter PR#<n> <head-sha>`. Do not merge your own PR. An independent verifier decides SHIP or FIX.
