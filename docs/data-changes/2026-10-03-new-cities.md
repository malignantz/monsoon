# New cities: Antalya added, 6 still pending — 2026-10-03

The catalog goes from 120 to **121**. Existing cities are unchanged
(`add_city.py`: "invariant: 120 pre-existing city records unchanged"; `rebake_scores.py --check`: 0 deltas).

## Added

- **Antalya** (Turkey). Its only hold-back was PM2.5 *who-scale*: the WHO annual mean (25.2 µg/m³,
  one traffic station, 2019 and 2023) is 2.14 times the CAMS annual. A cited ground series now
  replaces all 12 months (`data/air-overrides.json`): the 2020-2025 mean of monthly means of valid,
  verified hourly PM2.5 at the national network's urban-background station TR070741, about 2 km from
  the city point, as reported to the EEA (E1a; EEA reuse policy allows commercial reuse with
  acknowledgement). Annual mean 19.7 µg/m³ with a flat shape and a small winter rise
  (Jan 23.9, Jul 16.5, Dec 24.6). The monthly means were recomputed by the lead from the hourly file.
  A nearby traffic station (TR070231, 2022-23) shows the same shape at 17.6.
  Temperature, humidity and rain days come from the Antalya airport station (WMO 17300, 7.7 km).
  Balanced Score by month: 70 75 78 83 86 83 77 76 87 89 81 72 (best Sep-Oct, then May).
  Next to Izmir (67-88, same shape) this looks right. Antalya's authored content (safety, costs,
  events) has not had the owner read the other 9 new cities had (see
  `2026-10-03-shipped-city-review.md`).

## Still pending (not added)

`python3 scripts/add_city.py --check` lists them. The Open-Meteo free quota was exhausted when it was
probed at 22:31 UTC on 2026-10-03, so no ERA5 could be fetched in this pass.

| city | hold-back | what clears it |
|---|---|---|
| Dakar | humidity: no ERA5 (the station has temperature and rain, no humidity); PM2.5 who-scale 2.30 | ERA5 fetch for humidity. PM2.5: no qualifying monthly ground series found. The U.S. Embassy monitor has no PM2.5 on AirNow for 2021-26; the CGQA studies give PM2.5 only as charts for 2010-18; the 2024 *Environmental Science: Atmospheres* paper is paywalled. Needs CGQA data or that paper's tables. |
| Galle | humidity: no ERA5 (the station has temperature and rain) | ERA5 fetch only |
| La Paz (Baja) | all climate: no ERA5, no WMO station within 35 km | ERA5 fetch only (coastal, so ERA5 is accepted) |
| Lima | all climate: no ERA5 (the nearest station, Ñaña, is 25 km inland and fails the 200 m height test); PM2.5 who-scale 2.05 | ERA5 fetch, then sanity-check it against Lima's known garúa climate before adding. PM2.5 candidate ready: SENAMHI San Borja (OpenAQ location 2402) for 2024-25 gives 16.2 17.4 19.2 22.0 33.1 35.2 33.7 30.1 33.1 24.7 24.2 22.9 (annual 26.0, consistent with the WHO 26.9). Not applied yet: SENAMHI's licence via OpenAQ is unconfirmed, and San Borja vs a San Borja/Campo de Marte mean (annual 23.4) is a choice for the owner. |
| Montréal | all climate: no ERA5; Canada's WMO 1991-2020 submission has no Montréal station | ERA5 fetch only (lowland) |
| Viña del Mar | temperature and humidity: no ERA5 (Rodelillo is 4.5 km away but fails the 200 m height test; Punta Ángeles has rain only) | ERA5 fetch only |

When the quota allows: `python3 scripts/add_city.py dakar galle la-paz-baja lima montreal vina-del-mar`
(the fetch is incremental and cached). Expect Galle, La Paz, Montréal and Viña del Mar to clear unless
a tropical rain-day hold applies (Galle and Dakar are tropical). Dakar stays pending on PM2.5, and so
does Lima until its override is applied.

## The 6 catalog cities without ERA5

Nha Trang, Ipoh, Skopje, Ohrid, Gdańsk and Querétaro keep their held-back temperature, humidity and
rain-day values (24 city-metrics, rule *pending*). Same quota stop. When the quota allows:
`python3 scripts/fetch_climate.py --only nha-trang,ipoh,skopje,ohrid,gdansk,queretaro`, then
`build_station_normals.py`, `calibrate_climate.py`, `calibrate_air.py`, `seed_holdbacks.py`,
`apply_climate_air.py --check` (review), `--write`, `rebake_scores.py`, `sanity_check.py`. Querétaro is
highland, so its humidity and night lows will stay held back under the highland rule.
