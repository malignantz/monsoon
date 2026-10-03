# Monsoon TODO

Last consolidated: 2026-10-03 (after URL state, compare, provenance, Schengen/day-count, sourced climate and air, the derived events calendar and the static SEO pages shipped).

See `UX_RESEARCH_AUDIT.md` for the research-backed audit (usability, the "boring" My year problem, trust/freshness, retention loops, programmatic SEO), its source list and roadmap; its "Status as of 2026-10-03" note says which recommendations have shipped. The items below are the actionable slices.

## Data And Scoring

- [ ] Finish the climate and air hold-backs. The sourced inputs are applied (methodology v6: WMO 1991-2020 station normals via NOAA NCEI, ERA5 via Open-Meteo, CAMS PM2.5 scaled to the WHO air-quality database), but 107 city-metrics (940 of 6,660 city-months) keep the previous estimate, labelled as editorial on the sheet. Rules and the full list: `docs/data-changes/2026-10-03-climate-air.md`, `data/climate-air-holdbacks.json`.
  - 6 cities still to fetch from ERA5 (Open-Meteo quota): Nha Trang, Ipoh, Skopje, Ohrid, Gdansk, Queretaro. Then `scripts/apply_climate_air.py --check`, `--write`, `rebake_scores.py`, `sanity_check.py`.
  - Held back pending a better source: Sofia and Plovdiv winter PM2.5, tropical rain days where the fitted threshold moves a month by more than 4 days, highland cities with no station nearby, CAMS-to-WHO scale factors outside 0.6-2.0.
  - The WHO Ambient Air Quality Database is CC BY-NC-SA 3.0 IGO and scaled values from it are live. Settle the non-commercial question before Monsoon earns money (affiliate links, paid tiers), or swap the annual means for an openly licensed source.
- [ ] Finish the 7 pending new cities and read the 9 that shipped. The add-a-city pipeline is merged (`scripts/add_city.py`, `data/cities/<slug>.json`, `docs/adding-a-city.md`) and the catalog is 120.
  - Shipped 2026-10-03 without an owner read of the authored content (safety inputs, costs, narratives, events): Agadir, Alicante, Almaty, Busan, Costa Adeje, Fukuoka, Hua Hin, Izmir, Phuket.
  - Authored but pending on a climate/air hold-back: Antalya, Dakar, Galle, La Paz, Lima, Montreal, Viña del Mar. `python3 scripts/add_city.py --check` lists the state.
- [ ] Decide what to do with the unshipped FCDO layer and city photos. `scripts/build_fcdo.py` output is not baked into the data (no `advisoryUK`), and `data/city-media.json` hero paths are in the data but no images ship and no surface shows them. Either finish and ship, or remove the dead pipeline. State and what each option takes: `docs/dead-pipelines.md`.
- [ ] Create a comprehensive visa information plan.
  - Define the user-facing scope before restoring visa details to city views (`city.visa` is in `data/travel-data.json` but rendered nowhere, so it was dropped from the core bundle; add it back to `CORE_CITY` in `scripts/split-data.mjs` when a surface shows it).
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

- [x] Redesign first-time shared itinerary landing: a visitor with no saved year gets the shared route as their starting year with a one-line note and Keep it / Undo; returning visitors keep the read-only preview (Save a copy with Undo, Show my year). Adding a city during a preview says it went to their own year. See `docs/itinerary-sharing.md`.
- [x] Add export options for a planned year: Copy as text in My year (stays, scores, party costs, totals, Schengen, longest country, share link) and a one-page print stylesheet.

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

- [x] Entry chunk down from 590 kB (126 kB gzip) to about 435 kB (91 kB gzip): `visa` dropped from the core JSON, which stays inlined (many modules read `cities` at import time). A columnar month encoding would save another ~150 kB raw but only ~4.5 kB gzip; not done.
- [x] The detail JSON (now about 430 kB, 75 kB gzip; `media` dropped) is fetched on first intent: card/row hover, focus or touch, or a sheet, comparison or methodology opening.
- [x] Dialogs (city sheet, comparison, methodology, settings, about, how-to) and My year are code-split (`src/lib/lazy.svelte.js`) and prefetched on intent.

## Accessibility

- [x] Focus trapping in dialogs: one `focusTrap` action (`src/lib/focusTrap.js`) for every dialog, sheet and the mobile picker; Escape closes only the topmost layer.
- [x] Toast pause-on-hover/focus so Undo does not disappear while the pointer is on it; announced through an always-mounted live region.
- [x] Small type: labels raised to 11px and sentence-like text to 12px (glyph icons such as the "i" dots and festival stars excepted).

## Display Options

- [x] °C option: Settings → Temperatures, stored in `atlas.settings.v1`; defaults to °F for en-US and °C otherwise. Static pages stay °F.
- [x] Currency option: Settings → Currency (USD, EUR, GBP, CAD, AUD), stored in `atlas.settings.v1`; defaults from the first browser language's region (see README). Display only, through `fmtMoney`, at checked-in ECB rates (`src/lib/fxRates.json`, refresh with `npm run update:fx`) with the date shown in Settings, the sheet's cost panel and Copy as text. Best Value and scores stay USD; static pages stay USD.
  - [ ] Refresh the rate table now and then (`npm run update:fx`); nothing reminds anyone today. Converted Max cost filter options read as uneven amounts (e.g. €1,639) because the caps are USD steps.
- [x] Dark mode: Settings → Appearance (System / Light / Dark), stored as `theme` in `atlas.settings.v1`; dark tokens in `src/app.css` under `@media screen` (print stays light), set before paint by `index.html`, kept live by `src/lib/theme.js`. Contrast ratios in README → Brand And UI.
  - [ ] Static pages stay light (they lift only the light `:root` block). Adding a `prefers-color-scheme` copy of the dark tokens to `src/seo/styles.js` is cheap once the SEO work settles; its one literal (`.btn.primary:hover` white text) would need a token.
  - [ ] The light theme's "good" and "ok" band fills are under 3:1 against paper (1.93) and equal in lightness to each other; the skyline heights carry it. Worth a deliberate look if the bands are ever retuned.

## Not Yet Seen In A Real Browser

Built and checked by reading code and running the scripts; the dev server could not be previewed in the sandbox. Verify by hand:

- [ ] My year "Save a copy" Undo bar (appears, Undo restores the old year, disappears on first edit).
- [ ] City sheet detail-load Retry state (block the detail JSON, press Retry).
- [ ] Escape closing only an open info popover, not the sheet behind it.
- [ ] Phone rotation with the My year mobile picker open: the picker closes and the page scroll lock releases.
- [ ] "Tight" Schengen wording on a real route (1-2 days over, e.g. three consecutive 31-day months plus a shoulder stay).
- [ ] Compare mode on a phone (checkbox strips, tray over the toast, Back closing the comparison).
- [ ] Dark mode on every surface (This month cards and table, city sheet, comparison, My year board, picker and mobile picker, Settings, About, How-to, Methodology, toasts): nothing reads as a light-mode leftover, band labels and the hazard hatch stay legible, focus rings show, the Settings switch knob reads off and on, and opacity-dimmed ghost or disabled text (My year ghost year and duration buttons, This month icons, the compare checkbox when off) is still readable. Then: no flash on reload in dark (System and forced Dark), System following an OS switch live, Print from dark gives the light page, the iOS status bar colour (theme-color).
- [ ] Currency: switch to each of EUR/GBP/CAD/AUD and check cards, table, sheet (total, breakdown, line items, the conversion note), comparison, My year totals and rail, Max cost filters, Copy as text (note line at the end); the five-code control fits a 320px phone.

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
- [x] Add-a-city pipeline merged and 9 cities added (catalog 120): per-city input files with a schema, `add_city.py` bakes one record and proves every existing record is unchanged.
- [x] Sourced climate and PM2.5 applied (methodology v6): station normals, ERA5 and WHO-scaled CAMS, with unverifiable values held back and labelled; licences shown per source. Data-change log in `docs/data-changes/`.
- [x] Events score derived from the visible calendar (`reconcile_events.py --check-derived` is the invariant): the 16 month conflicts and the major-tier mismatches are resolved, 322 city-months changed tier.
- [x] Methodology rewritten: per-input source/type/refreshed table, model version (now v6) and `src/lib/changelog.js`; removed claims the site could not back up (advisory badges, FCDO, hero photography).
- [x] Events reconciliation (`scripts/reconcile_events.py`): 77 missing calendar entries added before the derive above.
- [x] Static SEO pages (`scripts/seo/*`, `src/seo/*`): `/city/<slug>/` (111 at the time, now 120), `/best/where-to-be-in-<month>/` (12), `/cities/`, `sitemap.xml`, `llms.txt`, per-page title/canonical/OG/JSON-LD (TouristDestination, ItemList, BreadcrumbList), footer link to `/cities/`, `robots.txt` Sitemap line.
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
