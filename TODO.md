# Monsoon TODO

Last consolidated 2026-10-15 (after the 2026-10-08 site hygiene and agentic-SEO work and the 2026-10-15 polish pass: events, home first screen, static pages in dark mode, the check gate). Earlier: 2026-10-03, after URL state, compare, provenance, Schengen/day-count, sourced climate and air, the derived events calendar and the static SEO pages shipped.

See `UX_RESEARCH_AUDIT.md` for the research-backed audit (usability, the "boring" My year problem, trust/freshness, retention loops, programmatic SEO), its source list and roadmap; its "Status as of 2026-10-15" note says which recommendations have shipped. The items below are the actionable slices.

## Data And Scoring

- [ ] Finish the climate and air hold-backs. The sourced inputs are applied (methodology v6: WMO 1991-2020 station normals via NOAA NCEI, ERA5 via Open-Meteo, CAMS PM2.5 scaled to the WHO air-quality database), but 107 city-metrics (940 of 6,660 city-months) keep the previous estimate, labelled as editorial on the sheet. Rules and the full list: `docs/data-changes/2026-10-03-climate-air.md`, `data/climate-air-holdbacks.json`.
  - 6 cities still to fetch from ERA5: Nha Trang, Ipoh, Skopje, Ohrid, Gdansk, Queretaro. The Open-Meteo daily quota was still exhausted at 22:31 UTC on 2026-10-03. Then `scripts/apply_climate_air.py --check`, `--write`, `rebake_scores.py`, `sanity_check.py` (steps in `docs/data-changes/2026-10-03-new-cities.md`).
  - Held back pending a better source: Sofia and Plovdiv winter PM2.5, tropical rain days where the fitted threshold moves a month by more than 4 days, highland cities with no station nearby, CAMS-to-WHO scale factors outside 0.6-2.0.
  - Licences before Monsoon earns money (affiliate links, paid tiers). The WHO Ambient Air Quality Database is CC BY-NC-SA 3.0 IGO and scaled values from it are live. Recommended replacement: EEA e-reporting annual means for the ~53 EU/EEA cities (commercial reuse allowed with acknowledgement; keyless REST API), plus the WashU ACAG V6.GL.02.04 satellite-ground PM2.5 grid (CC BY 4.0, 1998-2023) for the rest. That is a methodology change, so run a before/after diff first. Also: Open-Meteo's free API terms restrict use to non-commercial purposes, and that covers the ERA5 and CAMS fetches. A paid Open-Meteo plan or direct Copernicus CDS/ADS downloads (commercial use allowed) would fix it.
- [ ] Finish the 6 pending new cities and settle the review judgment calls. The add-a-city pipeline is merged (`scripts/add_city.py`, `data/cities/<slug>.json`, `docs/adding-a-city.md`) and the catalog is 121 (Antalya added 2026-10-03 with a cited EEA PM2.5 series).
  - Pending on a climate/air hold-back: Dakar (ERA5 humidity; PM2.5 scale 2.30, no monthly ground series found), Galle (ERA5 humidity), La Paz (ERA5), Lima (ERA5; a SENAMHI PM2.5 series is ready but its licence is unconfirmed), Montreal (ERA5), Viña del Mar (ERA5 temperature and humidity). Reasons and next steps: `docs/data-changes/2026-10-03-new-cities.md`. `python3 scripts/add_city.py --check` lists the state.
  - The 9 cities shipped earlier on 2026-10-03 were reviewed against primary sources: clear errors fixed (text, citations, Thailand and Turkey visa rules), and the owner judgment calls are listed in `docs/data-changes/2026-10-03-shipped-city-review.md`. Still open: move Almaty's point to the Medeu district (needs a CAMS refetch). Antalya's authored content has not been reviewed yet.
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

- [x] Say why in the picker rows and for generated stays: picker rows get a one-line `pickWhy` ("Semana Santa in Mar · $420/mo cheaper than your Lisbon stay"), generated stays a `legWhy` line in "Why these picks" and on mobile ghost rows (`src/lib/yearPlan.js`). Costs are USD. No "fills Mar–Apr" prefix on picker rows: the heading already says it.
- [ ] Finish the favorites-based itinerary builder. The "from favorites" seed style exists (only offered when favorites exist), and since "Fill the open months" landed it also fills around stays the user placed (pick "From favorites" in the fill panel). Still missing:
  - Swap suggestions and month-by-month ranking over the favorites pool.
  - Constraints: region balance, budget, weather minimums, event preference, stay length (the generator ignores My year's filters today).
  - Compare generated routes side by side before adopting one (today: switch style chips and watch the preview).
- [x] "+ Year" on browse cards and table rows, only when a route exists and has an open month, never in compare mode; same add flow and toast as the city sheet.
- [ ] Improve the automatic itinerary picker.
  - Account for realistic routing and travel burden beyond straight-line distance.
  - [x] Fixed anchors ("Must be in Europe in Jun", up to three; Europe, Asia, Latin America or any region), with unmet anchors reported.
  - [x] Explain why suggested routes win: the style's rule plus one line per stay (Score, festival, trim/fill, runner-up, new region). The runner-up is named without its number because the internal ranking includes the variety nudge.
  - [x] Lock/fill: "Fill the open months" treats the user's stays as locked and fills around them (Schengen-legal and under 183 days per country when the locked year is; `check:seeds` covers it). There is no per-stay lock toggle: every placed stay is a lock, by design.
- [ ] Make visa/passport constraints actionable in route building.
  - `prefs.passport` is a stub with no Settings control.
  - My year should flag or prevent stays beyond passport-specific visa-free windows.
  - Keep Schengen as the special rolling-window rule it already is.

## Growth, Trust & Retention (from the UX audit)

- [ ] Share card for a planned year ("My Monsoon Year: avg 89, 6 stays"). City, month and comparison pages have build-time cards now; a year is user state, so it needs a Cloudflare Worker rendering the card from the `?i=` link (the SVG builders in `src/seo/ogCard.js` can be reused).
- [ ] Watch the comparison pages in Search Console before adding more. Submit `sitemap.xml` (an index; `sitemap-compare.xml` is its own segment) and watch the indexed:submitted ratio for `/compare/` for 2-3 weeks (GROWTH_ENGINE_PLAN §10). Only then loosen the gate in `src/seo/pairing.js` or add per-month pages; if the ratio is low, tighten it. Read the 74 published claims once by hand (`node scripts/seo/pairing-report.mjs`, `tmp/seo/pairs.csv`).
- [ ] Comparison pages: curated human signal for the strongest pairs (one link or video per city, `data/seo/curations.json`, GROWTH_ENGINE_PLAN §6.4) and funnel analytics, now unblocked: `entry` events carry `?from=` attribution from static pages, and `npm run report:events` (needs `CF_ACCOUNT_ID` and `CF_API_TOKEN`) prints them. There is no `seo_cta_click` event; `entry` replaces it.
- [ ] Region hubs exist only for regions with 8+ cities. N Europe, E Asia, Africa, Oceania and W Asia get none; consider merged hubs (e.g. "Northern and Western Europe") if those regions grow, and southern-hemisphere seasonal hubs for South America.
- [x] Label Best Value wins inline on cards when Best Value is the sort (`src/lib/valueWin.js`). Labels are deliberately sparse (about 3-8 of 120 cities a month): a city beaten on both score and cost, or saving under 10%, keeps its usual finding. The table has no finding line, so it shows no label.
- [x] Mobile: the first city card is above the fold on This month at 390x664 (verified 2026-10-15, see "Not Yet Seen" below); the home phone first screen is one control row plus a Refine sheet (`src/lib/RefineSheet.svelte`, `src/lib/ThisMonth.svelte`).
- [ ] Tasteful, value-framed email capture ("Email me my year" / "Email me November's rankings"): passwordless, never a wall; Cloudflare Worker + KV + a transactional email service.
- [ ] Periodic re-engagement: a monthly "where to be in <next month>" send that doubles as the month page, a win-back about 9-10 months after last activity, data-update nudges. Depends on email capture.

## Garrett's checklist (outside the repo)

- [ ] Before deploying: in the Cloudflare dashboard (Workers & Pages, `monsoon`, Settings, Bindings and Variables) confirm there are no dashboard-only bindings or variables, because `wrangler.toml` now owns them. Confirm Analytics Engine is enabled on the account.
- [ ] Set `CF_ACCOUNT_ID` and `CF_API_TOKEN` (token: Account Analytics Read) in your shell for `npm run report:events`.
- [ ] Deploy with `npm run deploy`, then run `npm run check:live`.
- [ ] Google Search Console: add a Domain property for `monsoon.fyi` (DNS TXT) and submit `https://monsoon.fyi/sitemap.xml`.
- [ ] Bing Webmaster Tools: Import from Google Search Console.
- [ ] Set reminders for +14 and +21 days after submission: read Pages indexed vs submitted for `sitemap-compare.xml` (the gate for loosening `src/seo/pairing.js`) and run `npm run report:events -- --days 28`.

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
  - [x] Static pages follow `prefers-color-scheme: dark` (dark tokens lifted at build time into `src/seo/styles.js`, screen only, no script; print stays light). Shipped 2026-10-15.
  - [x] Light "good" and "ok" band cells and swatches have a 1px inner edge (`--band-good-edge`, `--band-ok-edge` in `src/app.css`, 3:1 against paper; transparent in dark). The fills themselves are unchanged and still under 3:1 (1.93); the edge carries the contrast.

## Not Yet Seen In A Real Browser

Ticked items were verified in a real browser on 2026-10-03 (rotation by viewport emulation, not a device). The rest were built and checked by reading code and running the scripts; verify by hand:

- [x] My year "Save a copy" Undo bar (appears, Undo restores the old year, disappears on first edit).
- [x] City sheet detail-load Retry state (block the detail JSON, press Retry).
- [x] Escape closing only an open info popover, not the sheet behind it.
- [x] Phone rotation with the My year mobile picker open: the picker closes and the page scroll lock releases.
- [x] "Tight" Schengen wording on a real route (1-2 days over, e.g. three consecutive 31-day months plus a shoulder stay).
- [x] Compare mode on a phone (checkbox strips, tray over the toast, Back closing the comparison).
- [x] Dark mode on every surface (This month cards and table, city sheet, comparison, My year board, picker and mobile picker, Settings, About, How-to, Methodology, toasts): nothing reads as a light-mode leftover, band labels and the hazard hatch stay legible, focus rings show, the Settings switch knob reads off and on, and opacity-dimmed ghost or disabled text (My year ghost year and duration buttons, This month icons, the compare checkbox when off) is still readable. Then: no flash on reload in dark (System and forced Dark), System following an OS switch live, Print from dark gives the light page, the iOS status bar colour (theme-color).
  - Verified 2026-10-15, Playwright/Chrome, viewport emulation (1280 and 390): This month cards and table, city sheet, comparison, My year board, desktop picker, mobile picker and fill panel, Settings, How it works, About, Methodology, the Refine sheet, the toast and compare tray: no light-mode leftovers, no overflow (`scrollWidth <= innerWidth` on every shot). Screenshots (scratchpad `monsoon/verify/`): `dark-{month-cards,month-table,sheet,compare,year,year-fill,settings,howto,about,method}-{desk,phone}-dark.png`, `refine-sheet-390-dark.png`, `pickerwhy-mobile-dark.png`; static pages `static-{best-month,city,cities,compare-index,best-index}-{desk,phone}-dark.png`.
  - Also verified: forced Dark and System-dark both paint `rgb(25, 27, 22)` on `<html>` at DOMContentLoaded after a reload (no flash); System follows an emulated OS scheme change live (light, dark, light); print from dark gives the light page (`print-from-dark-desk.png`); the `theme-color` meta is `#191b16` in dark and `#f6f1e6` in light.
  - Wave 1 checks, same date and method: M2 fold at 390x664 shows the "Oct." heading, the answer line, the one control row and the whole first card (top 387px, bottom 567px) with no overflow, in light and dark (`m2-fold-390x664-{light,dark}.png`, `refine-sheet-390-{light,dark}.png`). M3 static pages follow `prefers-color-scheme: dark` (body `rgb(25, 27, 22)`) on `/best/where-to-be-in-october/`, `/city/lisbon/`, `/cities/`, `/compare/` and `/best/` at 1280 and 390 with no overflow, and keep the light page in light (`static-*-dark.png`, `static-best-month-desk-light.png`). M4's 1px edge on good and ok cells is present in light (`rgb(183, 126, 27)` inset on the static page's ok cell) and transparent in dark (`m4-edge-desk-{light,dark}.png`).
  - Not verified headless: how iOS Safari actually tints the status bar (only the meta value is checked), real-device focus rings and the hazard hatch at 1x on a phone, and a real OS theme switch. The Settings control is a segmented control, so there is no switch knob to inspect.
- [x] Currency: switch to each of EUR/GBP/CAD/AUD and check cards, table, sheet (total, breakdown, line items, the conversion note), comparison, My year totals and rail, Max cost filters, Copy as text (note line at the end); the five-code control fits a 320px phone.
  - Verified 2026-10-15, Playwright/Chrome, viewport emulation (1280, and 320 for the control): EUR (€), GBP (£), CAD (CA$) and AUD (A$) show no bare `$` amount on cards, table, sheet, comparison or My year; the sheet's rent line and conversion note ("Costs in EUR are converted from US dollars at ECB reference rates of 2 Oct 2026, so they are estimates."), the Refine Max cost options (e.g. €1,336 / €1,782 / €2,227) and the Copy as text note line all follow the currency. The five-code control is 228px wide inside a 320px viewport in light and dark, no overflow. Screenshots: `currency-{EUR,GBP,CAD,AUD}-{cards,table,sheet,year}-desk-light.png`, `currency-{EUR,CAD}-sheet-cost-desk-light.png`, `currency-{EUR,AUD}-refine-desk-light.png`, `currency-control-320-{light,dark}.png`.
- [x] Card "+ Year": hover reveal, alignment on the meta row, tag wrapping on a narrow Schengen card with a hazard tag, always-on pill on touch; table "+" does not open the sheet; both show the add toast.
  - Verified 2026-10-15, Playwright/Chrome, viewport emulation (1280 mouse; 390 and 320 touch): the pill is opacity 0 at rest and 1 on hover on desktop, vertically centred on the cost (585 vs 584 px), and always on (opacity 1 on all 48 cards) on touch. Card "+ Year" and table "+" each show the toast ("Added Busan to Oct–Nov", "Added San Miguel de Allende to Dec · Oct was taken") and open no sheet. No tag or cost overlaps the pill on any of 48 cards at 390 or 320. Screenshots: `plusyear-desk-light-hover-m5.png`, `plusyear-desk-light-toast-m5.png`, `plusyear-table-desk-light-m5.png`, `plusyear-schengen-hazard-{320,390}-light-m5.png`.
  - 2026-10-15 defect, fixed (CSS only, `src/lib/CityCard.svelte`): on a 320px phone a Schengen card with a hazard tag let the tags run under the "+ Year" pill. Tags are now `white-space: nowrap` and tighter under 340px; they wrap above the pill instead (`plusyear-schengen-hazard-320-light-m5.png`).
- [x] Best Value win labels read well and truncate cleanly to one line.
  - Verified 2026-10-15, Playwright/Chrome, viewport emulation (1280 light, 390 dark and light, 320): Oct has four labelled cities ("16% cheaper than Antalya for the same score" through "21% cheaper than Dumaguete for nearly the same score"); each is one line (22px, line-clamp 1) and the long ones end in an ellipsis at 320 ("21% cheaper than Dumaguete for nearly t…"). Screenshots: `bestvalue-label-{320-light,390-dark,1280-light}.png`, `bestvalue-label-long-{320-light,390-dark,1280-light}.png`, `bestvalue-{desk1280,phone390,narrow320}-*.png`. At 320 the "for nearly the same score" tail is the part that is cut; the percentage and the reference city stay visible.
- [x] My year picker-row why lines (desktop and the mobile sheet).
  - Verified 2026-10-15, Playwright/Chrome, viewport emulation (1280, 390 light and dark): 30 rows carry a why line, e.g. "Semana Santa in Mar · $690/mo cheaper than your Lisbon stay · great all Mar–Apr"; on the phone sheet they sit under the strip at two lines with a trailing ellipsis and no overflow. Screenshots: `pickerwhy-desk-light.png`, `pickerwhy-mobile-{light,dark}.png`.
- [x] Fill the open months: ghost suggestions on the desktop board (no `+` under them) and in the mobile list, anchor selects (disabled planned months, wrap at 375px), unmet note, "Why these picks", Add → Undo / Keep banner and focus, Cancel focus, print preview while filling.
  - Verified 2026-10-15, Playwright/Chrome, viewport emulation (1280; 375 light and dark; 320 for the anchor row): ghost stays on the desktop board (3, no `+` buttons under them) and ghost rows in the mobile list (3, no "Add a city"); focus lands on "Fill your open months."; anchor Month options disable the planned months (Jan, Feb, May, Jun, Sep) and the anchor row stays inside 375 and 320 (it wraps); "N America in Mar" gives "No city in N America fits Mar with this style and the Schengen and 183-day limits." plus "1 month stays open: nothing else fits."; "Why these picks" opens; Add 3 stays gives the "Filled your open months" banner with focus on Undo (3 stays to 6), Undo returns to 3, and Cancel returns focus to the "Fill the open months" button. Screenshots: `fill-desk-light.png`, `fill-desk-anchor-light.png`, `fill-desk-why-light.png`, `fill-desk-added-light.png`, `fill-{375-light,375-dark,320-light}.png`, `fill-375-full-light.png`.
  - 2026-10-15 defect, fixed (CSS only, `src/lib/MyYear.svelte` print block): printing while filling hid the suggested stays but still printed the stats row ("WITH SUGGESTIONS", avg score and 12-month total counting them), which disagreed with the printed stay list (`fill-desk-print.png`). The ghost stats are now hidden in print (`fill-desk-print-fixed.png`).
  - 2026-10-15 note: after Undo on the fill banner, focus falls back to the "My year." heading rather than the "Fill the open months" button; harmless, left as is.

## UI Polish

- [ ] Revisit non-blocking coachmarks only if discovery proves weak.
  - Favorites and methodology are currently expected to be discoverable.
  - Any future coaching should be contextual, dismissible, and tied to a relevant action.

## Done Or Consumed

Shipped 2026-10-15 (polish pass, merged on `polish/2026-10`):

- [x] First-party event sink: `POST /api/e` (`functions/api/e.js`) writes to Analytics Engine dataset `monsoon_events` (bound in `wrangler.toml`); `track()` in `src/lib/analytics.js`; allowlist checked by `npm run test:events`; read with `npm run report:events [days]`. Cookie-free, off in dev and under Global Privacy Control, with a privacy line in the footer. Plausible/PostHog branches removed.
- [x] `entry` events: a static-page link to the app carries `?from=<page-type>` (`src/seo/derive.js`, `ENTRY_FROM` in `src/lib/analytics.js`); `App.svelte` sends one `entry` event with the surface. The month page's end-of-list ghost link carries `from=best-month` too.
- [x] Home first screen on phones: one control row and a Refine sheet (`src/lib/RefineSheet.svelte`); the first card is above the fold at 390x664.
- [x] Static pages: dark mode, end-of-list "Build a year" CTA, a trust line and a dateline on month and region pages (`src/seo/MonthPage.svelte`, `RegionPage.svelte`, `styles.js`).
- [x] Band edge tokens for the light good/ok cells (`src/app.css`).
- [x] `npm run check:live` (`scripts/seo/check-live.mjs`): read-only probe of production or a preview (`--base`): sitemap URLs return 200 HTML with matching canonical and no noindex, `www` 301s to the apex, `/llms.txt` and `/llms-full.txt` exist.
- [x] `npm run check` (tests, `check:seeds`, `check:ids`) and `npm run check:build` (build plus `check:seo`); `scripts/deploy.sh` runs `check` first (`SKIP_CHECKS=1` skips it) and `check:seo` after the build, and aborts on failure.
- [x] `.github/workflows/check.yml` runs `check` and `check:build` on pull requests and pushes to main. It is a separate commit (114a665) and reverses the README's old "no CI" stance; drop it if Garrett wants GitHub out of the loop.
- [x] Real-browser verification of the Not Yet Seen checklist, with two CSS fixes (below).

Shipped 2026-10-08 (site hygiene, agentic SEO, Best Value):

- [x] Real 404 page (`public/404.html`), favicon set and web manifest (`public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest`), Pages `public/_headers` (HSTS, nosniff, frame and referrer policy) and `public/_redirects` (`www` to apex 301, effective once www is attached to the Pages project), and `WebSite`/`Organization`/`WebApplication` JSON-LD on the home page (`index.html`).
- [x] `llms-full.txt` (full text of all static pages, written by `scripts/seo/build-seo.mjs`) and explicit allows for AI crawlers in `public/robots.txt` (GPTBot, ClaudeBot, PerplexityBot and others).
- [x] Best Value cost weight: the default exponent is 0.10 (`DEFAULT_COST_WEIGHT` in `src/lib/data.svelte.js`) and a "How much cost counts" dial (`src/lib/CostWeight.svelte`, `cw` in the URL via `src/lib/urlState.js`) lets the user change it.

Shipped 2026-10-03 (growth pages):

- [x] `/best/` index linking the 12 month pages and the region hubs.
- [x] Region hubs `/best/<attribute>-in-<region>/` (cheapest, safest, cleanest air, winter, summer) behind a substance gate; thin ones are not built.
- [x] Comparison pages `/compare/<subject>-vs-<anchor>/` plus a `/compare/` index, selected by the Value Floor gate in `src/seo/pairing.js` from the anchor list in `data/seo/fame.json`, written from `compareFindings` and the month data, linking into `?compare=a,b`.
- [x] `Dataset` JSON-LD on `/cities/`; segmented sitemaps (`sitemap.xml` is an index).
- [x] Per-page share images for city, month and comparison pages, rendered at build time with `@resvg/resvg-js`; the default `og.png` is regenerated from data (it said 111 cities and "Top pick").
- [x] Build guards, leak check and `check:seo` cover `compare/` and `og/`.

Shipped 2026-10-03:

- [x] Shareable URL state (`src/lib/urlState.js`): `view`, `m`, `sort`, `layout`, `region`, `city`, `compare`, alongside the existing `i`/`n`/`route` share params; Back moves between views, the sheet and comparison push history.
- [x] This month: #1 answer line, city search, one dismissible colour key (persisted in `atlas.prefs.v1`), "Ranked for" lens pill, "Your year" resume line.
- [x] Compare mode: Compare toggle, tray, comparison sheet with plain-words findings, `?compare=a,b` links, session-only picks (`CompareTray.svelte`, `CompareSheet.svelte`, `compare.js`).
- [x] Schengen counts real days over every rolling 180-day window with a "Tight" state for 1-2 days over (`schengen.js`, `npm run test:schengen`).
- [x] Days per country with a 183-day signal beside the Schengen meter (`dayCount.js`, `npm run test:daycount`).
- [x] Seed generator constraints: every style is Schengen-legal and keeps each country under 183 days (`npm run check:seeds`).
- [x] Save a copy now has Undo; saved routes and favorites migrate renamed cities through `SLUG_ALIASES`, drop only unresolvable stays, and are not rewritten on boot.
- [x] City sheet provenance: "Where these numbers come from" panels (source, date, confidence), cost line items with source links, "Report this number" prefilled GitHub issue, "Data as of" line, detail-load Retry.
- [x] U.S. advisories refreshed from the State Department feed on 2026-10-03 (`scripts/refresh_advisories.py`): Thailand, Romania, Austria, Ireland and Thessaloniki now Level 1; 83 advisory dates corrected to the feed's publish date. Display only, no score moved.
- [x] Add-a-city pipeline merged and 9 cities added (catalog 120): per-city input files with a schema, `add_city.py` bakes one record and proves every existing record is unchanged.
- [x] Sourced climate and PM2.5 applied (methodology v6): station normals, ERA5 and WHO-scaled CAMS, with unverifiable values held back and labelled; licences shown per source. Data-change log in `docs/data-changes/`.
- [x] Events score derived from the visible calendar (`reconcile_events.py --check-derived` is the invariant): the 16 month conflicts and the major-tier mismatches are resolved, 322 city-months changed tier.
- [x] Methodology rewritten: per-input source/type/refreshed table, model version (now v6) and `src/lib/changelog.js`; removed claims the site could not back up (advisory badges, FCDO, hero photography).
- [x] Events reconciliation (`scripts/reconcile_events.py`): 77 missing calendar entries added before the derive above.
- [x] Static SEO pages (`scripts/seo/*`, `src/seo/*`): `/city/<slug>/` (111 at the time, now 121), `/best/where-to-be-in-<month>/` (12), `/cities/`, `sitemap.xml`, `llms.txt`, per-page title/canonical/OG/JSON-LD (TouristDestination, ItemList, BreadcrumbList), footer link to `/cities/`, `robots.txt` Sitemap line.
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
