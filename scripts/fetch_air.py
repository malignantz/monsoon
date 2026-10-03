#!/usr/bin/env python3
"""Fetch hourly PM2.5 per city from Open-Meteo (CAMS global) and build a monthly climatology.

Source: Open-Meteo Air Quality API, https://air-quality-api.open-meteo.com/v1/air-quality,
domain "cams_global" (Copernicus Atmosphere Monitoring Service global
atmospheric composition forecasts, ~0.4° / ~45 km). The archive starts in early
August 2022 (2022-08-01..03 are null; first values 2022-08-04), so the longest
window of complete 12-month years available on retrieval (2026-10) is
2022-09-01..2026-08-31 — every calendar month sampled exactly 4 times.

One request per city covering the whole window, raw response cached under
data/raw/air/<slug>.json (resumable, offline-capable).

Per calendar month: mean of the per-(year, month) mean hourly PM2.5 (each year
weighted equally; a year-month needs >= 80 % hourly coverage to count). The
year-to-year min/max of those monthly means are kept for context.

Writes data/air-climatology.json.

Incremental: a city already in the committed data/air-climatology.json whose
raw response is not cached keeps its committed entry; only cities missing from
both are fetched (--refetch with --only forces a fresh download).

Usage:
    python3 scripts/fetch_air.py              # fetch cities missing from the climatology, rebuild
    python3 scripts/fetch_air.py --offline
    python3 scripts/fetch_air.py --only hanoi,skopje [--refetch]
"""
import calendar, datetime, json, os, sys, time
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from openmeteo_common import ROOT, load_cities, fetch_json, cached, DailyLimit

API = "https://air-quality-api.open-meteo.com/v1/air-quality"
START, END = "2022-09-01", "2026-08-31"
DOMAIN = "cams_global"
MIN_COVERAGE = 0.8
RAW = os.path.join(ROOT, "data", "raw", "air")
OUT = os.path.join(ROOT, "data", "air-climatology.json")


def params(c):
    return {"latitude": c["lat"], "longitude": c["lng"], "start_date": START, "end_date": END,
            "hourly": "pm2_5", "domains": DOMAIN, "timezone": "auto"}


def climatology(raw):
    h = raw["hourly"]
    acc = defaultdict(list)  # (y, m) -> hourly values
    for t, v in zip(h["time"], h["pm2_5"]):
        if v is not None:
            acc[(int(t[:4]), int(t[5:7]))].append(v)
    months = []
    for m in range(1, 13):
        per_year = {}
        for (y, mm), vals in acc.items():
            if mm == m and len(vals) >= MIN_COVERAGE * 24 * calendar.monthrange(y, m)[1]:
                per_year[y] = sum(vals) / len(vals)
        ys = sorted(per_year.values())
        months.append({
            "mo": m,
            "pm25": round(sum(ys) / len(ys), 1) if ys else None,
            "yearMin": round(ys[0], 1) if ys else None,
            "yearMax": round(ys[-1], 1) if ys else None,
            "nYears": len(ys),
        })
    return months


def main():
    args = sys.argv[1:]
    offline = "--offline" in args
    only = set(args[args.index("--only") + 1].split(",")) if "--only" in args else None
    refetch = "--refetch" in args
    if refetch and not only:
        raise SystemExit("--refetch needs --only <slugs> (it deletes the raw cache for those cities)")
    prev_doc = json.load(open(OUT)) if os.path.exists(OUT) else {}
    prev = {k: v for k, v in prev_doc.items() if k != "_meta"}

    out, fetched = {}, 0
    for i, c in enumerate(load_cities(), 1):
        if only and c["slug"] not in only:
            continue
        path = os.path.join(RAW, c["slug"] + ".json")
        if refetch and os.path.exists(path):
            os.remove(path)
        elif not os.path.exists(path) and c["slug"] in prev:
            out[c["slug"]] = prev[c["slug"]]   # committed derived entry; no raw cache needed
            continue
        if offline and not os.path.exists(path):
            print(f"[{i:3}] {c['slug']}: not cached, skipped (offline)")
            continue
        try:
            raw, new = cached(path, lambda: fetch_json(API, params(c)))
        except DailyLimit as e:
            print(f"Daily API limit hit at {c['slug']} ({e}). Rerun later; cache is kept.")
            break
        months = climatology(raw)
        if new:
            fetched += 1
            print(f"[{i:3}] {c['slug']}: fetched, annual mean "
                  f"{sum(m['pm25'] for m in months) / 12:.1f} µg/m³")
            time.sleep(4)
        out[c["slug"]] = {
            "name": c["name"], "country": c["country"],
            "query": {"lat": c["lat"], "lng": c["lng"]},
            "grid": {"lat": raw["latitude"], "lng": raw["longitude"], "elevation": raw.get("elevation")},
            "months": months,
        }

    merged = dict(prev)   # never drop a committed entry
    merged.update(out)
    out = merged

    doc = {"_meta": {
        "source": "Copernicus Atmosphere Monitoring Service (CAMS) global atmospheric composition forecasts, via the Open-Meteo Air Quality API (domain 'cams_global')",
        "url": API,
        "docs": "https://open-meteo.com/en/docs/air-quality-api",
        "licence": "CC BY 4.0 (Open-Meteo); contains modified Copernicus Atmosphere Monitoring Service information",
        "attribution": "Air-quality data by Open-Meteo.com (CC BY 4.0); Copernicus Atmosphere Monitoring Service (CAMS)",
        "window": f"{START}..{END}",
        "windowNote": "Archive begins 2022-08-04; this is the longest span of complete 12-month years available at retrieval (4 samples per calendar month).",
        "retrieved": (datetime.date.today().isoformat() if fetched
                      else prev_doc.get("_meta", {}).get("retrieved", datetime.date.today().isoformat())),
        "method": ("One request per city, hourly PM2.5 (µg/m³) in local time. Per calendar month: mean of the "
                   "per-year monthly means (years weighted equally; a year-month needs >= 80% hourly coverage). "
                   "yearMin/yearMax = spread of those per-year monthly means."),
        "caveat": ("CAMS global is ~0.4° (~45 km) model output (forecast archive with data assimilation of "
                   "satellite AOD, not ground stations). It smooths and generally under-resolves urban "
                   "hotspots, traffic/heating-driven winter smog in basins (e.g. Skopje, Sarajevo) and local "
                   "agricultural burning; it can also overestimate desert-dust PM2.5. Treat as a regional "
                   "background estimate, not a city-centre measurement."),
        "units": {"pm25": "µg/m³ (monthly mean)"},
        "cities": len(out),
    }}
    doc.update(dict(sorted(out.items())))
    json.dump(doc, open(OUT, "w"), indent=1, ensure_ascii=False)
    print(f"\n{fetched} cities fetched this run; wrote {os.path.relpath(OUT, ROOT)} ({len(out)} cities)")


if __name__ == "__main__":
    main()
