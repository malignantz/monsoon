#!/usr/bin/env python3
"""Fetch ERA5 daily history per city from Open-Meteo and build monthly climate normals.

Source: Open-Meteo Historical Weather API (ERA5 + ERA5-Land, "era5_seamless"),
https://archive-api.open-meteo.com/v1/archive — CC BY 4.0, no key.

For every city in data/travel-data.json (its lat/lng) this makes ONE request
covering the whole window (daily tmax/tmin/RH mean/precip, local-time days),
plus one tiny request with elevation=nan to record the raw model grid-cell
elevation (Open-Meteo otherwise lapse-rate-downscales temperature to a 90 m DEM
elevation at the point, which is what the main request returns). Raw responses
are cached under data/raw/climate/<slug>.json and <slug>.grid.json, so reruns
are resumable and work offline.

Per calendar month (averaged over every year in the window):
    tmaxC/tminC   mean of daily max / min 2 m temperature (°C; also °F)
    rhPct         mean of daily mean relative humidity (%)
    wetDays       mean count of days with precipitation >= 1.0 mm
    precipMm      mean monthly precipitation total (mm)

Writes data/climate-normals.json.

Usage:
    python3 scripts/fetch_climate.py              # fetch missing, rebuild normals
    python3 scripts/fetch_climate.py --offline    # cache only, no network
    python3 scripts/fetch_climate.py --only kotor,hanoi
"""
import datetime, json, os, sys, time
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from openmeteo_common import ROOT, load_cities, fetch_json, cached, c_to_f, DailyLimit

API = "https://archive-api.open-meteo.com/v1/archive"
START, END = "2015-01-01", "2024-12-31"
MODEL = "era5_seamless"
WET_MM = 1.0
# Extra thresholds kept so the ERA5 wet-day count can be calibrated against station
# normals (scripts/calibrate_climate.py) without the raw cache.
WET_GRID = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
RAW = os.path.join(ROOT, "data", "raw", "climate")
OUT = os.path.join(ROOT, "data", "climate-normals.json")
DAILY = ["temperature_2m_max", "temperature_2m_min", "relative_humidity_2m_mean", "precipitation_sum"]


def main_params(c):
    return {"latitude": c["lat"], "longitude": c["lng"], "start_date": START, "end_date": END,
            "daily": ",".join(DAILY), "timezone": "auto", "models": MODEL}


def grid_params(c):
    return {"latitude": c["lat"], "longitude": c["lng"], "start_date": END, "end_date": END,
            "daily": "temperature_2m_max", "models": MODEL, "elevation": "nan"}


def mean(xs):
    return sum(xs) / len(xs) if xs else None


def normals(raw):
    d = raw["daily"]
    by_mo = defaultdict(lambda: defaultdict(list))   # mo -> var -> daily values
    ym = defaultdict(lambda: {"wet": 0, "p": 0.0, "n": 0, "grid": defaultdict(int)})  # (y, m) -> totals
    for i, t in enumerate(d["time"]):
        y, m = int(t[:4]), int(t[5:7])
        for k in DAILY[:3]:
            v = d[k][i]
            if v is not None:
                by_mo[m][k].append(v)
        p = d["precipitation_sum"][i]
        if p is not None:
            ym[(y, m)]["p"] += p
            ym[(y, m)]["n"] += 1
            ym[(y, m)]["wet"] += p >= WET_MM
            for th in WET_GRID:
                ym[(y, m)]["grid"][th] += p >= th
    months = []
    for m in range(1, 13):
        tx, tn = mean(by_mo[m]["temperature_2m_max"]), mean(by_mo[m]["temperature_2m_min"])
        rh = mean(by_mo[m]["relative_humidity_2m_mean"])
        yrs = [v for (y, mm), v in ym.items() if mm == m and v["n"] >= 25]  # near-complete months only
        months.append({
            "mo": m,
            "tmaxC": round(tx, 2), "tminC": round(tn, 2),
            "tmaxF": round(c_to_f(tx), 1), "tminF": round(c_to_f(tn), 1),
            "rhPct": round(rh, 1),
            "wetDays": round(mean([v["wet"] for v in yrs]), 2),
            "precipMm": round(mean([v["p"] for v in yrs]), 1),
            "wetDaysByMm": {f"{th:g}": round(mean([v["grid"][th] for v in yrs]), 2) for th in WET_GRID},
            "nYears": len(yrs),
        })
    return months


def main():
    args = sys.argv[1:]
    offline = "--offline" in args
    only = None
    if "--only" in args:
        only = set(args[args.index("--only") + 1].split(","))

    cities = load_cities()
    out = {}
    fetched = 0
    for i, c in enumerate(cities, 1):
        if only and c["slug"] not in only:
            continue
        p_main = os.path.join(RAW, c["slug"] + ".json")
        p_grid = os.path.join(RAW, c["slug"] + ".grid.json")
        if offline and not (os.path.exists(p_main) and os.path.exists(p_grid)):
            print(f"[{i:3}] {c['slug']}: not cached, skipped (offline)")
            continue
        try:
            raw, new1 = cached(p_main, lambda: fetch_json(API, main_params(c)))
            if new1:
                time.sleep(2)
            grid, new2 = cached(p_grid, lambda: fetch_json(API, grid_params(c)))
        except DailyLimit as e:
            print(f"Daily API limit hit at {c['slug']} ({e}). Rerun tomorrow; cache is kept.")
            break
        if new1 or new2:
            fetched += 1
            print(f"[{i:3}] {c['slug']}: fetched (grid elev {grid['elevation']} m, DEM elev {raw['elevation']} m)")
            time.sleep(4)
        out[c["slug"]] = {
            "name": c["name"], "country": c["country"],
            "query": {"lat": c["lat"], "lng": c["lng"]},
            "grid": {"lat": raw["latitude"], "lng": raw["longitude"],
                     "elevation": raw["elevation"],             # DEM elevation temps are downscaled to
                     "modelCellElevation": grid["elevation"]},  # raw ERA5/ERA5-Land cell mean height
            "timezone": raw.get("timezone"),
            "months": normals(raw),
        }

    if only:  # merge into an existing file rather than truncating it
        if os.path.exists(OUT):
            prev = json.load(open(OUT))
            prev.update(out)
            out = {k: v for k, v in prev.items() if k != "_meta"}

    doc = {"_meta": {
        "source": "Open-Meteo Historical Weather API — ECMWF ERA5 / ERA5-Land reanalysis (model 'era5_seamless')",
        "url": API,
        "docs": "https://open-meteo.com/en/docs/historical-weather-api",
        "licence": "CC BY 4.0 (Open-Meteo); contains modified Copernicus Climate Change Service information",
        "attribution": "Weather data by Open-Meteo.com (CC BY 4.0); Hersbach et al. (2020) ERA5, Copernicus C3S",
        "window": f"{START}..{END}",
        "retrieved": datetime.date.today().isoformat(),
        "method": ("One request per city, daily values in local time. Per calendar month over the window: "
                   "mean daily max/min 2 m temperature; mean of daily-mean relative humidity; mean count of "
                   f"days with precipitation >= {WET_MM} mm; mean monthly precipitation total. "
                   "Months with <25 valid days are excluded from the wet-day / total averages."),
        "caveat": ("Reanalysis grid-cell values, not station normals. ERA5 is ~0.25° (~25-30 km), ERA5-Land "
                   "~0.1° (~9 km). Open-Meteo lapse-rate-downscales temperature from the model cell height "
                   "(grid.modelCellElevation) to a 90 m DEM height at the point (grid.elevation), but it cannot "
                   "fix land/sea mixing in coastal cells, valley inversions or urban heat islands. ERA5 tends to "
                   "over-count light-rain days in the tropics and smooth convective extremes."),
        "units": {"tmaxC": "°C", "tminC": "°C", "tmaxF": "°F", "tminF": "°F", "rhPct": "%",
                  "wetDays": "days/month (>= 1 mm)", "precipMm": "mm/month",
                  "wetDaysByMm": "days/month with precipitation >= key mm (for threshold calibration)"},
        "cities": len(out),
    }}
    doc.update(dict(sorted(out.items())))
    json.dump(doc, open(OUT, "w"), indent=1, ensure_ascii=False)
    print(f"\n{fetched} cities fetched this run; wrote {os.path.relpath(OUT, ROOT)} ({len(out)} cities)")


if __name__ == "__main__":
    main()
