# Cost evidence verification, first run

Run 2026-11-26 with `scripts/verify_evidence.py`. Output: `data/cost-evidence-verification.json`.

## What the check does, in plain words

Every cost number in Monsoon rests on evidence rows: a quote, a link and a date. This script opens each link and asks whether the quote is on the page.

1. It downloads the page like a browser would, at most one request every 2 seconds per website, with one retry. Raw pages are kept outside the repo so reruns are cheap.
2. It strips the page to visible text and smooths out differences that do not matter: capital letters, curly quotes, accents, and number formats (5,000 and 5 000 and 5.000 are the same).
3. It gives each row one status:
   - **verified**: the quote is on the live page, word for word after smoothing.
   - **verified-archive**: not on the live page, but in the Internet Archive copy nearest the evidence date.
   - **partial**: every number in the quote and most of its distinctive words appear close together, or the quote matched but is so short (under about 25 letters, like "30 €/mes") that a match could be luck.
   - **quote-missing**: the page loaded and the quote is not there.
   - **blocked**: the site refused us (403, 429, bot wall) or the page is an empty shell that needs JavaScript.
   - **dead**: 404, 410, the site no longer exists, or it timed out twice.
   - **api**: a data feed such as the exchange-rate API, so there is no quote to match.
4. For every row that is not verified, it looks up the Archive's nearest snapshot (a read-only lookup; we never ask the Archive to save anything) and tests the quote there too.

Sites that block us were not retried. Nothing was submitted, logged into, or worked around.

## Results

| Status | Rows | Share |
|---|---:|---:|
| verified | 73 | 12% |
| verified-archive | 13 | 2% |
| partial | 81 | 13% |
| quote-missing | 362 | 60% |
| blocked | 44 | 7% |
| dead | 22 | 4% |
| api | 11 | 2% |

Only **86 of 595** non-API rows (14%) are verified, live or archived. Adding partial matches gives 167 (28%). The 78 of 127 cities with no verified row at all are listed in the data file.

Of the 362 quote-missing rows, the quote's numbers (three digits or more) are on the page in 58, absent in 234, and 70 quotes have no such number:

| Case | Rows |
|---|---:|
| no 3-digit number in quote | 70 |
| numbers not on page | 234 |
| numbers on page | 58 |

### By source domain (25 sites with the most rows)

| Domain | Rows | Verified (live+archive) | Partial | Missing | Blocked | Dead |
|---|---:|---:|---:|---:|---:|---:|
| nomads.com | 66 | 1 (2%) | 1 | 64 | 0 | 0 |
| expatlife.ai | 43 | 3 (7%) | 8 | 32 | 0 | 0 |
| wise.com | 28 | 10 (36%) | 3 | 15 | 0 | 0 |
| numbeo.com | 22 | 0 (0%) | 2 | 20 | 0 | 0 |
| citycost.org | 19 | 1 (5%) | 0 | 18 | 0 | 0 |
| worldcostofliving.com | 15 | 2 (13%) | 1 | 12 | 0 | 0 |
| nomadranker.com | 14 | 4 (29%) | 1 | 9 | 0 | 0 |
| getwherenext.com | 12 | 1 (8%) | 2 | 9 | 0 | 0 |
| open.er-api.com | 11 | 0 (0%) | 0 | 0 | 0 | 0 |
| midlifenomads.com | 10 | 1 (10%) | 2 | 7 | 0 | 0 |
| idealista.com | 9 | 2 (22%) | 0 | 0 | 7 | 0 |
| nomadlio.com | 9 | 0 (0%) | 1 | 8 | 0 | 0 |
| casabasilico.com | 8 | 0 (0%) | 0 | 8 | 0 | 0 |
| novad.app | 8 | 0 (0%) | 0 | 0 | 0 | 8 |
| emlakjet.com | 7 | 0 (0%) | 0 | 7 | 0 | 0 |
| iamkohchang.com | 6 | 3 (50%) | 3 | 0 | 0 | 0 |
| nomad.watch | 6 | 4 (67%) | 0 | 2 | 0 | 0 |
| outtathecomfortzone.com | 6 | 0 (0%) | 1 | 5 | 0 | 0 |
| digitalnomads.world | 5 | 2 (40%) | 1 | 2 | 0 | 0 |
| workin.space | 5 | 0 (0%) | 3 | 2 | 0 | 0 |
| digimobil.es | 4 | 0 (0%) | 2 | 2 | 0 | 0 |
| enoughmoney.ai | 4 | 0 (0%) | 0 | 4 | 0 | 0 |
| geronimo-ai.com | 4 | 0 (0%) | 0 | 4 | 0 | 0 |
| globalcitizensolutions.com | 4 | 0 (0%) | 1 | 3 | 0 | 0 |
| innovires.com | 4 | 0 (0%) | 0 | 0 | 4 | 0 |

Blocked sites: idealista.com (7 rows), innovires.com (4), expatistan.com (3), and 23 other sites with one or two rows each. The archive did not confirm these either, so they stay unchecked rather than wrong.

### Cities with the weakest verified share

| City | Verified | Rows | Share |
|---|---:|---:|---:|
| chiang-mai | 0 | 7 | 0% |
| chania-crete | 0 | 5 | 0% |
| antigua | 0 | 4 | 0% |
| athens | 0 | 4 | 0% |
| auckland | 0 | 4 | 0% |
| bali-canggu-ubud | 0 | 4 | 0% |
| bangkok | 0 | 4 | 0% |
| belgrade | 0 | 4 | 0% |
| berlin | 0 | 4 | 0% |
| bratislava | 0 | 4 | 0% |
| brno | 0 | 4 | 0% |
| bucharest | 0 | 4 | 0% |
| budapest | 0 | 4 | 0% |
| cape-town | 0 | 4 | 0% |
| catania-sicily | 0 | 4 | 0% |

Most cities have 4 rows, none verified, so the order among them is not meaningful. Treat this as "78 cities have no verified row", not as a league table.

### Dead links

- amsterdam: https://www.thebrokebackpacker.com/cost-of-living-in-amsterdam-netherlands/ (HTTP 404)
- boquete: https://internationalliving.com/countries/panama/boquete-panama/ (HTTP 404)
- buenos-aires: https://nomad-labs.com/2026/03/02/buenos-aires-digital-nomad-moment/ (HTTP 404)
- catania-sicily: https://wavydestination.com/cost-of-living-in-sicily-2026-real-monthly-expenses-rent-food-budget-guide/ (HTTP 404)
- chiang-mai: https://www.asiapicks.com/blog/chiang-mai-digital-nomad (HTTP 410)
- galle: https://lankawebsites.com/home-and-life-style/realistic-cost-of-living-in-colombo-kandy-galle-and-jaffna-in-2026/ (HTTP no response)
- hanoi: https://novad.app/vietnam/hanoi (HTTP no response)
- marrakech: https://lovinmorocco.com/renting-apartment-marrakech-guide/ (HTTP no response)
- mendoza: https://novad.app/argentina/mendoza (HTTP no response)
- montreal: https://www.stm.info/sites/default/files/pdf/en/tarifs.pdf (HTTP 404)
- nice: https://wiggmap.com/chronicles/villes/chronicle-nice-france-en.html (HTTP no response)
- osaka: https://novad.app/japan/osaka (HTTP no response)
- oslo: https://novad.app/norway/oslo (HTTP no response)
- riga: https://novad.app/latvia/riga (HTTP no response)
- salta: https://novad.app/argentina/salta (HTTP no response)
- tbilisi: https://nomad-labs.com/2026/02/24/tbilisi-digital-nomads-cost-of-living-coworking/ (HTTP 404)
- thessaloniki: https://novad.app/greece/thessaloniki (HTTP no response)
- tokyo: https://rentremote.com/travel-guide/tokyo/activities/tokyo-for-remote-workers-in-2026-cost-comfort-and-daily-life (HTTP 404)
- utrecht: https://novad.app/netherlands/utrecht (HTTP no response)

novad.app no longer resolves (8 rows, 8 cities). Where the Archive has a copy, the data file records its `archiveUrl`.

## What I checked by hand

I opened the cached text and compared it with the quote for about 25 rows across every status, and changed the classifier three times as a result.

- **quote-missing, correctly so (12):** nomads.com Almaty says 1BR rent $784, the quote says $829; Antalya $595 versus $564; citycost.org Amsterdam $3,479 versus $3,516; Numbeo's "192 entries" count has moved; Wise Belgrade €521 is not on the page; combien-coute.net says 0,4 € where the quote has 0.46 €; xe.com's rate is set by JavaScript; casabasilico and emlakjet's quoted figures are not on the page. These pages show monthly-changing figures, so a quote taken in October often cannot match in late November.
- **quote-missing, arguably wrong (3):** workin.space "Monthly: 800 MAD per person" against the page's French "800 mad /mois /pers."; digimobil.es's English table row against Spanish text; expatlife.ai Antigua's "cost $400–$700 per month" against "rent from $400-$700". The numbers and meaning match, but the quote is a translation or paraphrase. The classifier is strict by design and calls these missing.
- **partial, correctly so (3):** bluescreen.kz (page has "220000 KZT ($440)" in a table, quote is a sentence); worldcostofliving Madrid (the archive page has "$ 2808 /mo", not the sentence); Avito (a listing page with different ads today).
- **verified, correct (2):** inwi fibre price on hespress.fr; the Spanish household power bill on energias-renovables.
- **verified-archive, correct (2):** Alicante's 24-euro bus pass (live page empty, snapshot has it); nomads.com Arequipa "87% cheaper than New York" (live number has moved, snapshot matches).
- **blocked and dead (3):** idealista returns 403 with "please enable js"; a Chania page is an empty shell; thebrokebackpacker Amsterdam returns a real "Page not found".

**Fixes made from this:** (1) quotes under about 25 letters that match were marked verified; 18 of those were things like "30 €/mes" or "12,570円" and are now partial. (2) A 503 answer was counted as dead; it is now blocked, because it often means a bot wall. (3) Text hidden in embedded JSON came back as escaped HTML; it is now unescaped before matching.

## Known limits of the classifier

- It is strict about wording. Translations, paraphrases, and table rows rebuilt as sentences read as quote-missing even when the figure is right. The "numbers on page" split above is the best hint for this.
- Prices on aggregator sites change monthly. A quote can be true when written and missing now. The archive fallback only helps when the Archive saved a copy near the evidence date, which it did for 13 rows.
- Pages that load their content with JavaScript, and PDFs without a text layer, look empty to us. We did not run a browser.
- `partial` is loose: numbers plus most words in a nearby window. Small numbers (a "2" or "7") are easy to match by chance, so this is a prompt for a human, not a pass.
- Numbers can match on the wrong line. The check does not know that "$829" is the studio and not the hostel.
- One fetch from one box on one day. A site that answered 403 to us may be fine in a browser.

## What the numbers do and do not prove

A verified quote proves one thing: the cited page contained that sentence. It does not prove the price is correct, current, typical for the neighbourhood, or comparable between cities. A blog can be wrong, and an asking price is not a signed lease. A missing quote does not prove the number is wrong either; it often means the page moved on.

What the run does show: only about one evidence row in seven can be confirmed from its link today, 78 cities have none, and 22 rows point at dead links. That is a weakness of the audit trail, and it is worth fixing by storing the archive link at the time the evidence is written.
