# Making the cost data defensible: a methodology plan

Written 2026-11-26 for Garrett. Nothing here changes what users see yet. It is a menu with an order.

## Where the data stands today

Each of 127 cities has a file in `data/cost-evidence/` for one persona (a solo nomad, furnished one-bedroom, mid-range) with eight monthly components: rent, utilities, groceries, dining out, transit, coworking, SIM data and misc. About 606 evidence rows back them, each with a quote, URL and date. `scripts/build_costs.py` sums them. Couples are multiplied (shared 1.15, per-person 1.90, discounted 1.60). Rent alone gets a 12-month seasonal curve.

What an earlier audit found:

- The research looks AI-assisted. Only 9 cities have a recorded human spot-check.
- Confidence labels (low, med, high) are assigned by hand, not computed.
- 36 components cite only "estimated". 80 of 121 rents are multiples of $50, which suggests rounded guesses. 27 cities have no rent seasonality.
- The property-crime half of the safety score and the tourist modifier are hand-set with no source URL.
- The WHO air-quality data is CC BY-NC-SA, which is a problem once the site earns money.
- Every refresh script is run by hand. `sanity_check.py` checks that formulas agree, not that inputs are right.

**First verification run (proposal 1, already built):** of 606 evidence rows, 86 (14%) could be verified from the cited page or its archive copy, 81 (13%) partly, 362 (60%) were not found on the page, 44 (7%) were blocked, 22 (4%) were dead links, and 11 were the FX feed. 78 of 127 cities have no verified row. Many misses are aggregator pages whose figures change monthly, so a quote written in October no longer matches in November. Details: `docs/research/2026-11-26-evidence-verification.md`.

A verified quote proves the page says it. It does not prove the price is right, and it says nothing about whether one listing is typical.

## Principles

1. Every number has a source, a date, a range and a computed confidence. None of those is typed in by hand.
2. Primary sources beat aggregators. A rent measured from listings beats a blog's "about $800".
3. Methods are published and repeatable. A stranger with the same basket and search definition should land near our number.
4. Unknowns are labelled. "No data" and "indexed from last year" are honest. A confident-looking guess is not.

## 1. Verify and archive evidence

**What.** `scripts/verify_evidence.py` fetches every cited page, checks the quote, falls back to the Wayback Machine, and writes `data/cost-evidence-verification.json`.
**Why it adds credibility.** It shows how much of the evidence can be checked by anyone, and fixes dead links before readers meet them.
**How here.** Run it weekly from the existing GitHub runner (or a box timer) with `--limit` on rows changed in the last week for pull requests, and the full set monthly. Fail a pull request only when a row it adds is `dead` or `quote-missing`. Add `archiveUrl` as a fallback link in `src/lib/provenance.js` so a dead link still opens a snapshot.
**Effort.** S. **Risks.** Blocked sites stay unverifiable. Pages change, so `quote-missing` can mean "the price moved", which is useful but not an error.

## 2. Ranges and rule-based confidence

**What.** Each component stores the values from every independent source, then the build derives `low`, `typical` (median) and `high`, and a confidence.
**Schema.** Per component add `sources: [{tier, domain, usd, n, date, evidenceRef}]`. Remove hand-set `confidence`; the build writes `confidenceScore` and `confidence`.
**Scoring rule (100 points):**

| Part | Points |
|---|---|
| Independent sources: 1 → 10, 2 → 25, 3 or more → 40. Pages that republish the same dataset (for example Numbeo copies) count once. | up to 40 |
| Best source tier: tier 1 → 30, 2 → 22, 3 → 12, 4 → 5 | up to 30 |
| Agreement, (max − min) ÷ median: ≤10% → 20, ≤20% → 12, ≤35% → 5, else 0. One source scores 0 because agreement is unknown. | up to 20 |
| Age of the newest source: ≤6 months → 10, ≤12 → 6, ≤18 → 2, older → 0 | up to 10 |

Subtract 15 if no cited quote is `verified` or `verified-archive`. **High** is 75 or more and also needs at least one tier 1 or 2 source. **Medium** is 50 to 74. **Low** is below 50. With fewer than three sources the range is shown as the single value plus or minus an assumed 25%, labelled "assumed".
**Where it shows.** The provenance panel gets a range bar and "3 sources, newest Oct 2026". City cards keep one number. The Methodology dialog prints this table.
**Effort.** M. **Risks.** The thresholds are judgment. Publish them, then check how many cities land in each band and adjust once, not per city.

## 3. Source tiers and measured rent

**What.** Tier 1: measured primary data. Tier 2: official statistics (national statistics offices, Eurostat price levels, World Bank ICP/PPP, CPI). Tier 3: crowdsourced (Numbeo). Tier 4: blogs, for cross-checking only.
**Measured rent.** For each city, sample at least 20 furnished one-bedroom monthly listings from named portals. Publish the median, interquartile range, n, date, neighbourhoods and the exact search (portal, filters, radius). Store this in `data/rent-samples/<slug>.json` with a screenshot or saved page index per listing.
**Terms of service.** Many portals forbid scraping, and we have not checked each one's terms (to confirm). Where scraping is not allowed, sample by hand: a person (or an assistant working a visible browser) records listings from the first results pages and the screenshots serve as the audit trail. Where a portal offers an official API or open data (for example Inside Airbnb for monthly stays, to confirm licence and coverage), use that. Never bypass a login or a block.
**Where it shows.** A "measured" badge and "median of 23 listings, Oct 2026" in the rent line.
**Effort.** L. Start with the 30 most-visited cities. **Risks.** Listing prices are asking prices, not signed leases. Say so.

## 4. A fixed, published basket

**What.** Replace "mid-range nomad" with exact quantities, so every city is priced the same way. Proposed monthly basket for one adult:

- Groceries: 8 L milk, 30 eggs, 3 kg chicken, 1 kg beef, 4 kg rice or pasta, 8 loaves of bread, 6 kg vegetables (tomato, onion, potato), 5 kg fruit, 1 kg cheese, 1 L cooking oil, 0.5 kg coffee.
- Dining out: 12 inexpensive restaurant meals, 4 mid-range dinners (main plus drink), 12 café coffees, 6 beers.
- Transit: a monthly pass; if none exists, 40 single rides and 4 five-kilometre taxi or ride-hail trips.
- Coworking: one month of a hot desk (not a private office); if only day passes exist, 20 day passes.
- SIM: 20 GB of prepaid data on a major carrier, available to a foreigner.
- Utilities: electricity, water and 100 Mbps or faster internet for a 45 m² flat, using a year-round average that includes heating or cooling.
- Rent: furnished one-bedroom of 35 to 55 m² in a central, walkable neighbourhood popular with remote workers.
- Misc: one gym membership, two cinema tickets, a toiletries kit.

**How here.** Put the basket in `data/basket.json` with a version. Each `sources[]` row records which basket item it prices, so partial matches are visible. Publish it on the methodology page. **Effort.** M (writing it is easy, repricing 127 cities is the cost). **Risks.** The basket reflects a Western diet, and local prices do not scale linearly with how a person really eats. Say so.

## 5. Blind double collection

**What.** Two independent research runs per city, different models and different search tools, neither seeing the other's numbers. Any component that differs by more than 15% goes to human review. Publish the agreement rate.
**How here.** `scripts/compare_runs.py` reads `data/cost-evidence/<slug>.json` and `data/cost-evidence-run2/<slug>.json` and writes a review queue. A person settles each flagged line and records why. **Effort.** M. **Risks.** Two runs of AI models share the same blind spots and often the same top search results, so agreement is weaker evidence than it sounds. Treat disagreement as a signal and agreement as only partly reassuring. Human review time is the real cost.

## 6. Benchmark validation

**What.** Compare our totals with independent benchmarks and publish the results: rank correlation (Spearman), typical error (median absolute percentage), and the list of outliers.
**Benchmarks.** Numbeo indices (note it is also a source, so use it here only on cities where we did not cite it); Eurostat comparative price levels (country level, to confirm city coverage); and reader-submitted real monthly budgets through a simple form (a new Cloudflare Function next to `functions/api/e.js` can store them; collect city, month, rent, total, household size).
**Where it shows.** A "How accurate is this?" section in the Methodology dialog and a quiet outlier list in `docs/data-changes/`. **Effort.** M. **Risks.** Reader budgets are self-selected, and a small n per city is noise. Publish n.

## 7. Freshness rules on a timer

**What.** A component older than 12 months is flagged and loses its age points (proposal 2). Between refreshes, values are rolled forward by local CPI and FX and labelled "indexed", never "measured".
**Calendar.** FX monthly (`npm run update:fx` already exists), advisories monthly (`scripts/refresh_advisories.py`), CPI quarterly, rent sampling twice a year, evidence verification monthly. One systemd timer unit per cadence on the box, each sending a digest through the existing ntfy lane, and a failure going to the alarm lane. **Effort.** S for timers, M for the CPI roll-forward (a CPI series per country, to confirm sources). **Risks.** Indexing hides real rent jumps, so cap its use at 12 months.

## 8. Fix unsourced inputs

- **Property-crime sub-score and tourist modifier.** UNODC burglary and theft rates are national and unevenly reported (to confirm). Eurostat crime statistics are regional for EU cities (to confirm). Numbeo's crime index is city-level but perception-based. The most defensible design is an official national or regional rate as the anchor, with a capped Numbeo-based adjustment inside the country, labelled as crowdsourced. For the tourist modifier, either label it editorial and show its size, or derive it from the U.S. advisory levels that `scripts/refresh_advisories.py` already refreshes (display-only today).
- **Couple multipliers.** Cite the OECD-modified equivalence scale (1.0 for the first adult, 0.5 for the second) for shared costs, and price a real couple basket directly in 10 pilot cities to test 1.15, 1.90 and 1.60.
- **Rent seasonality for 27 flat cities.** Use Inside Airbnb calendar data where it exists (to confirm which of our cities it covers). Otherwise show "no seasonal data" instead of silently using 1.0.
- **36 "estimated" components.** List them in a file, give each an owner and a date, and replace with tier 2 or 3 sources first. Until replaced they cannot score High.
- **WHO licence.** The data is CC BY-NC-SA, so commercial use needs a replacement. Options from TODO.md: EEA e-reporting for EU cities and the WashU ACAG grid (CC BY 4.0) elsewhere; OpenAQ (licences vary by contributing source, to confirm); or CAMS alone (Copernicus terms allow commercial use, to confirm) at the cost of ground calibration. Run a before and after diff first.

**Effort.** M each, L in total.

## Recommended order

**Phase 1, weeks 1 to 4: cheap and honest.** Proposal 1 as a scheduled check, proposal 2's rule applied to existing data, the 12-month stale flag, the WHO licence decision, and "estimated" labelling.
**Phase 2, months 2 to 3: measure.** The basket, tier 1 rent for 30 cities, and a 20-city double-collection pilot.
**Phase 3, months 4 to 6: validate.** Benchmarks and the reader form, the remaining cities, couple multipliers, crime and seasonality fixes, CPI roll-forward.

## What we will say publicly

Draft for the Methodology dialog:

> Costs are for one person living mid-range in a furnished one-bedroom, cooking some meals and working from a coworking desk. Every figure links to the page it came from and shows its date. We check that each cited quote is on the page and keep an archive copy. For each cost we show a range, not a single price, and a confidence rating worked out by a published rule from how many independent sources agree, how good they are and how recent they are. Where we only have an estimate, we say so. Some prices are indexed from older data using local inflation and exchange rates, and are marked that way. These are guides for planning, not quotes. If a number looks wrong, tell us.
