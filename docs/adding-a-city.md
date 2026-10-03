# Adding a city

One input file per city, one command. Everything else (climate, PM2.5, scores, IDs,
static pages) is derived. The pipeline never changes an existing city's record; it
checks that by hash on every run.

## 1. The steps

1. **Pick the city and check it can ship.** It needs (a) a U.S. advisory below Level 3
   for the city itself, (b) usable climate data: a WMO 1991–2020 station within 35 km and
   200 m, or a lowland/coastal site where ERA5 is trustworthy (no station + highland =
   pending), and (c) a World Bank/UNODC homicide rate for the country (or a citable city
   figure). Run the candidate check in step 3 below before researching.
2. **Write the two input files** (see section 2 for what each field needs):
   - `data/cities/<slug>.json` — contract in `data/cities/_schema.json`.
   - `data/cost-evidence/<slug>.json` — contract in `data/cost-evidence/_schema.json`
     (`provenance: "researched"`, no `monthlyOverride`/`totalsOverride`).
   - The slug is the repo-wide convention (`scripts/city_inputs.py slug()` =
     `scripts/check-city-ids.mjs`): lowercase, strip accents, non-alphanumerics → `-`.
     Note `ł` does not decompose (`Wrocław` → `wroc-aw`).
   - New country? Add its homicide rate to `data/worldbank-homicide.json` from the World
     Bank API (`VC.IHR.PSRC.P5`); if the latest submission is older than ~4 years, use the
     WHO GHO modelled estimate (`VIOLENCE_HOMICIDERATE`) and say so in `source`, as for
     Georgia, Thailand, Sri Lanka and Senegal. Its visa rule goes in the city file (`visa`)
     unless `scripts/add_visa.py` already covers the country.
3. **Validate:** `python3 scripts/city_inputs.py <slug>`.
4. **Bake:** `python3 scripts/add_city.py <slug>` (or `--all`). It runs, in order:
   validate → `fetch_climate.py --only` / `fetch_air.py --only` (Open-Meteo, incremental)
   → `build_station_normals.py` → `calibrate_climate.py` (frozen fit) → `calibrate_air.py`
   → new-city hold-back rules → compose the record → write only that record →
   `seed_holdbacks.py` + `apply_climate_air.py --write` (all-city pass, must reproduce the
   record exactly) → hash check of every pre-existing city → append the ID to
   `src/lib/cityIds.v1.js` → checks (`sanity_check`, `rebake --check`, events invariant,
   `npm run build`, `check:ids`, `check:seeds`, `test:schengen`, `test:daycount`,
   `scripts/build.sh` with the leak check, `check:seo`, and a static page + sitemap entry
   per new city).
   - Exit 2 = **pending**: a metric was held back. A new city has no previous value to fall
     back on, so it is not added. The reason is printed; fix the input or wait for data.
   - Open-Meteo's free quota resets at 00:00 UTC. Fetches are cached under `data/raw/`
     (gitignored) and the derived per-city normals are committed, so a quota stop is safe:
     rerun the same command later. Use `--offline` to bake from what is cached.
   - `--no-build` skips the npm/SEO steps for a fast loop; run `add_city.py --check`
     before committing.
5. **Log it.** Add a `docs/data-changes/<date>-<topic>.md` entry (one line per city: why
   it was added) and a `src/lib/changelog.js` entry. Commit the input files, the derived
   data files and `src/lib/cityIds.v1.js` together.

Re-running is safe: `add_city.py <slug>` replaces that city's record in place.
`add_city.py --check` verifies every managed city's record still equals what its inputs
produce.

## 2. What to research, and the evidence standard

Record only URLs you opened that support the figure, with an access date and, where
useful, a short quote (≤ 25 words). If you cannot source a number, label it an editorial
estimate and write the rationale. Never invent an event blurb or a citation.

| Input | Type | Standard |
|---|---|---|
| Coordinates, timezone, Schengen | Fact | The point is the long-stay district; stations are matched from it. |
| Visa (new countries) | Fact | Official government page for US/UK/EU/AU passports (`visaSources`). |
| English tier | Editorial | EF EPI country band, +1 for an expat hub; rationale. |
| Cost components | Sourced | Rent: furnished 1BR in a nomad area from listing portals or their market reports; transit: official fares; coworking: the space's price page; SIM: operator page. Convert currency and state the rate. One evidence receipt per figure. |
| Homicide | Sourced | Country World Bank/UNODC (or WHO GHO if stale). City override only with a citable city/state figure. |
| Property sub-score, visitor modifier, women's adjustment | Editorial | 1–2 sentence rationale each, what you consulted (OSAC, US/UK/AU advisories, national statistics, credible news), and the comparable catalog cities you calibrated against (`calibratedAgainst`). Modifier 1.0 unless there is a reason. |
| U.S. advisory | Fact | Level, exact text, date and URL from travel.state.gov; regional/local level if the city's area differs. Reference only, never scored. |
| Season phase | Editorial | Rationale + tourism statistics or credible guides. |
| Hazard flags | Editorial, sourced | Typhoon/hurricane/cyclone, monsoon, extreme heat, smoke/haze, dust; met-service or NOAA/JMA-type source per flag. Level 2 is rare. |
| Swim months | Editorial, sourced | Sea ≳ 20–21 °C or the local swim season; sea-temperature source. |
| Events | Sourced | Verified months (latest edition); tier rubric below; factual blurbs only. |
| Draw, vibe, narrative, activities | Editorial | Existing voice; concrete; no superlatives you cannot back. |
| Climate (high/low/humidity/rain days), PM2.5 | Pipeline | Never authored by hand. |

**Event tiers** (`docs/data-changes/2026-10-03-events.md`): 3 = a genuinely major festival
worth planning a stay around; 2 = notable (a national holiday, city day or religious feast
without a draw for visitors is at most 2); 1 = minor or recurring. Movable feasts list
every month they can fall in.

## 3. Climate/air hold-backs for a new city

The criteria in `docs/data-changes/2026-10-03-climate-air.md` apply, adapted because a new
city has no previous value (`seed_holdbacks.new_city_holds`):

- **pending** — no station and no ERA5 yet → pending.
- **who-scale** — CAMS→WHO factor outside [0.6, 2.0] without a cited override in
  `data/air-overrides.json` → PM2.5 pending.
- **highland** — highland/complex terrain without a station → humidity and night lows pending.
- **station-vs-era5** — station and ERA5 disagree by ≥ 4.5 °C on average → temperature pending.
- **trop-rain** — tropical ERA5 rain days where the provisional threshold changes the answer
  by more than 4 days (days ≥ 1 mm vs ≥ the fitted threshold) → those months pending.
- **manual** — `climateAir.manualHolds` in the city file (e.g. a smog season the model misses).
- *shape* and *material* need a previous value and do not apply; the confidence label
  (station = Measured; ERA5/CAMS = Modelled, medium/low) carries that uncertainty.

The ERA5 rain thresholds and the ERA5-vs-station skill table are frozen in
`data/climate-calibrated.json`; `calibrate_climate.py --refit` is a methodology change that
moves other cities and needs its own data-change entry.

To check a candidate before researching: does a station match? Run
`python3 scripts/build_station_normals.py` after creating a minimal `data/cities/<slug>.json`,
or look up the WMO composite files cached under `data/raw/wmo-normals/`.

## 4. Confidence rubric

| Label | Climate / air | Cost items | Safety |
|---|---|---|---|
| **Measured** (high) | WMO station ≤ 20 km and ≤ 100 m height difference; PM2.5 scaled to ≥ 2 recent WHO years within 10 km | A primary source states the figure (operator, fare table, listing-portal statistics) | Homicide from WB/UNODC or a cited city figure |
| **Modelled** (medium) | Station ≤ 35 km / 200 m; ERA5 in lowland/coastal cells; PM2.5 scaled to older or fewer WHO years | Reputable secondary source, or derived from primary data with stated assumptions | WHO GHO modelled homicide |
| **Editorial estimate** (low) | Raw CAMS; ERA5 rain days; anything held back | Aggregator sites, a single anecdote, or our own estimate | Property, visitor modifier, women's adjustment |

Rate cost items `low` when that is the honest answer.

## 5. Checklist

- [ ] Advisory for the city's own area below Level 3; date and URL recorded.
- [ ] Station or lowland ERA5 available; country homicide rate in `data/worldbank-homicide.json`.
- [ ] `data/cities/<slug>.json` valid (`python3 scripts/city_inputs.py <slug>`).
- [ ] Every URL opened; quotes short; editorial values have rationale + comparables.
- [ ] Cost evidence: eight components, one receipt each, honest confidence (some `low` is normal).
- [ ] Events: months verified, tiers per rubric, no invented blurbs.
- [ ] `python3 scripts/add_city.py <slug>` exits 0 (not pending); invariant printed.
- [ ] Sceptical-traveller pass: monthly scores, best months, cost and safety next to two
      comparable cities look right; fix inputs that are clearly off and say what changed.
- [ ] `python3 scripts/add_city.py --check` passes; data-change entry + changelog entry written.

## Legacy scripts

The 111 original cities still bake through the older all-city scripts; those now skip any
city that has a `data/cities/` file, so they cannot overwrite a new city.
`scripts/build_safety_inputs.py` and `scripts/add-coords.js` are retired (they refuse to
run): the first would overwrite `data/safety-inputs-v3.json` with values that predate
`womensAdj`; the second re-serialised every float in `travel-data.json`. `safety_v3.py` no
longer recomputes `value` with the pre-v5 formula and keeps `safety.narrative`.
