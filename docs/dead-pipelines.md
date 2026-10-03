# Unshipped pipelines

Two data pipelines exist in `scripts/` and `data/` but reach neither the shipped data nor the UI. This note records their state (as of `main` at 1b41430, 2026-10-03) and what finishing or removing each would take. Nothing here has been deleted; the data scripts and files belong to the data workflow.

## UK FCDO advisory layer

**Pieces:** `scripts/build_fcdo.py`, `data/fcdo-advice.json`.

**State:**

- `fcdo-advice.json` holds hand-authored records for 10 countries (whole-country status, amber/red carve-outs, which of our cities fall inside them, an AI-drafted crime summary), dated 2026-06. Every other country counts as "no advisory".
- `build_fcdo.py` would write `safety.advisoryUK = {status, appliesToCity, area, summary, url, asOf}` onto each city in `data/travel-data.json` and print an advisory-divergence QA report (cities we rate Safe+ that the US at level 3+ and/or the FCDO elevate). It is display-only by design and never touches a score.
- It has not been run against the current data: no city carries `advisoryUK`. `scripts/split-data.mjs` would pass it through inside the detail-layer `safety` object if it did, but nothing in `src/` reads it, and the methodology changelog (v5) removed the copy that claimed an FCDO layer.
- `scripts/build.sh` already refuses to ship `fcdo-advice.json` itself.

**To finish:** refresh `fcdo-advice.json` against gov.uk (the records are four months old and the crime summaries need a human read), run `build_fcdo.py` after `safety_v3.py`, add `advisoryUK` to the city sheet's safety source panel beside the U.S. advisory (`safetyRows` in `src/lib/provenance.js`), optionally to `PUBLIC_FIELDS.safety` in `src/seo/publicData.js` for the static pages, add a methodology input row and a changelog entry, and decide who refreshes it and how often. The divergence report is useful QA on its own, even if nothing is displayed.

**To remove:** delete the script and the data file, and the `fcdo-advice.json` line in `scripts/build.sh`'s leak guard. Nothing in `src/` needs to change.

## City photos

**Pieces:** `scripts/fetch_city_photos.py` (Wikipedia lead image plus Commons attribution, resized to WebP), `scripts/set_hero.py` (manual per-city override), `scripts/make_contact_sheets.py` (review grids, needs Pillow), `scripts/build_city_media.py` (bakes reviewed entries into the data), `data/city-media.json`.

**State:**

- `city-media.json` has an entry for all 111 cities, every one flagged `review: true`, with hero and thumb paths under `assets/cities/` and credit, licence and source URL. Its `_meta.status` still says "empty — photo pilot not yet run", which is out of date.
- `build_city_media.py` has been run: every city in `data/travel-data.json` carries a `media` object.
- The images themselves are not in the repository or the main checkout (`assets/cities/` does not exist), `build.sh` copies no images into `dist/` (the fetch script's docstring says it does), and no component renders a photo or its credit.
- Since 2026-10-03 `scripts/split-data.mjs` no longer copies `media` into `src/generated/travel-detail.json` (it was about 29 kB of the lazy bundle that nothing read), and the merge in `src/lib/data.svelte.js` no longer looks for it.

**To finish:** re-run the fetch (needs network and Pillow) or restore the WebP files, actually review them (contact sheets) since the `review: true` flags were set without images present, commit or host `assets/cities/`, copy them into `dist/` in `build.sh`, pass `media` through `split-data.mjs` again, render a hero with visible credit and licence (CC BY-SA requires attribution) on the city sheet, and budget the page weight (lazy-load, `srcset` with the thumb). The static city pages would also want `og:image` per city, which overlaps the per-page share-image item in `TODO.md`.

**To remove:** delete the four scripts and `city-media.json`, strip `media` from `data/travel-data.json`, and drop the `city-media.json` line from `build.sh`'s leak guard and the media mention in `src/seo/publicData.js`'s comment.
