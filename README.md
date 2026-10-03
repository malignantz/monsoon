# Monsoon.fyi

Monsoon is a seasonal migration planner for slow travelers, digital nomads, and expatFIRE people deciding when to be where. Nomad List tells you where; Monsoon tells you when.

The product scores 121 cities month by month across weather, air quality, safety, seasonality, events, and cost. The core use case is a traveler who can stay somewhere for one to three months and wants a year that is livable, affordable, and compliant with Schengen 90/180 constraints.

## Product Shape

- This month: ranked cards or a dense table (`layout=table`) answering "Where should I be in this month?" A one-line #1 answer sits under the headline, a city search finds places by name or country (accent-insensitive), and a dismissible colour key explains the strip. A "Ranked for" pill appears only when the lens is not Balanced (or women's safety is blended). Returning users with a saved year get a "Your year: N stays · avg score · Resume" line.
- Compare: a Compare toggle adds a checkbox to each card or row; 2 to 3 picks open a comparison sheet (month strip, score bars, climate, safety, cost, Schengen, events) with plain-words findings, under the active lens, party size and value model. Picks live in `sessionStorage`; the city sheet has its own Compare toggle.
- City sheet: full-screen detail for one city and selected month. Each group (month, safety, cost) has a "Where these numbers come from" panel with source, date, confidence and type; cost line items link to their sources; "Report this number" opens a prefilled public GitHub issue. If the detail layer fails to load the safety block offers Retry.
- My year: editable itinerary builder with local storage, shareable URLs, "Build me a year" seed styles, Copy as text and a one-page print layout. A shared link becomes a first-time visitor's starting year (Keep it / Undo); a visitor with a saved year gets a read-only preview with Save a copy (with Undo). See `docs/itinerary-sharing.md`. The Schengen meter counts real days over every rolling 180-day window; 1-2 days over reads "Tight" rather than legal or breached. Beside it, days per country flag any country at 183+ days (a planning signal, not tax advice). Saved routes and favorites migrate renamed cities through `SLUG_ALIASES`.
- Methodology: a dialog with a per-input table (source, type, last refreshed), the model version (v6) and a changelog (`src/lib/changelog.js`).
- Static pages: build-time HTML for crawlers and link previews: `/city/<slug>/` (121), `/best/where-to-be-in-<month>/` (12), `/cities/`, `sitemap.xml` and `llms.txt`. They are separate from the SPA and link into it.

The month strip is the signature primitive: 12 cells, one per month, colored by Score band. It appears on browse cards, city sheets, and route-picking rows.

Browse and share state lives in the query string (`src/lib/urlState.js`): `view=year`, `m=<month>`, `sort=value`, `layout=table`, `region=<slugs>`, `city=<key>`, `compare=<a>,<b>[,<c>]`. Defaults emit no params. City and compare links also pin `m`. Itinerary share links use `?i=<base64url>` (frozen city IDs), with `n=` for the trip name and `?route=` as a readable fallback; other params (utm_*, etc.) pass through untouched.

## Brand And UI

Monsoon should feel like a modern field atlas: measured, trustworthy, well-traveled, and data-rich without dashboard theater. Use warm paper surfaces, near-black olive ink, restrained terracotta markings, Schengen blue only for Schengen concepts, Fraunces for display, Schibsted Grotesk for body, and Spline Sans Mono for comparable numbers.

Avoid SaaS dashboard cliches, primary map navigation, side-by-side Score and Best Value numbers on cards, and methodology math on browse surfaces. Browse should stay calm: one headline number, the strip, one plain finding.

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
- `npm run check:seeds`: loads the real dataset and checks every "Build me a year" style under every lens is a full year, Schengen-legal, with no country at 183+ days.
- `npm run check:ids`: the frozen city ID table is complete, duplicate-free and append-only against git HEAD.
- `npm run build:seo` then `npm run check:seo`: both need an existing `dist/` (run `npm run build` first). `build:seo` generates the static pages and runs the leak check; `check:seo` validates them (one h1, self-canonical, unique titles, JSON-LD parses, internal links resolve, everything in the sitemap, no orphans).
- `python3 scripts/rebake_scores.py --check` and `python3 scripts/sanity_check.py` after any data or settings change: the baked scores still match the formulas.
- Other `package.json` scripts: `dev`, `build`, `preview`, `deploy`.

## Active Work

See `TODO.md` for the consolidated live backlog.
