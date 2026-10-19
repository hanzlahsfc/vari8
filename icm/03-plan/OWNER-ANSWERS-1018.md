# Owner answers, 2026-10-18 evening (Marcel, with Lilly). Binding.

Verbatim answers to the 20 briefing questions, then the orchestrator's interpretation. Interpretations are defaults Marcel can reverse; the verbatim text wins on conflict.

| # | Question | Answer (verbatim) | Interpretation for the build |
|---|---|---|---|
| 1 | Approve PLAN | approved | Plan approved incl. issues and one PR per issue (D9), adjusted by the rules below. |
| 2 | Approve TEST-AUDIT incl. auth.spec cut | approved | Execute TEST-AUDIT.md: GUARD stays, VISIBLE/CUT deleted, CUT-AT-REPLACE deleted in the replacing PR, 41 old e2e specs deleted. |
| 3 | ROLES | The coach can edit a client's training plan, but the client can't. That's all | Coach edits client plans; client reads own plans only. No further role rules invented: owner and coach are both workspace staff (see 6), client is self-scoped. Assistant coach and support roles are not built unless the canvas shows them. Server-enforced, one table-driven role test. |
| 4 | Sign-in library | Pick better auth if it is better than our own tokens, and if the benefits are present | Evaluate Better Auth vs Auth.js v5 + own tokens with evidence (mobile bearer tokens for Capacitor, sessions revocation, org/workspace plugin, 2FA, admin impersonation, rate limits, Prisma adapter, Next 16 support). Pick Better Auth if it covers these with less code; record the decision and evidence. |
| 5 | First coach account | b | Coach self-signup (amends decision #13). Clients still join by coach invite. |
| 6 | Role name | A | Show the real role: owner and coach are separate. |
| 7 | Consent gates | A, park consent gates, we dont need that stuff now and no it does not block messages and media | Consent and health-data gates disabled behind a flag, listed in a Parked appendix. Appendix C's photo-consent blocker is void. |
| 8 | Messaging and media | Text, audio (planned to have inbuilt transcription for voice messages in chat + export transcript as text/md file), documents and images | Build messaging with text, audio voice messages, documents and images, with storage behind lib/storage.ts (D8). Voice transcription and transcript export are planned: tracked as a follow-up issue, interface not scaffolded. |
| 9 | Ethereal studio | what is that, that is not just a dev route we take over everything in the frontend as is | Take over every canvas screen including the Ethereal studio as product routes. |
| 10 | Workspace calendar | a | Workspace-wide scoped reads with attention rules. |
| 11 | Template library | b | Ship an empty library. |
| 12 | Undo | both | Confirmation dialog AND timed restore. Only where the canvas shows undo; no new visible UI beyond what the canvas has. |
| 13 | Appearance settings | per workspace | Saved on the server, per workspace. |
| 14 | Private coach tasks | a | Separate private, audited coach-task entity. |
| 15 | Client archive | archiving should archive, when a membership ends the client should be archived for some time with the option to delete | Archive is a soft archive. Membership end archives the client; after a retention period the coach may delete. Retention length: default 90 days, configurable per workspace. |
| 16 | Time and duration fields | a | Define a display format and keep the fields. |
| 17 | Nutrition totals | elaborate that question makes no sense | See "Elaborated" below. Default: canvas wins. |
| 18 | Training volume | elaborate | See "Elaborated" below. Default: canvas wins. |
| 19 | Check-in generation | a | Explicit generation only. |
| 20 | Dashboard layout | dashboard layout is fully customisable, we are still planning exactly how the customisability together with the widgets will function since we are going to be making different themes too | Wire exactly what the canvas dashboard builder does today, persist layouts server-side; no new widget system invented. Themes are future work. |

## Overriding rules (Marcel, same message)

- Take over the frontend EXACTLY as is. Nothing visually different. A clean face application onto Hanzlah's backend, then full backend wiring of both. Visual parity is an acceptance gate: canvas screenshots before vs after per screen.
- Optimise and reduce the codebase: take the best of both contributors, remove over-engineering. Deletion over addition.
- Use poteto-mode and sureforge with Marcel's PR/issue pipelines.
- Respect the subscription routing: Claude (generous) for leads and reviews, Devin swe-2 (free, promo extended) for builds, ds4f for bulk, Codex/sol only for final judging.
- Subagents carry bot profiles as gear (SOUL + skills), models chosen by routing.
- Everything documented and tracked: ICM blackboard, shared task board, coverage ledger. 100% completion, no partial work.
- Deadline 05:00 2026-10-19 Europe/Vienna. End state: branch `Vari8-Beta`, app functional as the first beta, polished README and setup with infographics, full system index for agentic navigation.

## Elaborated for 17 and 18 (to send Marcel)

17. The canvas meal-plan screens show calorie and macro totals per meal and per day. The old rulebook said the app must never calculate nutrition numbers itself, only show what someone typed. Question was: may the app add up food values to produce those totals. Since the canvas shows totals and the canvas wins, default = yes, compute totals from food values exactly as the canvas displays them.
18. The canvas training screens show a volume panel (sets x reps x weight). Same old rule forbade computed training numbers. Default = compute volume exactly as the canvas shows it.
