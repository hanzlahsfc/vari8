VERDICT: PASS WITH FINDINGS

Checked 52 claim entries: 36 CONFIRMED, 8 WRONG, 8 UNVERIFIABLE. This is a final verdict on R1, R2 and R3 as research, not an implementation or release approval. All 31 RV-B rows were rechecked, including every WRONG or UNVERIFIABLE row. Ten further claims were selected with a recorded random seed and checked independently.

## Decision-bearing claims checked first

1. D5 Node 24 LTS, M01.
2. D5 Next16 and React19.3 canvas versions, M03.
3. D5 Tailwind4.3 and Base UI existing dependencies, M03.
4. D5 Prisma stays major6, M03.
5. D5 Auth.js beta32 peer support for Next16/React19, M02.
6. D6 Auth.js native-client limitation, J01 and M05-M06.
7. D6 static export drops cookies and Server Actions, J02.
8. D6 an existing alternative has bearer support, J03.
9. D6 Capacitor8 current stable line, J04.
10. D6 production server.url limitation and native HTTP escape route, J12-J13.
11. D6 Apple 4.2 standard versus predicted approval, J14-J15.
12. D6 reuse-first shell and interim PWA recommendation, J21.
13. D6 required API/auth work, current sole API route and scope difference, J20-J21 and J25.
14. D7 TS7 GA publication and exact installed compiler identity, J05.
15. D7 successful TS7 checks and measured speed, J06-J07.
16. D7 Biome speed versus ESLint and non-equivalent diagnostics, J08.
17. D7 Biome rule availability and migration caveats, J10-J11 and M10.
18. D7 Next support for TS7, default Turbopack and npm retention, J22.
19. D7 Bend description and reason not to introduce it, J09.
20. D7/D8 no 3D requirement, J16.
21. D8 existing SVG chart, J17.
22. D8 current manual validation and Zod recommendation, J18, J20 and J24.
23. D8 existing storage port and unset vendor, J19 and M09.
24. D8 web useActionState/Base UI pattern, J23 and J27.
25. D8 offline/cache deferral and consent constraints, J30.
26. D8 platform date formatting and no direct date library, M11.

## Evidence table

Paths in the first column refer to `icm/03-plan/output/` unless a different path is named. RV-B references refer to `icm/05-verify/output/RV-B.md`. All source code checks used `/home/nexuslink/vari8-worktrees/merge-proto`, commit `58eb6edc33e73dc1f6d3a0919bc71739683e247d`. Its only initial tracked modification was `frontend/AGENTS.md`; source code was not edited.

J01-J31 map one-to-one to RV-B's 31 table rows, in their original order. A row about an RV-B judgment identifies that judgment explicitly. It does not attribute the judge's error to R1, R2 or R3.

| claim (report path:line) | how checked (command or URL) | result CONFIRMED / WRONG / UNVERIFIABLE | evidence |
|---|---|---|---|
| J01 R1-mobile.md:75; RV-B.md:7 Auth.js is not intended for native applications | Auth.js concepts source [38] | CONFIRMED | The primary source says exactly that. It describes Auth.js as a confidential server-side client. This does not prove that a remote Auth.js-backed API cannot serve native clients. |
| J02 R1-mobile.md:64-71; RV-B.md:8 Next static export excludes Server Actions and cookies | Next static export unsupported-features list [5] | CONFIRMED | The current list explicitly names Cookies, request-dependent Route Handlers and Server Actions. |
| J03 R1-mobile.md:237; RV-B.md:9 Better Auth has a bearer plugin | Better Auth bearer documentation [9] | CONFIRMED | The plugin authenticates requests with bearer tokens instead of browser cookies. Existence does not establish a complete native refresh/revocation design. |
| J04 R1-mobile.md:23; RV-B.md:10 Capacitor core and CLI latest are 8.5.3, published 2026-10-07 | npm registry core [26] and CLI [17] | CONFIRMED | core latest 8.5.3 at 2026-10-07T14:20:18.325Z; CLI latest 8.5.3 at 2026-10-07T14:20:03.298Z. |
| J05 R2-tooling.md:52; RV-B.md:11 TypeScript 7.0.2 was published 2026-07-08 | typescript registry time map and bin metadata [22] | CONFIRMED | 7.0.2 exists at 2026-07-08T15:55:18.431Z and exposes tsc. Installed compiler prints Version 7.0.2. |
| J06 R2-tooling.md:56,98; RV-B.md:12 Adjusted TS7 checks cleanly in 0.80 seconds | Scratch npm ci; prisma generate; measure.py and measure_more.py | UNVERIFIABLE | Clean success IS reproduced, unlike RV-B: all three TS7 GA runs exit 0 after Prisma generation and the documented flags. The historical 0.80 s figure cannot be independently reconstructed. Fresh consecutive warm runs are 0.2536 / 0.2566 / 0.2623 s; first adjusted GA run was 2.6343 s. Native preview and GA are different installed versions. |
| J07 R2-tooling.md:98,103; RV-B.md:13 TS7 is about 2.5 times faster on this tree | Three successful runs per compiler on the same scratch tree | UNVERIFIABLE | Fresh warm medians are TS5 2.4139 s and TS7 0.2566 s, approximately 9.41 times. Both pass. Cache state changes the ratio substantially, so neither the old exact ratio nor a universal replacement ratio is established. |
| J08 R2-tooling.md:99-103; RV-B.md:14 Biome 0.67 s versus ESLint 10.69 s is the applicable timing comparison | Same scratch source, three Biome and repaired Next16 ESLint runs | UNVERIFIABLE | Fresh Biome runs 0.3001 / 0.2909 / 0.3205 s; ESLint Next16 runs 12.8060 / 11.7379 / 10.6239 s. Biome reports 485 files, 84 errors, 312 warnings, 44 infos; ESLint reports 10 errors and 4 warnings. This confirms the speed direction, not the old point estimates or equivalent rule coverage. |
| J09 R2-tooling.md:136-137; RV-B.md:15 Bend 2 uses LAWS.bend and compiles through HVM4 | Current Bend README [3] and CLI source [42] | WRONG | LAWS.bend, dependent types, CPU/GPU execution and back-end emphasis are confirmed. The README explicitly says Bend 1 programs and HVM do not carry over; targets are C, Metal, CUDA and JavaScript. HVM4 is not the described Bend 2 compilation architecture. The claim of no JS story also omits the documented JS target. |
| J10 R2-tooling.md:30; RV-B.md:16 Biome has noNextAsyncClientComponent in its Next domain | Biome 2.5.15 explain command and official rule page [39] | CONFIRMED | explain exits 0, reports available since 2.2.0, severity error, domain next, enabled when next >=14 is detected. |
| J11 P2-biome.md:198,294; RV-B.md:17 Biome has no equivalent to no-async-client-component | Same installed explain output and official documentation [39] | WRONG | noNextAsyncClientComponent is the equivalent. RV-B's finding is correct. This is a P2 cross-report contradiction affecting D4/D7, not an error in R2. |
| J12 R1-mobile.md:73; RV-B.md:18 Capacitor server.url is not intended for production | Capacitor configuration reference, server.url comment [2] | CONFIRMED | The comment specifies live-reload servers and explicitly says not intended for production. Apple's guideline does not name server.url. |
| J13 R1-mobile.md:75; RV-B.md:19 CapacitorHttp exists and native fetch patching defaults off | Official CapacitorHttp documentation [4] | CONFIRMED | The plugin is bundled with core. window.fetch/XMLHttpRequest patching is disabled by default and enabled by plugins.CapacitorHttp.enabled. |
| J14 R1-mobile.md:83; RV-B.md:20 Apple 4.2 requires more than a repackaged website | Apple App Store review guideline 4.2 [7] | CONFIRMED | The guideline names useful, unique or app-like functionality and adequate utility. It is a review standard, not a categorical rule about the UI framework. |
| J15 R1-mobile.md:121,263; RV-B.md:21 A plugin-rich shell is a normal approved app and a native UI avoids 4.2 exposure | Apple guideline 4.2 [7] and official camera/push docs [43][44] | UNVERIFIABLE | Plugins exist, but no primary source guarantees acceptance for this feature checklist. Guideline 4.2 applies to native apps too. Review-risk ranking remains a judgment, not an evidenced acceptance outcome. |
| J16 R3-libraries.md:66-71; RV-B.md:22 muscle-volume.ts provides no 3D requirement | Read merge-proto muscle-volume.ts:1-66 and client-preview.tsx callers | CONFIRMED | It counts sets and returns normalized intensities. client-preview.tsx:640 uses color-mix and :733 selects Heatmap. No WebGL match in frontend/src; the only getContext calls are 2d. |
| J17 R3-libraries.md:54,124; RV-B.md:23 The canvas chart is hand-written SVG | Read merge-proto frontend/src/components/coach/builder/smooth-trend.tsx:1-457 | CONFIRMED | monotonePath at :30 builds the curve. :324-407 renders svg/path. Pointer, keyboard and target-band code exists. Imports are React, a local model and CSS, not a chart library. |
| J18 R3-libraries.md:78; RV-B.md:24 The backend has no validation-library dependency | Read package.json and all six lib/**/boundary.ts imports; local-audit.txt | CONFIRMED | No zod, valibot, arktype, yup or effect dependency/import. DailyEntry uses hand-written boundedString/parseInput and fail-closed error mapping. This does not mean there is no runtime validation. |
| J19 R3-libraries.md:80; RV-B.md:25 lib/storage.ts has a provider-neutral port and null backend | Read merge-proto lib/storage.ts:1-131 | CONFIRMED | ObjectStorageBackend declares presignGet/deletePrefix. nullObjectStorage.presignGet throws storage_not_configured; deletion returns zero. External exposure also throws. There is no upload method or configured vendor. |
| J20 RV-B.md:26,41-42; DECISIONS.md:34; R1-mobile.md:216-244; R3-libraries.md:148,233,245-256 RV-B says D6's unconditional Zod choice is unsupported by the research | Read exact decision and complete R1/R3 recommendations; Base UI Form docs [13] | WRONG | R3 explicitly says add one runtime dependency and Add zod@4.6.7. RV-B selected only R3's conditional-use caveat. D6's every-screen HTTP mandate does go beyond R1's mobile-capabilities-first scope and web server-action retention, but it is an explicit owner decision. Separate that scope difference from the false claim that R3 opposes adding Zod now. |
| J21 R1-mobile.md:257-276; RV-B.md:27 Capacitor with a PWA interim is R1's recommendation | Read R1 recommendation and Capacitor static-asset/config plus plugin docs [2][43][44] | CONFIRMED | The reports support this as a reuse-first recommendation, contingent on a separate client bundle, API/auth work and native features. No shell or store acceptance was exercised here. |
| J22 R2-tooling.md:153-162; RV-B.md:28; DECISIONS.md:38 R2 recommends Biome, TS7, Turbopack and retaining npm | Read recommendations; official Next TS7 and Next16 docs [8][10]; installed compilers | CONFIRMED | Next documentation supports project-local TS7 tsc. Next16 makes Turbopack the default. Clean TS7 typechecks now reproduced. This review does not certify a complete TS7 Next build or consumer-tool API compatibility. |
| J23 R3-libraries.md:124,204-206; RV-B.md:29 Reuse SVG and retain useActionState plus Base UI forms | Read chart source and official Base UI Form examples [13] | CONFIRMED | Base UI documents both useActionState with a Server Function and Zod field-error mapping. This supports the web form recommendation, not useActionState Server Functions in a statically exported mobile bundle. |
| J24 RV-B.md:30,42; R3-libraries.md:233,245-256; DECISIONS.md:42 RV-B says adding Zod now contradicts R3's recommendation | Read R3's complete summary table and Smallest set section, not only :152 | WRONG | R3:233 says needed, :245 says add one runtime dependency, :249 explicitly says add zod@4.6.7, :256 says plus zod. R3 is internally tense about timing, but RV-B's blanket contradiction finding is not supported. D8 does not pin 4.6.7; it says zod 4. |
| J25 R1-mobile.md:13; RV-B.md:31 Only the Auth.js API route currently exists | Enumerate files in merge-proto app/api with pathlib.rglob | CONFIRMED | The only file is app/api/auth/[...nextauth]/route.ts. Domain services and server actions still provide substantial backend behavior. |
| J26 R1-mobile.md:46,305; RV-B.md:32 The historical iOS non-installed storage limit describes exact current behavior | WebKit 2020 ITP post [16] and 2023 storage-policy post [15] | UNVERIFIABLE | Historical seven-day Safari-use-without-interaction rule is sourced. Newer primary docs describe eviction on inactivity/pressure, persistent storage and Home Screen heuristics. No 2026-specific guarantee was established; retain R1's explicit unverified qualifier. Installation alone is not a universal immunity from all eviction. |
| J27 R1-mobile.md:111; RV-B.md:33 Base UI canvas components are DOM components, not drop-in React Native UI | Base UI Form examples [13] and @base-ui/react 1.8.0 registry peers [19] | CONFIRMED | The package peers on react-dom; examples render browser form/input/button elements and CSS. This substantiates non-portability of these components, not a claim that no code or architecture can be shared. |
| J28 R2-tooling.md:47-48,100; RV-B.md:34 Legacy FlatCompat crashes with Next16's ESLint config | Scratch baseline config plus installed Next16 dependency set; eslint16-legacy-repro.log | CONFIRMED | Exit 2 with Converting circular structure to JSON and property react closes the circle. The actual current next16-proto config is already repaired with flat imports, so the historical failure is not its present state. |
| J29 R2-tooling.md:69,186-187; RV-B.md:35 R2 labels the up-to-90-percent pnpm install claim secondary and unverified | Read R2 qualifiers and primary pnpm12 release post [21] | CONFIRMED | The qualifier is explicit. The retrieved release post confirms the Rust rewrite but has no 90-percent benchmark. The secondary benchmark is not primary proof of production install gains here. |
| J30 R3-libraries.md:175,180; RV-B.md:36 Offline implementation needs a consent-policy decision | Read consent-audit.md:32,43-44,84-89 and product-decisions.md:206-210,225-239 | CONFIRMED | Coach-attested offline consent is explicitly TODO(human); submission draft/local storage also has binding scope restrictions. The cited offline-consent sentence alone is not a complete technical policy for revocation of cached data, queued writes, erasure or device loss. Those require design review before offline ships. |
| J31 R3-libraries.md:194; RV-B.md:37 UploadThing's last npm/GitHub release was 2025-08-17 | npm time map [20] and GitHub latest release API [11] | CONFIRMED | npm latest 7.7.4, published 2025-08-17T19:58:22.500Z; latest GitHub release @uploadthing/vue@7.3.3 published 2025-08-17T19:58:55Z. No newer version timestamp exists in the retrieved uploadthing time map. |
| M01 R2-tooling.md:67; DECISIONS.md:25 Node 24 is an LTS line on the research date | Official Node release schedule [41] | CONFIRMED | v24 LTS began 2025-10-28, maintenance starts 2026-10-20, end 2028-04-30. Runtime here is Node v26.7.0, so these measurements are not Node 24 deployment measurements. |
| M02 R1-mobile.md:11,16; DECISIONS.md:29 next-auth 5.0.0-beta.32 permits Next16 and React19 | Exact npm manifest [18] | CONFIRMED | Peer ranges include next ^16.0.0 and react ^19.0.0. A peer range is declared compatibility, not proof that all auth flows passed on the target stack. |
| M03 R3-libraries.md:22-26,88-90; DECISIONS.md:26-28 The target canvas already pins Next16.3.8, React19.3, Tailwind4.3.3 and Base UI1.8 | Read merge-proto frontend/package.json and base-ui manifest [19] | CONFIRMED | The exact dependencies match. No chart, 3D, validation, data-cache, dedicated form or date library is a direct canvas dependency. Prisma remains major6 in root package.json. |
| M04 R2-tooling.md:55 TS7 makes strict=true and module=esnext mandatory | Microsoft release note [12]; TS7 override.ts probe, ts7-default-override.log | WRONG | The primary source calls these defaults. TS7 7.0.2 accepts --strict false --module commonjs and exits 0 on the probe. Some old options are removed, but defaults and mandatory settings are not interchangeable. |
| M05 R1-mobile.md:11,160,228 The Auth.js JWT session is merely signed, so its secret is the obvious basis for mobile-token signing | Read auth.config.ts and auth.ts; Auth.js JWT reference [23] | WRONG | No custom encode override exists in these files. Auth.js documents encryption by default with A256CBC-HS512 JWE and derived keys, not simply a signed JWT. The proposed independent token protocol cannot be inferred from the cookie format. |
| M06 R1-mobile.md:228-239 A bespoke access/refresh protocol sharing the Auth.js secret is the evidence-backed mobile auth design | Auth.js native-client limitation [38] and JWT warning [23]; local session-version code | UNVERIFIABLE | The sources establish a need to design mobile auth, not this exact protocol or key reuse. Existing sessionVersion checks implement reset revocation; the proposal does not specify how bearer verification preserves those, account/membership/consent checks, token audience/type separation, device storage or atomic refresh reuse detection. Require an explicit reviewed design before implementation. No exploitable implementation is claimed here. |
| M07 R3-libraries.md:78 There is no effect string anywhere in the listed backend directories | Regex scan package.json and lib/**/boundary.ts; local-audit.txt | WRONG | The broad substring grep matches effectiveDate in lib/mealplan/boundary.ts:134 and effective_bounds in lib/trainingprogram/boundary.ts:55,93-94. The intended narrower claim, no effect validation dependency/import, is confirmed by J18. This does not change the library decision. |
| M08 R3-libraries.md:146,148,249 Standard Schema makes a future Zod-to-Valibot switch cheap without caller-specific migration | Standard Schema interface [25], Zod v4 [45], Valibot schemas [46], Base UI Zod mapping [13] | UNVERIFIABLE | The interface supports interoperability for consumers that use it. It does not standardize schema construction or the Zod-specific flattenError code shown here. No app integration exists to establish actual switching cost. Treat reversibility as an architectural aim, not measured evidence. |
| M09 R3-libraries.md:196,198 Hand-signing S3 requests is the smaller appropriate solution, and R2 is the cheapest production fit | AWS presigned-upload documentation [28] and existing storage port | UNVERIFIABLE | No implementation, dependency/bundle comparison, pricing workload or vendor/privacy analysis supports these rankings. AWS documents presigned upload but does not establish that hand-written signing is preferable. Preserve the port; use a reviewed signer and leave the vendor open as D8 says. |
| M10 R2-tooling.md:48,155 The legacy config crash removes the last reason to keep ESLint and proves P2 can run as written | Scratch repaired Next16 ESLint run; Biome rule explain command [39] | WRONG | Flat imports fix the crash and lint reaches 10 errors/4 warnings. The crash does not establish equivalent rule coverage or remove the need to check it. J11 independently falsifies P2's no-async-client-component inventory. Biome can still be a reasonable choice on speed and consolidation grounds, but this argument does not prove it. |
| M11 R3-libraries.md:81,220,224; DECISIONS.md:42 The backend already uses Intl and has no direct date-library dependency | Scan lib/app/components and read root package.json; intl-audit.txt | CONFIRMED | Fourteen textual Intl.DateTimeFormat matches are present, including type annotations and a comment, not fourteen independent runtime calls. No date-fns/dayjs/luxon/polyfill direct dependency exists. Keeping platform formatting is supported; DST arithmetic still requires the existing separate timezone logic or a reviewed future library choice. |
| S01 R1-mobile.md:77 Capacitor SQLite current 8.1.1 | Fresh npm registry document [29] | CONFIRMED | Published 2026-08-06T12:39:11.958Z. latest tag is 8.1.1. |
| S02 R1-mobile.md:24 Capacitor 8.0.0 release date 8.0.0 | Fresh npm registry document [26] | CONFIRMED | Published 2025-12-08T18:04:26.654Z. This is the initial 8.0.0 release, not the latest stable. |
| S03 R1-mobile.md:31 NativeWind current 4.2.7 | Fresh npm registry document [30] | CONFIRMED | Published 2026-09-14T22:51:19.095Z. latest tag is 4.2.7. |
| S04 R1-mobile.md:30 react-strict-dom current 0.0.55 | Fresh npm registry document [31] | CONFIRMED | Published 2026-01-09T22:23:53.009Z. latest tag is 0.0.55. |
| S05 R2-tooling.md:41 Oxfmt current 0.73.0 | Fresh npm registry document [32] | CONFIRMED | Published 2026-10-13T09:47:24.473Z. latest tag is 0.73.0. |
| S06 R2-tooling.md:61 Rspack current 2.2.9 | Fresh npm registry document [33] | CONFIRMED | Published 2026-10-13T07:46:16.362Z. latest tag is 2.2.9. |
| S07 R2-tooling.md:45 ESLint current 10.13.0 | Fresh npm registry document [34] | CONFIRMED | Published 2026-10-16T14:24:10.765Z. latest tag is 10.13.0. |
| S08 R3-libraries.md:137 Valibot current 1.5.0 | Fresh npm registry document [35] | CONFIRMED | Published 2026-09-09T12:58:23.503Z. latest tag is 1.5.0. |
| S09 R3-libraries.md:160 TanStack Query current 5.104.4 | Fresh npm registry document [36] | CONFIRMED | Published 2026-10-17T17:55:14.077Z. latest tag is 5.104.4. |
| S10 R3-libraries.md:218 date-fns current 4.4.0 | Fresh npm registry document [37] | CONFIRMED | Published 2026-05-29T23:23:42.628Z. latest tag is 4.4.0. |

## Fresh timing method and results

Scratch evidence is `/home/nexuslink/.hermes/cache/scratch/vari8-review/RV-B2/`. `measurements.json` records every command, directory, duration, exit code and output-line count. Each label also has its complete `.log` file. `measure.py` and `measure_more.py` retain the actual commands. No network download or install time is included in the typecheck or lint figures.

The merge-proto tree was copied with rsync, excluding `.git`, `node_modules`, `.next`, `tsconfig.tsbuildinfo` and environment files. `npm ci --ignore-scripts` exited 0. A separate scratch tools prefix installed TypeScript 7.0.2, native-preview and Biome 2.5.15. Explicit scratch `prisma generate --schema db/schema.prisma` exited 0. It used a deliberately unusable local database URL and did not contact a database.

The installed compilers identify themselves as TypeScript 5.9.3, TypeScript 7.0.2 and native-preview 7.0.0-dev.20260707.2. RV-B used native-preview as a substitute for the requested GA compiler. This review measured both and keeps them separate.

| Command and state | Three durations, seconds | Median, seconds | Exit codes |
|---|---|---|---|
| `npx --no-install tsc --noEmit`, TS5, consecutive warm runs | 2.4052 / 2.5005 / 2.4139 | 2.4139 | 0 / 0 / 0 |
| `tools/node_modules/.bin/tsc --noEmit --types node --noUncheckedSideEffectImports false`, TS7 GA, consecutive warm runs | 0.2536 / 0.2566 / 0.2623 | 0.2566 | 0 / 0 / 0 |
| `tools/node_modules/.bin/tsgo --noEmit --types node --noUncheckedSideEffectImports false`, native preview | 2.5570 / 0.2754 / 0.2636 | 0.2754 | 0 / 0 / 0 |
| `biome check . --max-diagnostics=0`, same root source, adapted P2 config | 0.3001 / 0.2909 / 0.3205 | 0.3001 | 1 / 1 / 1 |
| ESLint9.39.5 with Next16.3.8 direct flat config on the same root source | 12.8060 / 11.7379 / 10.6239 | 11.7379 | 1 / 1 / 1 |

The first pass interleaved TS5 and TS7 on their shared incremental-state file. That invalidates the other compiler's cache and produced TS5 medians of 19.7515 s and TS7 medians of 2.5385 s. I retained those logs but did not present them as warm no-change comparisons. A separate warmup followed by three consecutive runs per compiler avoids that confound. The reported 9.41 ratio is whole-command elapsed time, including npx overhead for TS5 but not for the directly invoked TS7 binary. It is not a pure compiler benchmark or a universal speedup.

Plain TS7 before the flags fails only with TS2882 for `./globals.css` after Prisma generation. All adjusted measurements above succeed. RV-B's missing-Prisma obstacle was a scratch setup omission, not an inability to verify the clean typecheck. These numbers are on Node 26.7.0/npm11.19.0, not the Node 24 target runtime. No Next production build was part of this research-check task.

The first Biome attempt aborted on nested root configuration and is excluded from timing evidence. In scratch only, the frontend config was marked non-root and the root config excluded frontend, matching the root-only ESLint scope. VCS scanning, P2 file exclusions and different rule sets still differ. Biome checked 485 files, with 84 errors, 312 warnings and 44 infos. ESLint found 10 errors and 4 warnings. These are real failed lint checks used for elapsed-time measurement, not clean lint acceptance. Reduced Biome output via `--max-diagnostics=0` also prevents a strict output-cost comparison.

The legacy FlatCompat repro used the base config with the installed Next16 dependency set. It exits 2 with the reported circular-JSON error. The current next16-proto file already uses flat imports and no longer has that defect. Fixing the config is sufficient to reach real lint diagnostics.

## Findings

### Incorrect claims and corrections

- J09, R2:136-137, affects D7's explanation for excluding Bend. Bend 2's own README names C, Metal, CUDA and JavaScript targets and explicitly separates it from HVM. Its CLI also documents a JavaScript module loader. Correct the HVM4 and absent-JS descriptions. No evidence here makes Bend a suitable replacement for this Next app.[3][42]
- J11, P2:198 and :294, affects D4/D7. Biome 2.5.15 has `noNextAsyncClientComponent`, available since 2.2.0, in the Next domain. RV-B correctly caught this. Correct the rule inventory before relying on a migration-coverage count.[39]
- J20 and J24, RV-B:26 and :30, affect how D6/D8 are interpreted. R3 explicitly recommends adding Zod now at :233, :245, :249 and :256. Its :152 caveat makes the report internally inconsistent about when first use is justified. It does not support RV-B's assertion that D8 contradicts the research. D8 specifies major 4, not an exact 4.6.7 pin. D6's every-screen HTTP requirement is broader than R1's mobile-needs-first path and retention of web server actions. That is a real scope difference, but D6 is an explicit owner decision, not a factual claim invalidated by a research recommendation.
- M04, R2:55, affects D7 migration guidance. The TS7 release calls strict and module choices defaults. A scratch TS7 probe accepts `--strict false --module commonjs` and exits 0. Removed options must be distinguished from overridable defaults.[12]
- M05, R1:11 and :160, affects D6 auth design. Auth.js documents its default JWT as encrypted JWE using A256CBC-HS512, with a derived key. The app does not override that encoding. Do not design mobile token signing from the report's simplified signed-cookie description.[23]
- M07, R3:78, has no decision impact. The stated broad substring grep is false because `effectiveDate` and `effective_bounds` contain `effect`. The meaningful absence of a validation-library dependency/import is confirmed.
- M10, R2:48 and :155, affects D7's justification. The observed FlatCompat crash is repairable with flat imports. It does not itself justify removing ESLint or certify Biome's coverage. Speed and consolidation remain independent reasons to consider Biome. P2's demonstrated rule-inventory error also means "run P2 as written" is not an independently verified instruction.

### Recommendations that outrun their evidence

- R1:228-239 gives an implementation recipe for mobile tokens, including reuse of the Auth.js secret, without a supporting protocol design. Keep the direction of separate mobile auth, but require a reviewed design for access/refresh token separation, key derivation or separation, audience/type binding, secure device storage, rotation races, replay detection and revocation. Existing sessionVersion invalidation and all live authorization/consent checks must remain effective. No exploitable implementation was found or claimed because this protocol does not exist yet.[23][38]
- R1:121 and :263 rank store-review risk too categorically. Apple 4.2 applies regardless of whether the app uses React Native or a WebView. Camera, push and offline logging support an app-like product argument but do not guarantee acceptance. Retain the explicit review risk rather than promising approval.[7][43][44]
- R1's 100-percent presentational-reuse number is an estimate, not a completed port. The report correctly proposes a separate static client bundle and HTTP data calls. Do not read it as proof that server-action-bound forms can ship unchanged into that bundle.[5]
- R2:98-103 and D7 repeat historical point estimates without enough cache-state detail to reproduce them. The clean-success premise is now independently verified. Keep the direction, replace any guaranteed 2.5-times or 0.8-second promise with a benchmark method and the real target-runtime results.
- R3:146 overstates what a shared schema interface proves about migration cost. Standard Schema can preserve standard-aware consumers. It does not make schema constructors or Zod-specific error formatting interchangeable. No app integration was measured.[13][25][46]
- R3:194 and :196-198 do not establish that a hosted upload provider inherently violates consent/erasure requirements, that manual S3 signing is the appropriate dependency saving, or that R2 is the cheapest approved vendor. Release age is verified, but those broader exclusions/rankings need vendor, security and workload evidence. D8 correctly leaves the vendor open. Preserve the port and use a reviewed signing implementation rather than treating cryptographic request signing as a proven simplification.[11][20][28]
- D6's one HTTP contract and D8's web server-action form recommendation need an explicit integration design. A web action wrapper can call the same boundary as an HTTP route; a static mobile bundle needs an HTTP submission adapter. R1 already describes that distinction. Offline health-data caching additionally needs rules for withdrawal, cached reads, queued writes, erasure and device loss. The single coach-attested-offline-consent TODO cited by R3 is not the entire offline policy.

## Could not check

- The exact historical 0.80-second/2.5-times TS figures and 0.67-versus10.69-second lint figures cannot be reconstructed from the report alone. Fresh successful compiler runs and honest same-source lint timings are recorded instead.
- No 2026-specific WebKit statement establishing an immutable current seven-day rule was located. Historical ITP policy and the newer storage-policy qualifications were read. R1 already marks this uncertainty.[15][16]
- Actual App Store acceptance, a finished Capacitor shell, mobile token security, offline consent/revocation behavior and vendor compliance were not exercised. These remain implementation/product/privacy gates.
- TS7's complete Next production build and every compiler-API-dependent consumer were not exercised. Official Next support and successful whole-tree checks are confirmed, not the unrun integrations.[8]
- The random sample is stratified across 18 explicit package-version assertions, not an exhaustive survey of every prose statement or package in the three reports. `random-samples.json` records the full pool, seed 2026101802 and selected 4/3/3 entries. All ten selected checks are in the table.
- A secondary optional Bend package.json URL returned404. The current README and actual CLI source were successfully retrieved and suffice for the Bend finding. No result depends on the failed URL.

## Final verdict on R1, R2 and R3

| Report | Verdict | What can be relied on | What remains conditional |
|---|---|---|---|
| R1 mobile | PASS WITH FINDINGS | Capacitor is a reasonable reuse-first direction; static-export limits, bearer option and native plugins are sourced. PWA interim is the report's stated fallback. | Correct the signed-JWT description and categorical store claims. The bespoke token recipe, exact reuse percentage and offline policy are not approved implementation guidance. |
| R2 tooling | PASS WITH FINDINGS | TS7 exists, clean typechecks succeed, Biome is faster in the recorded runs, Next documents TS7 and default Turbopack. Retaining npm avoids a separate migration. | Correct Bend architecture, TS defaults and ESLint-removal reasoning. The old exact speed ratios and complete rule parity remain unproved. |
| R3 libraries | PASS WITH FINDINGS | No 3D is justified, the existing SVG is real, the storage port fails closed, and Base UI documents the current web form pattern. Zod addition is explicitly recommended. | Resolve the contradictory Zod timing language. Do not treat schema-switch cost, hand-written signing, hosted-provider rejection or vendor cost ranking as established facts. |

## Mandatory self-check

- PASS. Read R1, R2, R3, RV-B, RV-B/RV-B2 brief, DECISIONS D5-D8 and project routing/authority files.
- PASS. Rechecked all RV-B WRONG rows [17, 26, 30] and all UNVERIFIABLE rows [12, 13, 14, 21, 32, 34, 37]; J01-J31 retain the exact row mapping.
- PASS. Rechecked every one of the 21 original CONFIRMED rows, exceeding the minimum of eight.
- PASS. Listed 26 decision-bearing checks before the table, exceeding the minimum of 15 and covering D5-D8.
- PASS. Checked Auth.js native limitation, static-export cookies/actions, Better Auth bearer plugin, Capacitor current version and TS7 publication against primary sources.
- PASS. Opened muscle-volume.ts, smooth-trend.tsx, storage.ts and boundary code. Scanned package.json and all six lib/**/boundary.ts files.
- PASS. Generated Prisma in scratch and ran three successful npx TS5 checks and three successful TS7 GA checks. Also measured native-preview separately. Full commands/exits/logs are retained.
- PASS. Re-measured Biome versus ESLint. Disclosed nonzero exits, unequal coverage/output, initial configuration failure and scratch-only adaptation.
- PASS. Selected ten additional claims with a recorded seeded random sample across all three reports and verified every selected registry fact.
- PASS. Audited unsupported recommendations and gave a final verdict for each research report, separate from corrections to RV-B.
- PASS. Hash-checked all reviewed reports unchanged and compared all three reviewed worktree statuses with initial snapshots. DECISIONS.md gained a concurrent D10 append; its entire original byte prefix, including D5-D8, hashes identically. Only RV-B2.md was written in the project by this reviewer. No commit, push, GUI or service was started.
- PASS. Applied Prove It Works by replacing RV-B's ungenerated-Prisma failure with actual generated-client compiler runs. All subprocesses were synchronous and finished; none needs cleanup.

## Sources

[2] https://capacitorjs.com/docs/config
[3] https://raw.githubusercontent.com/bendlang/bend/main/README.md
[4] https://capacitorjs.com/docs/apis/http
[5] https://nextjs.org/docs/app/guides/static-exports
[7] https://developer.apple.com/app-store/review/guidelines
[8] https://nextjs.org/docs/app/api-reference/config/typescript
[9] https://www.better-auth.com/docs/plugins/bearer
[10] https://nextjs.org/blog/next-16
[11] https://api.github.com/repos/pingdotgg/uploadthing/releases/latest
[12] https://devblogs.microsoft.com/typescript/announcing-typescript-7-0
[13] https://base-ui.com/react/components/form
[15] https://webkit.org/blog/14403/updates-to-storage-policy
[16] https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more
[17] https://registry.npmjs.org/@capacitor/cli
[18] https://registry.npmjs.org/next-auth/5.0.0-beta.32
[19] https://registry.npmjs.org/@base-ui/react
[20] https://registry.npmjs.org/uploadthing
[21] https://pnpm.io/blog/releases/12.0
[22] https://registry.npmjs.org/typescript
[23] https://authjs.dev/reference/core/jwt
[25] https://standardschema.dev
[26] https://registry.npmjs.org/@capacitor/core
[28] https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html
[29] https://registry.npmjs.org/@capacitor-community/sqlite
[30] https://registry.npmjs.org/nativewind
[31] https://registry.npmjs.org/react-strict-dom
[32] https://registry.npmjs.org/oxfmt
[33] https://registry.npmjs.org/@rspack/core
[34] https://registry.npmjs.org/eslint
[35] https://registry.npmjs.org/valibot
[36] https://registry.npmjs.org/@tanstack/react-query
[37] https://registry.npmjs.org/date-fns
[38] https://raw.githubusercontent.com/nextauthjs/next-auth/main/docs/pages/concepts/index.mdx
[39] https://biomejs.dev/linter/rules/no-next-async-client-component
[41] https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
[42] https://raw.githubusercontent.com/bendlang/bend/main/bend2/main.ts
[43] https://capacitorjs.com/docs/apis/camera
[44] https://capacitorjs.com/docs/apis/push-notifications
[45] https://zod.dev/v4
[46] https://valibot.dev/guides/schemas
