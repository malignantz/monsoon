# Monsoon TODO

Last consolidated: 2026-10-03 (after URL state, compare, provenance, Schengen/day-count, events reconciliation and the static SEO pages shipped).

See `UX_RESEARCH_AUDIT.md` for the research-backed audit (usability, the "boring" My year problem, trust/freshness, retention loops, programmatic SEO), its source list and roadmap; its "Status as of 2026-10-03" note says which recommendations have shipped. The items below are the actionable slices.

## Data And Scoring

- [ ] Apply the calibrated climate and air data. Built on branch `worktree-agent-afe28801026ce36a8` (WMO 1991-2020 station normals via NOAA NCEI, ERA5 via Open-Meteo, CAMS PM2.5 scaled to the WHO air-quality database); not applied to `main`. Pending owner review of the diff (`scripts/apply_climate_air.py --check`), then `--write`, `rebake_scores.py` and `sanity_check.py`.
  - 6 cities still to fetch (Open-Meteo quota): Nha Trang, Ipoh, Skopje, Ohrid, Gdansk, Queretaro; they carry a low-confidence legacy estimate until then.
  - Known doubtful cases to check before applying: Sofia and Plovdiv winter PM2.5, the tropical rain-day fallback (threshold fitted on station cities), highland cities with no station nearby, San José.
  - WHO air-quality data is under a non-commercial licence; settle that before shipping scaled values.
  - Until applied, per-month temperature, humidity, rain days and PM2.5 are unsourced estimates and the sheet and methodology say so.
- [ ] Resolve the event mismatches that would change scores (`python3 scripts/reconcile_events.py` regenerates `tmp/events-mismatch.md`).
  - 16 month conflicts: the scored month names an event the visible list carries in a different month. One side is wrong; fixing the score side changes `evtTier`/`events` and needs a rebake.
  - 41 visible major (tier 3) events in months scored below tier 3.
- [ ] Add-a-city pipeline, then expand beyond 111 cities. Depends on the climate/air pipeline above (new cities need sourced climate and PM2.5, not another estimate).
  - Lookup tables live inside the scripts (not in data files), and the data files are joined on city name, so adding a city means touching several scripts and files by hand.
  - Append the new ID to `src/lib/cityIds.v1.js` and run `npm run check:ids`; add `data/cost-evidence/<slug>.json`.
- [ ] Decide what to do with the unshipped FCDO layer and city photos. `scripts/build_fcdo.py` output is not baked into the data (no `advisoryUK`), and `data/city-media.json` hero paths are in the data but no images ship and no surface shows them. Either finish and ship, or remove the dead pipeline.
- [ ] Create a comprehensive visa information plan.
  - Define the user-facing scope before restoring visa details to city views (`city.visa` is baked into core data but rendered nowhere).
  - Cover passport-specific rules, e-visas/arrival cards, extensions, Schengen rolling windows, and source freshness.
  - Decide which visa signals belong in discovery, city detail, and My year validation.
- [ ] Decide whether cost should become part of the headline score or remain a Best Value lens only.
  - Current model keeps the Score cost-free and uses Best Value for Score relative to cost.
  - Product positioning leans hard on livability per dollar, so the default ranking may eventually need to become more budget-aware.
- [ ] Research resident-livability dimensions that are not yet scored.
  - Healthcare access/quality.
  - Connectivity and coworking reliability.
  - Longer-stay visa friction.
- [ ] Keep refining swimmable-water data.
  - The app has month-aware swim data and filters.
  - Future enhancement: show month-strip swim indicators where useful.

## Itinerary Saving And Sharing

- [ ] Redesign first-time shared itinerary landing.
  - Today a shared link always opens a read-only preview with Save a copy (which has Undo) and Dismiss, even for a visitor with no saved year.
  - If a visitor has no local itinerary yet, treat the shared route as their starting state instead of requiring an immediate "Save a copy" click.
  - Add light intro copy that explains they are viewing someone's shared year and can edit it as their own.
  - Keep the read-only preview for returning users; decide between "Start with this trip", "Customize this trip", or silent adoption with an undo/dismiss affordance.
- [ ] Add export options for a planned year.
  - Copyable text summary.
  - Print stylesheet for the itinerary board.

## My Year And Planning Flow

- [ ] Surface why each leg was picked in the picker rows ("fills Mar-Apr · São João festival · €420 cheaper than your Feb stay"). The seed engine already computes this; it is not shown.
- [ ] Finish the favorites-based itinerary builder. The "from favorites" seed style exists (`generateRoute('favorites')`, only offered when favorites exist); still missing:
  - Swap suggestions and month-by-month ranking over the favorites pool.
  - Constraints: region balance, budget, weather minimums, event preference, stay length.
  - Lock favorite stays, fill gaps, and compare generated routes before adopting one.
- [ ] Add an "Add to my year" affordance on browse cards (only when a route exists, to keep browse calm). The city sheet already has "+ Add to year" with a toast (Undo / View year).
- [ ] Improve the automatic itinerary picker.
  - Account for realistic routing and travel burden beyond straight-line distance.
  - Support fixed anchors such as "I must be in Europe in June."
  - Explain why suggested routes win.
  - Add a lock/fill interaction where the planner fills around fixed stays.
- [ ] Make visa/passport constraints actionable in route building.
  - `prefs.passport` is a stub with no Settings control.
  - My year should flag or prevent stays beyond passport-specific visa-free windows.
  - Keep Schengen as the special rolling-window rule it already is.

## Growth, Trust & Retention (from the UX audit)

- [ ] Per-page share images. Every page still shares the same `og.png`. Generate an OG card per city, month and planned year ("My Monsoon Year: avg 89, 6 stays") at build time or via a Cloudflare Worker.
- [ ] Gem-vs-anchor comparison pages (`/compare/<a>-vs-<b>`, capped to relevant pairs, `noindex` thin ones) generated from `gem x anchor x month` comparisons ("Plovdiv beats Barcelona in June"); reuse them for share cards and zero-input discovery. The in-app compare sheet and `src/lib/compare.js` findings are the starting point.
- [ ] Region pages (`/best/<attribute>-in-<region>`) and a `/best/` index page; today `/best/` has only the 12 month pages and no index, and region hubs do not exist.
- [ ] Label Best Value wins inline ("38% cheaper than Split for the same score") when Best Value is the active sort.
- [ ] Mobile: check whether the first city card is above the fold on This month; the audit asked for it and it has not been verified.
- [ ] Tasteful, value-framed email capture ("Email me my year" / "Email me November's rankings"): passwordless, never a wall; Cloudflare Worker + KV + a transactional email service.
- [ ] Periodic re-engagement: a monthly "where to be in <next month>" send that doubles as the month page, a win-back about 9-10 months after last activity, data-update nudges. Depends on email capture.

## Performance

- [ ] Core JSON is inlined in the JS bundle: the main chunk is about 590 kB (Vite warns above 500 kB). Load the core data as a separate asset, or trim fields.
- [ ] The detail JSON (about 460 kB) is fetched on every visit at idle, even if no city sheet is opened. Cache it better or fetch on first sheet open.
- [ ] Dialogs (city sheet, comparison, methodology, settings, about, how-to) are statically imported; code-split them.

## Accessibility

- [ ] Focus trapping in dialogs (sheets and dialogs move focus in and restore it on close, but Tab can leave).
- [ ] Toast pause-on-hover/focus so Undo does not disappear while the pointer is on it.
- [ ] Small type: some labels are 9-10.5px; raise to a readable floor.

## Display Options

- [ ] °C option. Temperatures are stored in °F and all go through `fmtTemp` in `data.svelte.js`, so the switch is one formatter plus a setting.
- [ ] Currency option. Costs are USD (`fmtMoney`).
- [ ] Dark mode (nothing in `src` handles `prefers-color-scheme`).

## Not Yet Seen In A Real Browser

Built and checked by reading code and running the scripts; the dev server could not be previewed in the sandbox. Verify by hand:

- [ ] My year "Save a copy" Undo bar (appears, Undo restores the old year, disappears on first edit).
- [ ] City sheet detail-load Retry state (block the detail JSON, press Retry).
- [ ] Escape closing only an open info popover, not the sheet behind it.
- [ ] Phone rotation with the My year mobile picker open: the picker closes and the page scroll lock releases.
- [ ] "Tight" Schengen wording on a real route (1-2 days over, e.g. three consecutive 31-day months plus a shoulder stay).
- [ ] Compare mode on a phone (checkbox strips, tray over the toast, Back closing the comparison).

## UI Polish

- [ ] Revisit non-blocking coachmarks only if discovery proves weak.
  - Favorites and methodology are currently expected to be discoverable.
  - Any future coaching should be contextual, dismissible, and tied to a relevant action.

## Done Or Consumed

Shipped 2026-10-03:

- [x] Shareable URL state (`src/lib/urlState.js`): `view`, `m`, `sort`, `layout`, `region`, `city`, `compare`, alongside the existing `i`/`n`/`route` share params; Back moves between views, the sheet and comparison push history.
- [x] This month: #1 answer line, city search, one dismissible colour key (persisted in `atlas.prefs.v1`), "Ranked for" lens pill, "Your year" resume line.
- [x] Compare mode: Compare toggle, tray, comparison sheet with plain-words findings, `?compare=a,b` links, session-only picks (`CompareTray.svelte`, `CompareSheet.svelte`, `compare.js`).
- [x] Schengen counts real days over every rolling 180-day window with a "Tight" state for 1-2 days over (`schengen.js`, `npm run test:schengen`).
- [x] Days per country with a 183-day signal beside the Schengen meter (`dayCount.js`, `npm run test:daycount`).
- [x] Seed generator constraints: every style is Schengen-legal and keeps each country under 183 days (`npm run check:seeds`).
- [x] Save a copy now has Undo; saved routes and favorites migrate renamed cities through `SLUG_ALIASES`, drop only unresolvable stays, and are not rewritten on boot.
- [x] City sheet provenance: "Where these numbers come from" panels (source, date, confidence), cost line items with source links, "Report this number" prefilled GitHub issue, "Data as of" line, detail-load Retry.
- [x] Methodology rewritten: per-input source/type/refreshed table, model version (v5) and `src/lib/changelog.js`; removed claims the site could not back up (advisory badges, FCDO, hero photography).
- [x] Events reconciliation (`scripts/reconcile_events.py`): 77 missing calendar entries added, no score changed; remaining mismatches listed above.
- [x] Static SEO pages (`scripts/seo/*`, `src/seo/*`): `/city/<slug>/` (111), `/best/where-to-be-in-<month>/` (12), `/cities/`, `sitemap.xml`, `llms.txt`, per-page title/canonical/OG/JSON-LD (TouristDestination, ItemList, BreadcrumbList), footer link to `/cities/`, `robots.txt` Sitemap line.
- [x] Build guards: `scripts/build.sh` runs the SEO generator and fails on private files in `dist/` or private text in generated pages (`leak-check.mjs`); `npm run build:seo` / `npm run check:seo`; `scripts/deploy.sh <branch>` for preview deploys.
- [x] Accessibility pass: named stay controls, labelled gap buttons, `aria-pressed` on party, strip-cell and card year summaries, keyboard-operable table rows.
- [x] Mobile header and sticky month bar fixes; picker strips recede when the year is full.

Shipped earlier:

- [x] Warm the empty My year board: dismissible ghost example year with seed strip, "N of 12 months planned" progress bar and completion milestone.
- [x] "Build me a year" seed styles (best quality, best value, festival, non-Schengen, from favorites) via `generateRoute(style, preset, valueModel)`; "Use this year" adopts the previewed style.
- [x] City sheet "+ Add to year" with toast (Undo / View year); the itinerary lives in a shared store (`route.svelte.js`).
- [x] Card-to-sheet view transition (title morphs card to sheet; ←/→ stepping crossfades), gated on `startViewTransition` and reduced motion.
- [x] Mobile native sharing: `shareOrCopy()` uses `navigator.share` with clipboard fallback, in the city sheet and My year.
- [x] Named saved itineraries (`atlas.route.v1` stores `{ name, stays }`, legacy bare array migrates) and trip names in share links (`n` param).
- [x] Compact shareable itinerary links with frozen v1 city IDs; read-only shared-route preview with Save a copy and Dismiss.
- [x] City deep links with `?city=<key>`.
- [x] Month-aware swimmable filtering.
- [x] Explore merged into This month as a cards/table density toggle (`layout=table`); it is no longer a separate view.
- [x] Major design pass covering P0/P1/P2/P4 and the first two P3 items from `design_updates.MD`.
- [x] Route template chips removed from My year; Schengen tracker redesigned visually.
