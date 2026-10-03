# Monsoon.fyi

Monsoon is a seasonal migration planner for slow travelers, digital nomads, and expatFIRE people deciding when to be where. Nomad List tells you where; Monsoon tells you when.

The product scores 111 cities month by month across weather, air quality, safety, seasonality, events, and cost. The core use case is a traveler who can stay somewhere for one to three months and wants a year that is livable, affordable, and compliant with Schengen 90/180 constraints.

## Product Shape

- This month: ranked cards or a dense table (`layout=table`) answering "Where should I be in this month?" A one-line #1 answer sits under the headline, a city search finds places by name or country (accent-insensitive), and a dismissible colour key explains the strip. A "Ranked for" pill appears only when the lens is not Balanced (or women's safety is blended). Returning users with a saved year get a "Your year: N stays · avg score · Resume" line.
- Compare: a Compare toggle adds a checkbox to each card or row; 2 to 3 picks open a comparison sheet (month strip, score bars, climate, safety, cost, Schengen, events) with plain-words findings, under the active lens, party size and value model. Picks live in `sessionStorage`; the city sheet has its own Compare toggle.
- City sheet: full-screen detail for one city and selected month. Each group (month, safety, cost) has a "Where these numbers come from" panel with source, date, confidence and type; cost line items link to their sources; "Report this number" opens a prefilled public GitHub issue. If the detail layer fails to load the safety block offers Retry.
- My year: editable itinerary builder with local storage, shareable URLs, "Build me a year" seed styles, and Save a copy (with Undo) for shared routes. The Schengen meter counts real days over every rolling 180-day window; 1-2 days over reads "Tight" rather than legal or breached. Beside it, days per country flag any country at 183+ days (a planning signal, not tax advice). Saved routes and favorites migrate renamed cities through `SLUG_ALIASES`.
- Methodology: a dialog with a per-input table (source, type, last refreshed), the model version and a changelog (`src/lib/changelog.js`).
- Static pages: build-time HTML for crawlers and link previews: `/city/<slug>/` (111), `/best/where-to-be-in-<month>/` (12), `/cities/`, `sitemap.xml` and `llms.txt`. They are separate from the SPA and link into it.

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
- `data/travel-data.json` is split into generated runtime files under `src/generated/`: `travel-core.json` is bundled into the JS, `travel-detail.json` (safety breakdown, narratives, climate fields, provenance) is fetched once the browser is idle.
- State persists in `localStorage`: `atlas.route.v1` (itinerary), `atlas.settings.v1`, `atlas.favorites.v1`, `atlas.prefs.v1`, and `atlas.route.filters.v1` (My year filters). The in-progress comparison is in `sessionStorage` (`atlas.compare.v1`).
- Shared routes emit compact `?i=<base64url>` URLs using frozen city IDs in `src/lib/cityIds.v1.js`. Run `npm run check:ids` when cities are added.
- `scripts/build.sh` is the real build: `vite build`, then `scripts/seo/build-seo.mjs` (city, month and cities-index pages, `sitemap.xml`, `llms.txt` written into `dist/`), then a guard that fails if any private input file is in `dist/`, then `scripts/seo/leak-check.mjs` (fails if private input text appears in a generated page). `npm run build` alone is only `vite build`. Static pages render only fields allowlisted in `src/seo/publicData.js`.
- Deploy: `npm run deploy` runs `scripts/deploy.sh`, which runs `build.sh` and uploads `dist/` to the Cloudflare Pages project `monsoon` with wrangler (direct upload; a git push deploys nothing). `scripts/deploy.sh <branch>` uploads a preview and prints a `*.pages.dev` URL; with no argument it is a production deploy to monsoon.fyi.
- Data is baked by hand-run Python scripts in `scripts/` that edit `data/travel-data.json` in place: `build_costs.py` (cost-evidence to costs), `safety_v3.py` (safety, from `data/safety-inputs-v3.json`, World Bank/WHO homicide and WPS caches), `build_city_content.py` (narratives, events), `rebake_scores.py` (component scores from raw inputs and `settings`), `reconcile_events.py` (see below). `build_fcdo.py` (UK FCDO layer) and `fetch_city_photos.py` exist, but the FCDO layer is not baked into the data and no city photos are shipped or shown.
- Events: `months[i].events/evtTier` drives the Events score; `city.events` is the list shown on the city sheet. `scripts/reconcile_events.py` keeps them from drifting: `--write` adds a visible entry for every scored event that lacks one and never changes a score. It also regenerates `tmp/events-mismatch.md`, the list of mismatches that need an owner decision (currently 16 scored-month vs listed-month conflicts and 41 visible major events in months scored below tier 3).

### Where the data comes from

Homicide rates (World Bank/UNODC, with a WHO modelled fallback), the women's street-safety baseline (Gallup World Poll via the Georgetown WPS Index, country level) and the cost line items are sourced, with links shown per city on the sheet. Some cost items are labelled as estimates with no source named. Property-crime safety, the visitor modifier, the women's city adjustment, season phase, events, hazard flags and swim months are editorial estimates. Per-month temperature, humidity, rain days and PM2.5 are currently unsourced estimates, and the sheet and methodology say so. A calibrated replacement pipeline (WMO 1991-2020 station normals via NOAA NCEI, ERA5 via Open-Meteo, CAMS PM2.5 scaled to the WHO air-quality database) is built on the branch `worktree-agent-afe28801026ce36a8` and has not been applied to `main`; the sheet's source panels already show per-city provenance when the data carries it.

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
