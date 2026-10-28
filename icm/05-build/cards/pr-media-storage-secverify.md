# PR-MEDIA security verify: Media storage, upload and the real recorder

Card slug `pr-media-storage-secverify`. Independent verifier (claude-haiku-5-5) on a different model than the builder (swe-2-max). You never edit product code and never push. Worktree `/home/nexuslink/vari8-worktrees/pr-media-storage-secverify` (local branch `beta/pr-media-storage-secverify`, never pushed). Evidence goes outside git to `/home/nexuslink/vari8-worktrees/_evidence/PR-MEDIA/` and into the PR as a comment.

## Steps

1. Find the PR: `gh pr list -R hanzlahsfc/vari8 --head beta/pr-media-storage --state open --json number,headRefOid`. Then `cd /home/nexuslink/vari8-worktrees/pr-media-storage-secverify && git fetch origin && git checkout --detach origin/beta/pr-media-storage`; record the head SHA. Test-merge the current trunk the way GitHub will: `git merge --no-ff --no-edit origin/Vari8-Beta`. On a conflict: `git merge --abort`, comment `FIX: conflict with Vari8-Beta in <paths>` on the PR, block this card, stop.
2. Export `POSTGRES_PASSWORD` (RUNBOOK 'Local check'), then `mkdir -p /home/nexuslink/vari8-worktrees/_evidence/PR-MEDIA && BASE_SHA=$(git rev-parse origin/Vari8-Beta) LANE_DB=app_verify_prmedia LANE_PORT=3777 CARD=PR-MEDIA icm/05-build/tools/verify-local.sh > /home/nexuslink/vari8-worktrees/_evidence/PR-MEDIA/verify-local.log 2>&1; echo EXIT=$?`.
3. Live receipt at that head: start the app on port 3777 with a fresh `app_verify_prmedia` (`npm run db:fresh`, or RUNBOOK 'Dev user before PR-04' while `db:fresh` does not exist yet), drive every acceptance item below in a real browser at 1440x900 and 390x844, as each of: owner, coach, client of the same workspace, staff of a foreign workspace, signed out. Unauthorized direct requests to the PR's routes must fail closed. Save screenshots as `/home/nexuslink/vari8-worktrees/_evidence/PR-MEDIA/<role>-<width>.png`.
4. Parity (D32) on `s02-thread-attachments.png`: run the harness against your server; keep the report and diff images in `/home/nexuslink/vari8-worktrees/_evidence/PR-MEDIA/parity/`.
5. Check every matrix row listed below is visibly closed (or, for model and service rows, exercised by the wiring flow or a keep-category test). List each row with PASS or FAIL.
6. Verdict: `gh pr comment <n> -R hanzlahsfc/vari8 --body-file /home/nexuslink/vari8-worktrees/_evidence/PR-MEDIA/verdict.md`, where the first line is `SHIP PR-MEDIA <head sha>` or `FIX PR-MEDIA <head sha>`, followed by the gate summary, the live receipt table, the parity table and the matrix-row list. Attach the evidence folder listing to this card. Complete the card on SHIP; block it with the findings on FIX (the builder repairs, pushes, and this card runs again on the new head).
7. Stop your servers, drop `app_verify_prmedia`, leave the worktree clean.

## Acceptance to check

- Staff and the client upload and play back a voice note and an image; another workspace's media URL fails closed.

## Read first

`AGENTS.md`, `icm/03-plan/DECISIONS.md` (D11, D13, D14, D15 to D36), the `PR-MEDIA` section of `icm/03-plan/output/PLAN.md`, `icm/05-build/RUNBOOK.md`.

## Matrix rows this PR closes

- S02-08: S02 CONFLICT: Attachment affordance: "Choose photo, video or file" picker, 20 MB client-side cap, preview strip with remove, file input
- S02-24: S02 CONFLICT: MediaCard: type icon, name, size/"Local demo media" label, remove; image preview link, audio/video players, download link; "Media kept as me
- S02-25: S02 CONFLICT: DemoRecorder: record → preview → discard/attach for "voice" (synthesized wav) and "video" (canvas-capture webm); used for voice notes here a
- V1-X2: S02 MISSING: Load demo audio preview button
- V3-L1-Media: S02 MISSING: Media type has no backend model

## Security focus

Run the security diff scan on the PR diff: authorization on every new route (D15 table), trust-boundary validation, token and upload handling, secrets in code or logs, audit metadata free of bodies. Findings rated by severity with file and line.
