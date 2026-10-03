# Monsoon.fyi

Monsoon is a seasonal migration planner for slow travelers, digital nomads, and expatFIRE people deciding when to be where. Nomad List tells you where; Monsoon tells you when.

The product scores 120 cities month by month across weather, air quality, safety, seasonality, events, and cost. The core use case is a traveler who can stay somewhere for one to three months and wants a year that is livable, affordable, and compliant with Schengen 90/180 constraints.

## Product Shape

- This month: ranked cards or a dense table (`layout=table`) answering "Where should I be in this month?" A one-line #1 answer sits under the headline, a city search finds places by name or country (accent-insensitive), and a dismissible colour key explains the strip. A "Ranked for" pill appears only when the lens is not Balanced (or women's safety is blended). Returning users with a saved year get a "Your year: N stays · avg score · Resume" line. Once a year exists (and still has an open month), cards and table rows offer "+ Year", which adds a two-month stay from the viewed month through the same flow and toast (Undo / View year) as the city sheet. With Best Value as the card sort, a card's finding line becomes a plain win when there is an honest one ("18% cheaper than Nha Trang for the same score": the cheapest city in the list scoring the same or up to two points higher, at least 10% dearer, and no city beating it on both score and cost; `src/lib/valueWin.js`).
- Compare: a Compare toggle adds a checkbox to each card or row; 2 to 3 picks open a comparison sheet (month strip, score bars, climate, safety, cost, Schengen, events) with plain-words findings, under the active lens, party size and value model. Picks live in `sessionStorage`; the city sheet has its own Compare toggle.
- City sheet: full-screen detail for one city and selected month. Each group (month, safety, cost) has a "Where these numbers come from" panel with source, date, confidence and type; cost line items link to their sources; "Report this number" opens a prefilled public GitHub issue. If the detail layer fails to load the safety block offers Retry.
- My year: editable itinerary builder with local storage, shareable URLs, "Build me a year" seed styles, Copy as text and a one-page print layout. Picker rows say in one line why a city fits the window it would fill (headline event, cheaper than the neighbouring stay, outside Schengen when the budget is low, great weather, new region). On a partial year "Fill the open months" previews generated stays around the user's own (which stay locked) and adds them with an Undo / Keep banner; both the empty-board example and the fill take up to three "Must be in <place> in <month>" anchors and have a "Why these picks" list (the style's rule and one line per stay: Score, festival, how it fit, the runner-up). The generator is `planYear` in `data.svelte.js`; copy and anchor places are in `src/lib/yearPlan.js`. A shared link becomes a first-time visitor's starting year (Keep it / Undo); a visitor with a saved year gets a read-only preview with Save a copy (with Undo). See `docs/itinerary-sharing.md`. The Schengen meter counts real days over every rolling 180-day window; 1-2 days over reads "Tight" rather than legal or breached. Beside it, days per country flag any country at 183+ days (a planning signal, not tax advice). Saved routes and favorites migrate renamed cities through `SLUG_ALIASES`.
- Methodology: a dialog with a per-input table (source, type, last refreshed), the model version (v6) and a changelog (`src/lib/changelog.js`).
- Static pages: build-time HTML for crawlers and link previews: `/city/<slug>/` (120), `/best/where-to-be-in-<month>/` (12), `/cities/`, `sitemap.xml` and `llms.txt`. They are separate from the SPA and link into it.

The month strip is the signature primitive: 12 cells, one per month, colored by Score band. It appears on browse cards, city sheets, and route-picking rows.

Browse and share state lives in the query string (`src/lib/urlState.js`): `view=year`, `m=<month>`, `sort=value`, `layout=table`, `region=<slugs>`, `city=<key>`, `compare=<a>,<b>[,<c>]`. Defaults emit no params. City and compare links also pin `m`. Itinerary share links use `?i=<base64url>` (frozen city IDs), with `n=` for the trip name and `?route=` as a readable fallback; other params (utm_*, etc.) pass through untouched.

## Brand And UI

Monsoon should feel like a modern field atlas: measured, trustworthy, well-traveled, and data-rich without dashboard theater. Use warm paper surfaces, near-black olive ink, restrained terracotta markings, Schengen blue only for Schengen concepts, Fraunces for display, Schibsted Grotesk for body, and Spline Sans Mono for comparable numbers.

Avoid SaaS dashboard cliches, primary map navigation, side-by-side Score and Best Value numbers on cards, and methodology math on browse surfaces. Browse should stay calm: one headline number, the strip, one plain finding.

Colour lives in tokens in `src/app.css`; components use `var(--…)` (translucent washes use the channel triplets, `rgb(var(--ink-rgb) / 0.1)`, with `--shade-rgb` for shadows and `--scrim` for dialog backdrops). The only literals left are alpha masks, the print-only greys in My year, and the two theme-color values in `src/lib/theme.js` (mirrored in `index.html`).

Dark mode is the same atlas read by lamplight, not a dark dashboard: warm olive-black paper (`#191b16`, never blue-grey), parchment ink (`#ece6d6`), a lifted terracotta (`#e27a56`) and a lightened Schengen blue (`#93b2e8`). Settings → Appearance offers System (the default, following `prefers-color-scheme` live), Light and Dark, saved as `theme` in `atlas.settings.v1`. An inline script in `index.html` sets `data-theme` on `<html>` before first paint (no flash); `src/lib/theme.js` repeats the same rule at runtime, so keep the two in step. The dark tokens sit inside `@media screen`, so printing always uses the light page. The static pages lift only the light `:root` block and stay light.

Contrast (WCAG ratios, light / dark). Text on surfaces: ink on paper 13.96 / 13.93; ink-2 5.78 / 9.16; ink-3 on paper 4.96 / 6.66 and on card 5.36 / 6.11; terra 4.64 / 5.91; terra-deep 6.65 / 8.09; teal 5.74 / 7.42; Schengen blue on paper 6.70 / 8.08 and on its soft fill 6.19 / 6.72; the "tight" amber text 5.16 / 9.32. Labels on band fills: great 5.68 / 5.84, good 5.62 / 8.05, ok 5.74 / 6.39, avoid 5.39 / 4.56. Band fills against paper: great 5.74 / 5.90, good 1.93 / 10.38, ok 1.93 / 7.78, avoid 5.17 / 3.52 (light good and ok are under 3:1; the strip's skyline heights and the printed scores carry the meaning). Between bands (lightness only; hue differs in every pair): great/good 2.97 / 1.76, good/ok 1.00 / 1.34, ok/avoid 2.69 / 2.21, great/avoid 1.11 / 1.68. Schengen blue against the bands is separated by hue (1.04 to 3.48 in lightness), and is never a band colour.

## Scoring Snapshot

The headline Score is computed from stored component scores using the default (Balanced) lens:

```text
Score = SafetyFloor * (0.35 Weather + 0.24 Safety + 0.18 Air + 0.13 Season + 0.10 Events)
```

The app can re-weight client-side with Optimize for lenses:

- Balanced: the default model.
- Livability: weather, safety, and air only, with a small peak-season deduction.
- High season: events and season get more weight while preserving guardrails.

Best Value is a unitless Score-versus-cost index:

```text
Best Value = Score / (monthly party cost / 1000) ^ value_cost_exponent
```

Cost is itemized from `data/cost-evidence/*.json`, party-scaled from a solo nomad anchor, and seasonally adjusted on rent only.

Safety is a custom v3 index: homicide-anchored violent safety, hand-set property safety, and a visitor-risk modifier. The U.S. State Department advisory is shown for reference only (in the city sheet's safety source panel and on the static city pages) and never changes a score. Women's safety is displayed separately and can be blended into safety through user settings.

## Data And Build Notes

- Svelte + Vite SPA, no backend, plus a build-time static page generator (`scripts/seo/`, `src/seo/`).
- `data/travel-data.json` is split into generated runtime files under `src/generated/`: `travel-core.json` is bundled into the JS, `travel-detail.json` (safety breakdown, narratives, climate fields, provenance) is fetched on first intent (a city hovered, focused or touched, or a sheet, comparison or methodology opening). My year and every dialog are code-split and load on first use (`src/lib/lazy.svelte.js`).
- State persists in `localStorage`: `atlas.route.v1` (itinerary), `atlas.settings.v1`, `atlas.favorites.v1`, `atlas.prefs.v1`, and `atlas.route.filters.v1` (My year filters). The in-progress comparison is in `sessionStorage` (`atlas.compare.v1`).
- `atlas.settings.v1` (Settings dialog, saved on close) holds `party` (`solo` | `couple`), `womensSafety`, `units` (`C` | `F`), `currency` (`USD` | `EUR` | `GBP` | `CAD` | `AUD`), `theme` (`system` | `light` | `dark`, default `system`; also read before paint by `index.html`) and `passport` (a stub). Units and currency default from the first browser language until the first save: °F for `en-US`, else °C; GBP for a UK region, CAD for `-CA`, AUD for `-AU`, EUR for a eurozone region (or a region-less eurozone language such as `de`), otherwise USD.
- Currency is display only. Costs, Best Value and every score stay in US dollars; `fmtMoney` (`src/lib/data.svelte.js` over `src/lib/currency.js`) converts at the checked-in ECB reference rates in `src/lib/fxRates.json` (the date is shown in Settings and beside converted costs). Refresh them by hand with `npm run update:fx` and commit the file; builds never fetch. "Report this number" issues quote the stored USD value, and static pages are always USD (and °F).
- Shared routes emit compact `?i=<base64url>` URLs using frozen city IDs in `src/lib/cityIds.v1.js`. Run `npm run check:ids` when cities are added.
- `scripts/build.sh` is the real build: `vite build`, then `scripts/seo/build-seo.mjs` (city, month and cities-index pages, `sitemap.xml`, `llms.txt` written into `dist/`), then a guard that fails if any private input file is in `dist/`, then `scripts/seo/leak-check.mjs` (fails if private input text appears in a generated page). `npm run build` alone is only `vite build`. Static pages render only fields allowlisted in `src/seo/publicData.js`.
- Deploy: `npm run deploy` runs `scripts/deploy.sh`, which runs `build.sh` and uploads `dist/` to the Cloudflare Pages project `monsoon` with wrangler (direct upload; a git push deploys nothing). `scripts/deploy.sh <branch>` uploads a preview and prints a `*.pages.dev` URL; with no argument it is a production deploy to monsoon.fyi.
- New cities go through one command: `python3 scripts/add_city.py <slug>` reads `data/cities/<slug>.json` (schema `data/cities/_schema.json`) and `data/cost-evidence/<slug>.json`, runs the climate/air chain, bakes only that record, checks every existing record is unchanged by hash, appends the frozen ID and runs every check. Cities with a hold-back stay pending. See `docs/adding-a-city.md`.
- The original 111 cities are baked by hand-run Python scripts in `scripts/` that edit `data/travel-data.json` in place (they skip cities that have a `data/cities/` file): `build_costs.py` (cost-evidence to costs), `safety_v3.py` (safety, from `data/safety-inputs-v3.json`, World Bank/WHO homicide and WPS caches), `build_city_content.py` (narratives, events), `rebake_scores.py` (component scores from raw inputs and `settings`), `reconcile_events.py` (see below). `build_fcdo.py` (UK FCDO layer) and `fetch_city_photos.py` exist, but the FCDO layer is not baked into the data and no city photos are shipped or shown (`docs/dead-pipelines.md`).
- Events: `city.events` is the list shown on the city sheet, and each month's `events/evtTier` (the Events score input) is derived from it, so the two cannot drift. `python3 scripts/reconcile_events.py --check-derived` asserts that; a plain run regenerates `tmp/events-mismatch.md` (currently no mismatches). History: `docs/data-changes/2026-10-03-events.md`.
- Climate and air: `fetch_climate.py` / `fetch_air.py` (Open-Meteo ERA5 and CAMS, cached in `data/raw/`), `build_station_normals.py`, `calibrate_climate.py`, `calibrate_air.py`, then `apply_climate_air.py --check|--write|--report`. `data/climate-air-holdbacks.json` (seeded by `seed_holdbacks.py`) lists the city-metrics that keep their previous value. History: `docs/data-changes/2026-10-03-climate-air.md`.

### Where the data comes from

Homicide rates (World Bank/UNODC, with a WHO modelled fallback), the women's street-safety baseline (Gallup World Poll via the Georgetown WPS Index, country level) and the cost line items are sourced, with links shown per city on the sheet. Some cost items are labelled as estimates with no source named. Property-crime safety, the visitor modifier, the women's city adjustment, season phase, events, hazard flags and swim months are editorial estimates. Per-month temperature, humidity and rain days come from WMO 1991-2020 station normals (NOAA NCEI) where a station is within 35 km and 200 m of the city, and from ERA5 reanalysis (Open-Meteo) elsewhere; PM2.5 follows the CAMS seasonal pattern scaled to each city's WHO ground-monitor annual mean. Where a new figure could not be verified the previous estimate is kept and labelled as an editorial estimate with the reason: 107 city-metrics (940 city-months) among the original 111 cities; a new city with a hold-back is not added until it clears. The sheet's source panels and the methodology table show the per-city source and licence. The chain is incremental from the committed derived files (`data/climate-normals.json`, `data/air-climatology.json`, `data/station-normals.json`); the raw Open-Meteo cache under `data/raw/` is optional.

## Testing And Checks

There is no unit-test framework, CI or browser test suite; these are plain scripts, run by hand before a deploy.

- `npm run test:schengen`: assertions on `src/lib/schengen.js` (real month lengths, rolling 180-day window, the Tight band).
- `npm run test:daycount`: assertions on `src/lib/dayCount.js` (days per country, 150/183-day states).
- `npm run test:currency`: assertions on `src/lib/currency.js` (conversion, whole-unit rounding, USD output unchanged, the language-to-currency default).
- `npm run check:seeds`: loads the real dataset and checks every "Build me a year" style under every lens is a full year, Schengen-legal, with no country at 183+ days; and that filling around locked stays and anchors keeps the locks untouched, never overlaps, stays legal and meets the anchors (or reports them unmet).
- `npm run check:ids`: the frozen city ID table is complete, duplicate-free and append-only against git HEAD.
- `npm run build:seo` then `npm run check:seo`: both need an existing `dist/` (run `npm run build` first). `build:seo` generates the static pages and runs the leak check; `check:seo` validates them (one h1, self-canonical, unique titles, JSON-LD parses, internal links resolve, everything in the sitemap, no orphans).
- `python3 scripts/rebake_scores.py --check` and `python3 scripts/sanity_check.py` after any data or settings change: the baked scores still match the formulas.
- Other `package.json` scripts: `dev`, `build`, `preview`, `deploy`, `update:fx` (refresh the currency rate table).

## Active Work

See `TODO.md` for the consolidated live backlog.
