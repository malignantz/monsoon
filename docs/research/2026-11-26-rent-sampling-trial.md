# Measured rent: a five-city trial

Run 2026-11-26. Data: `data/rent-samples/<slug>.json`, summaries from `scripts/summarize_rent_samples.py`, every listing tied to a snapshot record in `data/evidence-snapshots/`. Shipped costs were not changed.

## The question

Rent is the biggest line in every city's cost. Today it comes from blogs and aggregators. Can we measure it from real listings instead, what does that cost per city, and how far is the measured number from the one we ship?

## Method

**Search definition, written before collecting and the same everywhere** (`furnished-1br-midterm-v1`):

- A whole furnished unit, studio or one bedroom, 30–60 m².
- Move-in possible by 26 January 2027, two months after collection, for a stay of one to three months.
- Two to four neighbourhoods named in advance per city, where slow travellers stay. Lisbon: Arroios, Avenidas Novas, Santo António, Misericórdia. Budapest: districts V–VIII. Berlin: Mitte, Prenzlauer Berg, Friedrichshain, Kreuzberg. Medellín: El Poblado, Laureles-Estadio, Envigado. Chiang Mai: Nimman, Santitham, Old City, Chang Phueak.
- Two markets, kept apart. **Long-term local**: a local rental portal, which shows what a resident pays. **Mid-term furnished**: a platform a traveller would book for one to three months.
- Listings were taken in the order the portal showed them under its default sort. None were picked by hand. Exclusions are rule-based and listed in each file: outside the size band, no move-in within two months, duplicates, then outliers beyond 1.5 × IQR.
- Prices were converted at the open.er-api.com rate of 26 November (0.9121 EUR per USD). That is the feed the evidence store already cites. The app's ECB table (2 October) would make every euro figure about 2.4% higher in dollars.

**Rules of access.** Before using a portal I checked its robots.txt and its terms. Two read-only helper agents read the terms of 30 portals. A portal was used only if neither forbids automated access. Pages were rendered in headless Chrome, one page every few seconds. There were no logins, and nothing was done to get past a block. Each results page went through `collect_evidence.py`, so each listing's card text sits in a snapshot record, and the raw page is archived by hash. Five results pages also got Internet Archive copies through Save Page Now. Four worked; casa.sapo's request failed with HTTP 520.

**Cities.** Lisbon stands for Southern Europe and has portals in both markets. Budapest stands for Eastern Europe: Tbilisi, the Caucasus option, has only 5 Flatio listings and its local portals' terms could not be read. Medellín is the Latin American nomad hub with a Flatio presence (36 listings; Mexico City has 20). Berlin is the expensive city with the deepest Flatio market outside Lisbon and Budapest. Chiang Mai is the Southeast Asian test.

## Results

All figures are USD per month. "Stored" is `components.rent.usd`. Flatio prices include utilities while the stored rent does not, so the last column compares Flatio with stored rent plus stored utilities.

| City | Stored rent | Market (portal) | n kept / seen | Median | IQR (25th–75th) | vs stored rent | Flatio vs stored rent + utilities |
|---|---:|---|---:|---:|---:|---:|---:|
| Lisbon | 1,500 | Mid-term (Flatio) | 20 / 49 | 1,590 | 1,352–1,805 | +6% | −4% (vs 1,655) |
| Lisbon | 1,500 | Long-term (casa.sapo.pt) | 15 / 23 | 1,425 | 1,179–1,919 | −5% | – |
| Budapest | 750 | Mid-term (Flatio) | 20 / 52 | 1,097 | 902–1,181 | +46% | +25% (vs 880) |
| Berlin | 1,350 | Mid-term (Flatio) | 10 / 38 | 1,865 | 1,762–1,908 | +38% | +25% (vs 1,490) |
| Medellín | 700 | Mid-term (Flatio) | 5 / 10 | 561 | 530–583 | −20% | −32% (vs 830) |
| Chiang Mai | 400 | none usable | 0 | – | – | – | – |

Only Lisbon had both markets. There the traveller market (Flatio, bills included) is 12% above the resident market (casa.sapo, bills extra). Take out about $150 of utilities and the two are close. Lisbon's long-term set is every furnished T0/T1 listing in the four parishes, so it is close to a census, not a sample.

The exclusion rules matter. Most listings seen were dropped for size (outside 30–60 m²) or for move-in after 26 January. With no availability rule, the Flatio medians become Lisbon 1,590, Budapest 968, Berlin 1,908 and Medellín 567 (in-band only). Budapest moves 12%, the others under 3%.

## Which portals worked

| Outcome | Portals |
|---|---|
| Used | flatio.com (4 cities), casa.sapo.pt (Lisbon; one HTTP 429 after 4 quick pages, fine at one page per 20 s) |
| Terms forbid automated access | airbnb.com, uniplaces.com, housinganywhere.com, wunderflats.com, renthub.in.th, alberlet.hu, fincaraiz.com.co, ciencuadras.com, kleinanzeigen.de |
| robots.txt disallows search, or blocked us | ingatlan.com (search results disallowed), idealista.pt/.com (403 walls), hipflat.co.th (401/403), ddproperty.com (403) |
| Terms could not be read, so not used | imovirtual.com, immobilienscout24.de, immowelt.de, inmuebles24.com, lamudi.com.mx, myhome.ge, ss.ge |
| Allowed but not usable here | metrocuadrado.com: cards show price only, filters are form controls. spotahome.com: allowed, not reached in the time box. fazwaz/dotproperty: legal notice bars extracting content |

Flatio was the only mid-term platform that was both allowed and large. Airbnb, the obvious traveller benchmark, forbids automated access outright.

## Effort

The whole trial took about 2 hours 15 minutes of wall clock, including building the tools and two rounds of terms checks. Collection alone, once a portal works, took 8–15 minutes of machine time per city per market at polite pace (3–6 results pages, each viewed twice; the new `fetch` + `snapshot --from-archive` path views each once). Lisbon's two markets took about 35 minutes with the 429 retry. Most of my time went into reading each portal's page layout and filters, about 15–30 minutes per new portal. A second city on the same portal costs almost nothing.

## What went wrong, and weaknesses

- **Small samples.** Berlin kept 10 listings and Medellín 5, even though every page of both was read. Flatio has only 127 and 36 listings there in total. Only 15–19 of the 34 cards on each Flatio page rendered for us; the rest stayed as loading placeholders, so we saw roughly the first half of each page.
- **Neighbourhoods were not enforced on Flatio.** It has no neighbourhood filter and most titles name none. The Flatio numbers are city-wide; casa.sapo's are parish-filtered.
- **Asking, not paid.** Every number is an asking price. Mid-term prices are Flatio's "from" price, the cheapest 30-day window, which can sit below the month a traveller actually wants.
- **One day, one season.** One snapshot in late November. The rent seasonality curve is untouched by this.
- **Fees.** Flatio's price is the total including its fees and utilities. casa.sapo's is bare rent, with deposit and up-front rent extra.
- **Portal selection bias.** Flatio's supply skews to Czechia, Portugal, Hungary and Spain. Where it is thin, as in Latin America and Asia, its few listings may be unusual (four of Medellín's five kept listings are lofts from one operator in Prado, outside the declared neighbourhoods; the one El Poblado listing was dropped as an outlier). The usable portals are the ones that allow access, not the ones travellers use most.
- **Parsing.** Card parsing is regex over rendered text. A few cards changed between our two page views and were dropped (each file says how many). One casa.sapo card in Santo António had a layout we did not parse.

## Recommendation

1. **Do not roll this out unchanged to all 127 cities.** Measured rent is credible today only where an allowed portal has depth: roughly Portugal, Spain, Czechia, Hungary and Poland on Flatio, plus allowed local portals such as casa.sapo. In Southeast Asia, Latin America, Germany and the Caucasus, the portals with depth forbid automated access. Measure there by hand (a person browsing normally, with screenshots, which the plan already allows) or ask the portals for data access. Inside Airbnb's published monthly data is worth checking for licence and coverage.
2. **The mid-term furnished market should define "rent" for this persona.** A traveller on a one- to three-month stay cannot sign a Lisbon lease. Because mid-term prices usually include utilities, either redefine the rent line as "rent incl. bills" and drop the separate utilities line for measured cities, or subtract a stated utilities figure. Pick one and publish it.
3. **Sample size.** Aim for 20 kept listings per city per market. Accept 10 to 19 with a "small sample" label. Below 10, as in Medellín, do not override the stored figure. Seeing 20 kept listings took 40 to 50 cards.
4. **The trial already says something about current data.** Budapest (+46%) and Berlin (+38%) look under-stated for a traveller. Lisbon is within 6%. Medellín's sample is too small to judge.
5. **Rollout cost.** For roughly 30 cities with an allowed deep portal: about 15 minutes of machine time and 5 minutes of review per city per market, after a one-off 1 to 2 hours per new portal for a parser. That is about one working day, plus a twice-yearly re-run. The remaining ~90 cities need manual sampling, at about 30–45 minutes per city for 20 listings, or 45–70 hours in all. Start manual work with the most-visited cities.
