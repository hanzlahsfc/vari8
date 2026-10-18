# Card: plan-to-issues generator

Write `/home/nexuslink/NEXUS_AI_CENTER/04_PROJECTS/Vari8/icm/03-plan/tools/plan-to-issues.mjs`, a single-file Node script (stdlib only, Node 22+, no npm installs). Read `icm/03-plan/DECISIONS.md` section D9 first; it is the contract.

## Input

`icm/03-plan/output/PLAN.md`:

- Build sections: headings `## <title> (<ID>)` where ID matches `PR-[A-Z0-9]+` (examples: `PR-01`, `PR-M1`, `PR-SV4`, `PR-W10`, `PR-MSG`, `PR-31`). The section body runs to the next `## ` heading. It contains a line `**Depends on.** <ids or None>.`
- Decision sections: under `## Owner decisions needed`, one entry per question, id `Q<n>` (also `AUTH` for the auth-library decision if present). The current file crams two questions into some bullets; the parser must split on the `Q<n>.` markers, not on bullets. Each decision text names the PR ids it blocks ("This blocks PR-04 and ...").

## Output

Default mode is DRY RUN: print a JSON array to stdout, one object per issue: `{ key, kind: "build"|"decision", title, labels: [...], milestone, blockedBy: [keys], body }`.

- Title: build issues `[<ID>] <title>`, decision issues `[DECISION <Qn>] <first sentence or short title>`.
- Labels: decision issues `decision`; build issues by id prefix: `PR-01..PR-05` `foundation`, `PR-M*` `model`, `PR-SV*` `service`, `PR-W*`, `PR-MSG`, `PR-MEDIA` `wiring`, `PR-31` `mobile`.
- Milestone: the label name capitalised (`Foundation`, `Model`, ...), decisions get `Decisions`.
- blockedBy: the section's `Depends on` ids plus every decision whose text says it blocks this id.
- Body: first line the hidden marker `<!-- vari8:<key> -->`, then the full section text verbatim, then a `### Blocked by` list (filled with `#n` in apply mode, keys in dry run), then a footer `Source: icm/03-plan/output/PLAN.md (TRACKER branch)`.

`--apply` mode (DO NOT RUN IT, only implement it): uses `gh` via `child_process.execFileSync` against repo `hanzlahsfc/The-great-tracker-`. Creates missing labels and milestones; finds an existing issue by searching for its marker (`gh issue list --search "vari8:<key> in:body" --state all --json number,body`); edits it if found, creates it if not; creates decisions first, then build issues in plan order, then a second pass that rewrites each body's `### Blocked by` with real `#n` numbers. Prints a key-to-number table at the end. Idempotent: a second run changes nothing new.

## Check

Leave one check behind: `icm/03-plan/tools/plan-to-issues.check.mjs` that runs the parser on the real PLAN.md and asserts: build issue count equals the number of `## ... (PR-...)` headings (expect 31), decision count equals the number of distinct `Q<n>.` markers (expect 15), every blockedBy key exists, no cycles, every body starts with its marker. Run it and paste the output. Run the dry run and save it to `icm/03-plan/output/issues.dry-run.json`.

## Rules

Write only the three files named above. Never run `--apply`, never call `gh issue create/edit` or `gh label create`. Self-check (mandatory): list as PASS or FAIL with evidence: check script output, dry-run issue counts by label, one full sample body (PR-01), confirmation that `--apply` was not run (`gh issue list -R hanzlahsfc/The-great-tracker- --state all --limit 5` still shows only issue #3).
