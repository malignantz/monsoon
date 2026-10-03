# Review of the 9 cities shipped without an owner read — 2026-10-03

Agadir, Alicante, Almaty, Busan, Costa Adeje, Fukuoka, Hua Hin, Izmir and Phuket were added
on 2026-10-03 by `scripts/add_city.py` before anyone read the authored content. This pass
spot-checked `data/cities/<slug>.json` and `data/cost-evidence/<slug>.json` against primary
sources: the U.S. advisory feed, World Bank homicide, the FCDO pages, every cost link, event
editions, EF EPI, visa pages and sea temperatures. **No score changed** (`rebake_scores.py --check`:
0 deltas). Visa is not scored and no surface shows it.

## Fixed (text, citations, visa rules)

| city | field | was | now | source |
|---|---|---|---|---|
| Agadir | `english.rationale` | EF EPI 492 "Moderate band" | "Low band" (Moderate is 500-549) | ef.com/wwen/epi/about-epi/faq |
| Alicante | `season.rationale` | record 59.3% "in January" (read as 2026) | January 2025 | alicanteplaza.es, 17 Feb 2025 |
| Almaty | `narrative` | Medeu rink "within about an hour" | closed for reconstruction until about late 2027 | kt.kz; zakon.kz |
| Izmir | event blurb | International İzmir Festival "classical and jazz" | classical-music (the jazz festival is a separate March event) | iksev.org 2026 programme |
| Izmir | `safety.consulted` note | FCDO "nothing İzmir-specific" | notes the İzmir police-station attack the FCDO lists | gov.uk FCDO Turkey |
| Fukuoka | sakura festival source | quote was the 2025 edition | city press release: 25 Mar - 8 Apr 2026 (extended) | city.fukuoka.lg.jp, 2 Apr 2026 |
| Costa Adeje | Romería blurb | "20 January", shrine "above La Caleta" | late January (25 Jan 2026), from Adeje's church down to La Enramada beach | festivalesdeespana.com |
| Thailand (Hua Hin, Phuket, Bangkok, Chiang Mai) | `visa` via `scripts/add_visa.py` | visa-free 60 days | 30 days since 15 Sep 2026 | Royal Thai Embassy London, 8 Sep 2026 |
| Turkey AU (Izmir, Istanbul) | `visa` via `scripts/add_visa.py` | e-Visa required | visa-free 90/180 | mfa.gov.tr visa information |

## Found but not fixed here

- **Almaty coordinates** (43.2220, 76.8512) reverse-geocode to Auezov district, about 8 km west
  of the "Medeu district / Golden Square" the note describes; 43.2400, 76.9500 is in Medeu
  district. Moving the point needs a fresh CAMS fetch and elevation lookup for the new point
  (Open-Meteo quota was exhausted). The station match (Almaty OGMS, WMO 36870) should not
  change. Do it with: update `lat`/`lng`, drop `almaty` from `data/raw/elevation.json`,
  `fetch_air.py --only almaty --refetch`, then `add_city.py almaty`.

## Owner judgment calls (not changed)

- **Swim months, temperature vs local season.** Busan [7-9] and Fukuoka [7-9] follow the
  lifeguard season although the sea is ≥ 20 °C in June/October; Phuket [11-4] is restricted
  for monsoon rip currents although the sea is 28-30 °C all year, while Hua Hin is all 12;
  Costa Adeje is all 12 although Feb-Apr is about 19 °C (same convention as Las Palmas). Pick
  one rule.
- **Women's adjustments resting on ratios, not city evidence.** Agadir -12 ("half of
  Marrakech"); Hua Hin +5 vs Phuket and Bangkok 0; Costa Adeje -3 (as Las Palmas) vs Málaga and
  Valencia 0; the Costa Adeje rationale cites FCDO "rare sexual assaults", which the reviewer
  did not find on the current page.
- **Property sub-scores.** Busan 84 is above Osaka (83) although Korea's homicide rate is
  about twice Japan's; Hua Hin 74 equals Chiang Mai with no city-level crime data; Izmir 62 is
  street-crime only, while the FCDO lists an İzmir attack among its terrorism examples.
- **Event tiers across sibling cities.** Songkran is tier 2 in Hua Hin and Phuket but 3 in
  Bangkok and Chiang Mai; Ramadan/Ramazan Bayramı is 2 in Izmir and Istanbul but 1 in Antalya;
  La Pasión de Adeje tier 2 is generous; Hakata Dontaku tier 2 vs Yamakasa 3.
- **Movable feasts.** Agadir's Ramadan and Eid al-Adha list only the 2027 months; they drift
  about 11 days a year. Costa Adeje's Carnaval keeps [2,3] although the 2027 edition is all
  February.
- **Heat hazard.** Izmir is level 1 (Jul/Aug mean max 33 °C) while Athens is level 2.
- **Wording.** Busan's BIFF blurb "Asia's leading film festival" is an unsourced superlative;
  Almaty's season rationale names September but the cited page supports late May-June only;
  the Izmir fair blurb's "nightly concerts" is not on the cited page.
- **Stale or weak cost receipts.** The Hua Hin and Phuket SIM receipt is an expired dtac add-on
  page (the ~$12 figure is plausible); Almaty's Tele2 SIM price rises from 4,790 to 5,990 KZT
  after the promo; Izmir coworking ($160) rests on Regus alone and is rated `med`; Agadir
  transit (400 MAD) is above Numbeo's 250 MAD pass.
- **Stale advisories elsewhere in the catalog.** Bangkok and Chiang Mai still carry a Level 2
  advisory dated 2025-07-25; the live Thailand advisory is Level 1 (7 Jul 2026). The other Spanish
  cities' advisory date (2026-06-09) differs from the live entry (2026-08-01).

## Not reachable during the review

idealista.com, avito.ma, FazWaz and DDproperty (403): the Alicante, Costa Adeje, Agadir, Hua Hin
and Phuket rent receipts are unverified. Also travel.state.gov HTML (the advisory was read from
the State Department RSS and cadataapi feeds instead) and gov.kz (JavaScript only).
