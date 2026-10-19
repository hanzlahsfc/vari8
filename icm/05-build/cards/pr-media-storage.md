# PR-MEDIA build: Media storage, upload and the real recorder

Card slug `pr-media-storage`. Board `vari8`. Track Wiring. Depends on PR-M0, PR-05. Builder: Devin swe-2-max driven by yamato. Issue created in driver step 2.
Repo `hanzlahsfc/The-great-tracker-`. Worktree `/home/nexuslink/vari8-worktrees/pr-media-storage`, branch `beta/pr-media-storage` off the latest `origin/Vari8-Beta`. The pipeline rules in `icm/05-build/cards/PIPELINE-FOOTER.md` are binding: push early and often, PR against `Vari8-Beta`, never merge your own PR, never touch `docs/STATUS.md`, no em dashes. Lane database `app_prmedia` on 127.0.0.1:5433 user `app`; dev port 3776. May touch `db/`: no; the local check fails if `db/` changes.

## Driver steps (yamato only; Devin skips this section)

1. `cd /home/nexuslink/vari8-worktrees/pr-media-storage && git fetch origin && git merge --ff-only origin/Vari8-Beta`. Stop and block the card if it is not a fast-forward.
2. Issue first (idempotent): `gh issue list -R hanzlahsfc/The-great-tracker- --label vari8-beta --search "[PR-MEDIA] in:title" --state all` ; if none, `gh issue create -R hanzlahsfc/The-great-tracker- --label vari8-beta --title "[PR-MEDIA] Media storage, upload and the real recorder" --body-file icm/05-build/cards/pr-media-storage.md`. Record the number on the card (`hermes kanban comment`).
3. Push the branch and open a draft PR at once: `git push -u origin HEAD` and `gh pr create -R hanzlahsfc/The-great-tracker- --draft --base Vari8-Beta --head beta/pr-media-storage --title "[PR-MEDIA] Media storage, upload and the real recorder" --body "Closes #<issue>. Card pr-media-storage. Plan section PR-MEDIA in icm/03-plan/output/PLAN.md."`.
4. Launch Devin and block until it exits: `cd /home/nexuslink/vari8-worktrees/pr-media-storage && icm/05-build/tools/devin-slot.sh -- env CAP=10G /home/nexuslink/.local/bin/jobcap devin -p --model swe-2-max --permission-mode dangerous --prompt-file icm/05-build/cards/pr-media-storage.md > /home/nexuslink/vari8-worktrees/pr-media-storage.devin.log 2>&1`
5. Run the local gate: `BASE_SHA=$(git merge-base HEAD origin/Vari8-Beta) LANE_DB=app_prmedia LANE_PORT=3776 CARD=PR-MEDIA icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/pr-media-storage.check.log 2>&1; echo EXIT=$?`. Paste the summary block into the PR (`gh pr comment`).
6. Push, mark the PR ready (`gh pr ready`), attach `pr-media-storage.devin.log` and `pr-media-storage.check.log` to the card (`hermes kanban attach`), and complete the card with the PR URL, head SHA and gate exit code. If the gate failed, give Devin one repair round with the failing output; if it still fails, block the card with the failing step.

## Gear (Devin loads this first)

Load `/home/nexuslink/.hermes/profiles/kakashi/SOUL.md` as your working persona (drop the persona voice in files you write) and read these skills:

- `/home/nexuslink/.hermes/profiles/kakashi/skills/systematic-debugging/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/codebase-design/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/domain-modeling/SKILL.md`
- `/home/nexuslink/.hermes/profiles/kakashi/skills/verification-before-completion/SKILL.md`

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-MEDIA` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S02-08: S02 CONFLICT: Attachment affordance: "Choose photo, video or file" picker, 20 MB client-side cap, preview strip with remove, file input
- S02-24: S02 CONFLICT: MediaCard: type icon, name, size/"Local demo media" label, remove; image preview link, audio/video players, download link; "Media kept as me
- S02-25: S02 CONFLICT: DemoRecorder: record → preview → discard/attach for "voice" (synthesized wav) and "video" (canvas-capture webm); used for voice notes here a
- V1-X2: S02 MISSING: Load demo audio preview button
- V3-L1-Media: S02 MISSING: Media type has no backend model

## Files

- `lib/storage.ts`
- `lib/storage/local.ts`
- `lib/storage/s3.ts`
- `app/api/v1/media/**`
- `components/canvas/coach/media-card.tsx`
- `components/canvas/coach/demo-recorder.tsx`
- .env.example (storage lines)
- `scripts/seed/40-media.seed.ts`

## Build

- `lib/storage.ts` port with a local-disk adapter (development) and an S3-compatible adapter (environment-configured). Vendor stays open (D8).
- Signed upload and download for images, documents, audio and video (D20), 20 MB cap as the canvas shows, type allowlist, workspace-scoped keys.
- The recorder dialog keeps its exact UI and records from `MediaRecorder` instead of the synthesized demo source.

## Acceptance (you see)

- Staff and the client upload and play back a voice note and an image; another workspace's media URL fails closed.

## Verification you run before handing over

- `icm/05-build/tools/verify-local.sh` with `BASE_SHA` = merge base with `origin/Vari8-Beta`, exit 0 (format, typecheck, lint, unit, integration when `db/`, `lib/` or `app/api/` changed, build, schema guard, e2e flow specs, parity regression once PR-P1 and PR-01 are on the branch).
- Live: start the app on port 3776 against `app_prmedia` (`npm run db:fresh` once PR-04 has landed, RUNBOOK otherwise), drive the acceptance flow in a real browser at 1440 and 390, save screenshots under `/home/nexuslink/vari8-worktrees/_evidence/PR-MEDIA/build/`.
- Parity (D32) on: `s02-thread-attachments.png`.
- Unit (D11, D14): Trust-boundary guards: type allowlist, size cap, key scoping, expired signed URL rejected.

## Report

Write `icm/05-build/reports/PR-MEDIA.md` in the branch: head SHA, changed paths, every command with its exit code, screenshots (paths), parity result per screen and width, matrix rows closed, what you could not do. Commit in small commits with explicit pathspecs. Tests follow the keep rule: a new test calls the code the way users do, asserts a literal, fails when the code breaks, and guards something a browser cannot see (D14).
