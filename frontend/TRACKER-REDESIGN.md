# Client Tracker redesign

Implemented 15 October 2026 in the coach client preview and the standalone Ethereal Tracker.

The Tracker now offers three views inside the existing feature:

- **Today:** compact Monday-first date navigation, configured daily summaries, collapsible categories, and the existing validated metric editors.
- **Week:** a transposed seven-day comparison table, sticky metric labels, collapsible groups, configuration-aware summaries, and links back to a day's entry.
- **Trends:** searchable, grouped selection of up to three metrics; 7-, 30-, 90-, and 180-day ranges; independent scales with synchronized date inspection; numeric lines, count bars, boolean completion grids, and dated text entries. Missing observations break the line and remain distinct from zero.

## Components and architecture

The implementation lives in `src/components/coach/client-tracker-preview/`:

- `tracking-view.tsx`: shared view selection and selected date; passes the same values and callbacks into all views.
- `today-view.tsx`, `week-view.tsx`, `trends-view.tsx`: independent presentation components.
- `view-model.ts`: UTC date arithmetic, ordered configuration grouping, value presentation, completion detection, and summaries.
- `editor-context.tsx`: tracks open editors so switching dates or views cannot discard an unfinished entry.
- `tracker-cell.tsx`: retained validation, canonical unit conversion, ratings, and specialized text/time/choice editors; editor placement now respects the client preview's bounds.

`client-preview.tsx` keeps tracker state alive while switching client sections. Configured legacy fields are resolved through `ALL_PARAMETERS` so older template snapshots retain their metrics. Configured `Variant.summaries` supplies daily priorities when available; otherwise one numerical metric per category supplies a restrained overview.

`src/components/ethereal/client-tracker/tracking-view.tsx` adapts the existing standalone tracker to these components. Its parent still owns its original storage key, values, save logic, configuration, comments, and validation. No tracking store, backend, dependency, or route was added.

Optional `TrackerConfig.parameterDefinitions` and `summaryParameterIds` provide presentation metadata without changing existing value IDs. Definitions supplied through this interface can use custom labels, categories, ranges, units, and supported input types.

## Existing limitations retained

- Coach preview edits remain session-local; standalone entries and comments remain device-local. There is no backend synchronization.
- The app's existing fixed snapshot dates remain the source of “today” and future-date validation.
- The template editor still authors its existing parameter catalog. This redesign does not add an arbitrary metric-definition editor or new input types.
- Custom date ranges are not part of the existing infrastructure; Trends supplies four rolling ranges.

## Verification

- `npm run build`: passed on the final implementation, including TypeScript and static page generation. An earlier sandboxed build stalled; the completed build ran outside the sandbox.
- `npm run typecheck`: passed.
- `node --test src/components/coach/*.test.mjs src/components/coach/client-tracker-preview/*.test.mjs src/components/ethereal/client-tracker/model.test.mjs`: **51 passed, zero failed**.
- Biome on all 17 changed tracker/integration files: passed.
- `git diff --check`: passed.
- Repository-wide `npm run lint`: fails on 26 existing formatting/import diagnostics in archived `artifacts/20261015-113027/` files and `src/components/coach/roadmap-preview.ts`; these unrelated files were left unchanged.
- Browser: inspected Today, Week, and Trends at desktop and 390px mobile widths. Exercised historical prefilling, numeric validation and edits, shared values and summaries, week/category navigation, chart selection and keyboard inspection, state retention across client sections, time-entry editor controls, and standalone persistence across reload. The numeric persistence check restored its original sample value. Confirmed the mobile time editor fits entirely within the preview dialog.
- Mechanical design scan: advisory findings about the older studio design document's font/radius scale; the implementation intentionally retains the compact coach interface's sizes.

Screenshots: `artifacts/tracker-redesign/today-desktop.png` and `artifacts/tracker-redesign/today-mobile.png`.

## Apple Design and High-End Visual Design clarity pass

Three Luna agents handled Today, Week, and Trends in separate component boundaries. The lead integrated the shared toolbar, date navigation, material tokens, entry modes, typography, and review fixes.

- The toolbar separates feature navigation from date navigation and secondary configuration. Standalone tracking now opens in **Log data** mode; **Coach notes** retains the existing commenting behavior.
- Today provides a category index on desktop and a category selector on mobile. Fields form a readable settings list with aligned labels, values, and complete unit suffixes. Overview readings act as shortcuts to their entry fields. Missing values explicitly invite an entry; coach mode identifies them as not recorded.
- Week uses quieter category grouping, larger readable values, and a restrained selected-day column. The today marker appears once in the header. The sticky metric labels and local horizontal scroll remain.
- Trends uses an expandable searchable picker, removable metric tags, and a compact range control. Escape closes the picker and restores focus without dismissing the surrounding client preview.
- Major working surfaces use one nested tray/core material. The Tracker uses locally hosted Geist, fine-stroke icons, immediate press feedback, critically damped selection motion, and reduced-motion equivalents. Existing colors adapt to the parent theme.
- The standalone Tracker's top inset is smaller; other pages and global navigation retain their existing layout.

Validation after this pass: all **51 tests** pass; all **17 tracker files** pass Biome; TypeScript and the production build pass. Browser checks covered Today, Week, and Trends on desktop and at 390px, category filtering and summary focus, invalid-input recovery, searchable metric selection, Escape containment, keyboard chart-to-day navigation, and the nested client preview. The mobile preview's time editor fits inside its 303px content region.

Updated captures are in `artifacts/tracker-redesign/`: `apple-today-desktop.png`, `apple-today-mobile.png`, `apple-week-desktop.png`, `apple-trends-desktop.png`, and `apple-client-preview-mobile.png`.

## Focus, surface, chart, and example-history refinement

Three Luna agents implemented the focus treatment, chart measurement repair, and example-history generator. The lead reviewed the generator, integrated the preview, and adjusted the shared material tokens.

- Today fields now use one subtle focus border on the value-and-unit wrapper. Nested numeric and rating editors do not add extra outlines, backgrounds, or shadows. Keyboard focus remains visible.
- Tracker panels and entry fields use darker, theme-aware surfaces, scoped to the tracker.
- Each numeric plot measures and observes its own mounted container. SVG geometry renders only after a usable width is available, including after an empty metric selection, hidden preview, or viewport resize.
- Template sample previews receive 56 consecutive days of complete configured tracker inputs, ending on the existing 13 October snapshot. Ratings and physical measurements use canonical storage; structured inputs use their existing formats. Cycle days derive from example period-start events. Empty choice lists do not receive fabricated options. Assigned-client previews and standalone storage keep their existing records.

Validation: production build, typecheck, targeted Biome, and diff checks pass. All **57 tests** pass, including six new example-history checks. Browser inspection covered desktop and 390px mobile, single-border rating focus, populated weekly readings, 56 observations in the three-month chart, line and bar plots, keyboard chart-to-day navigation, removing all metrics and reselecting, and switching Dashboard/Tracker. Mobile charts resize correctly with no page overflow. Temporary viewport overrides were reset.

Captures: `refined-trends-desktop.png`, `refined-trends-mobile.png`, `refined-focus-mobile.png`, and `eight-week-trends-desktop.png` in `artifacts/tracker-redesign/`.

## Foundations alignment and tracker configuration

The shared coach visual system now follows the supplied Foundations reference: a near-black `#080808` canvas, `#0f0f0f` structural surfaces, restrained pink accents, Geist typography, quiet navigation, fine rules, and compact pill controls. The client preview uses the canvas color rather than a raised gray surface; its section navigation is an underline treatment. Workspace navigation starts at the destination heading and restores keyboard focus there.

Three Luna agents handled the configurators, daily/weekly interaction, and charts. Integration review corrected overview ordering, added explicit numeric completion, expanded mobile input targets, and unified example records across the tracker, dashboard, and weekly timeline.

- Coach Tracker setup now separates the ordered **Daily fields**, settings disclosures, searchable **Add parameter** library, and ordered **Daily overview**. Overview selection supports zero to four numeric/rating fields and appears in exactly that order in the tracker. `Variant.trackerHighlights` is optional and survives persistence and assignment snapshots; older templates retain their existing defaults. Check-in summaries remain independent.
- Energy intake, protein intake, and waist circumference are selectable catalog fields with their existing IDs and units. Removing and re-adding a field within the configurator session retains its custom unit/options. Cycle settings and existing records remain intact when hidden.
- The standalone configurator also supplies searchable measures and an ordered overview, with validated optional `summaryParameterIds` in its existing device-local store. Cancel preserves the prior configuration.
- Daily readings are a quiet logbook with aligned inputs and adjacent units. Numeric editing supplies Done, Enter, Escape, and sequential Tab behavior; invalid drafts remain available to correct. Phone inputs use 16px text and 44px targets.
- Week is a readable ledger with sticky metric labels, compact phone columns, and local horizontal scrolling.
- Trends adds an eight-week range, precise axis ticks, a subtle area beneath actual line segments, actual latest/average/change values, an explicit missing-data state, and deliberate selected-day navigation. Missing values and zero remain distinct. Chart widths survive hiding, metric remounts, and resizing.
- Sample previews use 56 consistent daily records across Dashboard, Tracker, and Timeline; assigned clients and standalone histories are not synthesized or overwritten.

Validation: **62 tests** pass, targeted Biome checks pass for **32 files**, typecheck passes, production build passes, and `git diff --check` passes. Actual browser checks covered desktop and 390px mobile, configuration order and preview agreement, Energy intake search and unit retention, overview limit/empty state, numeric validation/Done/Tab/Escape, weekly sticky scrolling, line/bar chart remounting, eight-week coverage, empty charts, explicit chart-to-day navigation, standalone cancel behavior, and light-mode fallback. The coach client list, check-ins, messages, dashboard, and template editor were also visually inspected. Test settings and temporary viewport overrides were restored.

New captures are in `artifacts/tracker-foundations/`: `configurator-desktop.png`, `configurator-mobile.png`, `daily-desktop.png`, `daily-entry-mobile.png`, `week-desktop.png`, `week-mobile.png`, `trends-desktop.png`, and `trends-mobile.png`.
