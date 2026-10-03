#!/usr/bin/env python3
"""Seed data/climate-air-holdbacks.json: city-metrics that keep their current value.

Rule: no number gets worse. Where the calibrated value is not trustworthy enough
to beat the current hand-set value and the two differ materially, the current
value is held back (kept unchanged, shown as an editorial estimate, confidence
low, with the reason). apply_climate_air.py honours the file.

Rules (each entry records which one fired):
  pending    ERA5 not fetched yet for the city (Open-Meteo quota): every metric
             that is not backed by a high-confidence station normal.
  smog       Sofia / Plovdiv PM2.5 Nov-Mar: CAMS shape is flat although both have
             documented heating-season smog; no citable monthly series yet.
  who-scale  CAMS->WHO scale factor outside [SCALE_LO, SCALE_HI] with no cited
             override: model and ground disagree too much to trust the scaled shape.
  trop-rain  rain days from the provisional tropical ERA5 threshold (>= 6 mm, fitted
             on 8 cities) where the new value differs from the old by > 4 days.
  highland   humidity and night lows for highland/complex-terrain cities without a
             station (ERA5 cell RH is not elevation-corrected; valley cold pooling).
  station-vs-era5  station and ERA5 disagree by ~5 °C (San José): can't tell.
  shape      CAMS seasonal pattern runs opposite (r < -0.3) to a pronounced previous
             pattern (amplitude >= 10 µg/m³), e.g. Hanoi, Granada.
  material   any remaining non-high-confidence month that differs from the old
             value by a material amount (|Δtemp| >= 6 °F, |Δhum| >= 15, |Δrain| >= 6,
             PM2.5 off by >= 10 µg/m³ and >= 1.8x). Cited overrides are exempt.

Hand additions go in MANUAL below. Re-running overwrites the JSON.

New cities (added through scripts/add_city.py, so absent from the pre-pipeline
snapshot data/legacy-climate-air.json) have no previous value to keep, so a
hold-back means "no trustworthy value" and keeps the city out of the catalog.
new_city_holds() applies the same criteria where they do not need a previous
value: pending, who-scale, highland and station-vs-era5 unchanged; trop-rain
becomes "the provisional tropical threshold changes the answer by > 4 days"
(ERA5 days >= 1 mm vs days >= the fitted threshold); shape and material cannot
apply (no previous pattern/value) and are covered by the confidence label; smog
and other documented misses go in the city's climateAir.manualHolds.

Usage: python3 scripts/seed_holdbacks.py
"""
import datetime, json, os, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from openmeteo_common import ROOT, DATA, city_slug

P = lambda f: os.path.join(ROOT, "data", f)
OUT = P("climate-air-holdbacks.json")
SCALE_LO, SCALE_HI = 0.6, 2.0
GROUP = {"high": "temp", "low": "temp", "hum": "hum", "rain": "rain"}
MATERIAL = {"high": 6, "low": 6, "hum": 15, "rain": 6}
WINTER = [11, 12, 1, 2, 3]
SHAPE_R, SHAPE_AMP = -0.3, 10  # correlation / previous seasonal amplitude (µg/m³)


def corr(a, b):
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    da = sum((x - ma) ** 2 for x in a) ** 0.5
    db = sum((y - mb) ** 2 for y in b) ** 0.5
    return num / (da * db) if da and db else 0.0

MANUAL = [
    # {"city": "slug", "metric": "pm25", "months": [1, 2], "reason": "..."},
    {"city": "hanoi", "metric": "pm25", "months": "all", "rule": "manual",
     "reason": "the air model puts Hanoi's peaks in April and August, against the usual winter peak; the "
               "WHO annual mean is from 2018–2020 only"},
    {"city": "san-jose", "metric": "high", "months": "all", "rule": "station-vs-era5",
     "reason": "station and reanalysis disagree by about 5 °C"},
    {"city": "san-jose", "metric": "low", "months": "all", "rule": "station-vs-era5",
     "reason": "station and reanalysis disagree by about 5 °C"},
]


STATION_VS_ERA5_C = 4.5   # mean |station - ERA5| in °C that makes temperature unverifiable (San José: ~5)
TROP_RAIN_DAYS = 4


def new_city_holds(slug, lat, cc, ac, cr, manual=()):
    """Hold-backs for a city with no previous value. cc/ac = climate-/air-calibrated
    records (ac None if CAMS not fetched), cr = ERA5 normals record or None.
    Returns [{"metric", "months", "rule", "reason"}]."""
    out = []

    def hold(metric, months, rule, reason):
        out.append({"metric": metric, "months": months, "rule": rule, "reason": reason})

    for f in ("high", "low", "hum", "rain"):
        if cc["prov"][GROUP[f]]["method"] == "pending":
            hold(f, "all", "pending", "climate data not fetched yet and no nearby station")
    if ac is None:
        hold("pm25", "all", "pending", "air-quality data not fetched yet")
    else:
        ap = ac["prov"]
        k = ap.get("scale")
        if k is not None and not (SCALE_LO <= k <= SCALE_HI) and "override" not in ap:
            hold("pm25", "all", "who-scale", f"the air model and WHO ground data disagree by a factor of {k}")
    if cc["class"] == "highland":
        for f in ("hum", "low"):
            if cc["prov"][GROUP[f]]["method"] == "reanalysis":
                hold(f, "all", "highland", "no station, and reanalysis is unreliable in mountain terrain")
    tp = cc["prov"]["temp"]
    if tp["method"] == "station" and cr:
        st = tp["station"]
        stn = json.load(open(P("station-normals.json")))[slug]["temp"]
        dx = sum(abs(a - m["tmaxC"]) for a, m in zip(stn["tmaxC"], cr["months"])) / 12
        dn = sum(abs(a - m["tminC"]) for a, m in zip(stn["tminC"], cr["months"])) / 12
        if max(dx, dn) >= STATION_VS_ERA5_C:
            for f in ("high", "low"):
                hold(f, "all", "station-vs-era5",
                     f"station ({st['name']}) and reanalysis disagree by about {max(dx, dn):.0f} °C")
    rp = cc["prov"]["rain"]
    if rp["method"] == "reanalysis-calibrated" and abs(lat) < 23.5 and cr:
        ms = [i + 1 for i, (m, n) in enumerate(zip(cr["months"], cc["months"]))
              if abs(m["wetDaysByMm"]["1"] - n["rain"]) > TROP_RAIN_DAYS]
        if ms:
            hold("rain", ms, "trop-rain",
                 "tropical rain-day estimate depends on the provisional threshold by more than 4 days")
    for e in manual:
        hold(e["metric"], e["months"], "manual", e["reason"])
    return out


def main():
    d = json.load(open(DATA))
    # Compare against the pre-pipeline values (snapshot), not whatever is live now.
    legacy = json.load(open(P("legacy-climate-air.json")))
    new_cities = [c for c in d["cities"] if city_slug(c["name"]) not in legacy]
    d["cities"] = [c for c in d["cities"] if city_slug(c["name"]) in legacy]
    for c in d["cities"]:
        for f in ("high", "low", "hum", "rain", "pm25"):
            for i, m in enumerate(c["months"]):
                m[f] = legacy[city_slug(c["name"])][f][i]
    clim = json.load(open(P("climate-normals.json")))
    ccal = json.load(open(P("climate-calibrated.json")))
    acal = json.load(open(P("air-calibrated.json")))
    held = {}  # (slug, metric) -> {"months": set, "rule": str, "reason": str}

    def hold(slug, metric, months, rule, reason):
        k = (slug, metric)
        months = set(range(1, 13)) if months == "all" else set(months)
        if k in held:
            held[k]["months"] |= months
            if rule not in held[k]["rule"]:
                held[k]["rule"] += "+" + rule
            return
        held[k] = {"months": months, "rule": rule, "reason": reason}

    for e in MANUAL:
        hold(e["city"], e["metric"], e["months"], e.get("rule", "manual"), e["reason"])

    for c in d["cities"]:
        s = city_slug(c["name"])
        cc, ac = ccal[s], acal[s]
        trop = abs(c["lat"]) < 23.5

        # pending: ERA5 missing -> keep only high-confidence station metrics
        if s not in clim:
            for f in ("high", "low", "hum", "rain"):
                pv = cc["prov"][GROUP[f]]
                if not (pv["method"] == "station" and pv["confidence"] == "high"):
                    hold(s, f, "all", "pending",
                         "climate data not fetched yet and no nearby station")

        # smog
        if s in ("sofia", "plovdiv"):
            hold(s, "pm25", WINTER, "smog",
                 "the air model misses the documented winter heating smog; no citable monthly data yet")

        # who-scale
        ap = ac["prov"]
        k = ap.get("scale")
        if k is not None and not (SCALE_LO <= k <= SCALE_HI) and "override" not in ap:
            hold(s, "pm25", "all", "who-scale",
                 f"the air model and WHO ground data disagree by a factor of {k}")

        # shape: CAMS seasonal pattern contradicts a pronounced previous one
        if "override" not in ap:
            o, n = [m["pm25"] for m in c["months"]], ac["months"]
            r = corr(o, n)
            if r < SHAPE_R and max(o) - min(o) >= SHAPE_AMP:
                hold(s, "pm25", "all", "shape",
                     "the air model's seasonal pattern runs opposite to the documented one; no monthly "
                     "ground data to settle it")

        # trop-rain
        rp = cc["prov"]["rain"]
        if rp["method"] == "reanalysis-calibrated" and trop:
            ms = [i + 1 for i, (m, n) in enumerate(zip(c["months"], cc["months"])) if abs(n["rain"] - m["rain"]) > 4]
            if ms:
                hold(s, "rain", ms, "trop-rain",
                     "tropical rain-day estimate is provisional and differs by more than 4 days")

        # highland
        if cc["class"] == "highland":
            for f in ("hum", "low"):
                if cc["prov"][GROUP[f]]["method"] == "reanalysis":
                    hold(s, f, "all", "highland",
                         "no station, and reanalysis is unreliable in mountain terrain")

        # material
        for f, thr in MATERIAL.items():
            pv = cc["prov"][GROUP[f]]
            if pv["confidence"] == "high":
                continue
            ms = [i + 1 for i, (m, n) in enumerate(zip(c["months"], cc["months"])) if abs(n[f] - m[f]) >= thr]
            if ms:
                hold(s, f, ms, "material",
                     "the new value differs a lot and could not be verified")
        if ap["confidence"] != "high":
            ov = set((ap.get("override") or {}).get("months", []))
            ms = []
            for i, (m, v) in enumerate(zip(c["months"], ac["months"])):
                o = m["pm25"]
                if i + 1 in ov:
                    continue
                if abs(v - o) >= 10 and max(v, o) >= 1.8 * max(1, min(v, o)):
                    ms.append(i + 1)
            if ms:
                hold(s, "pm25", ms, "material",
                     "the new value differs a lot and could not be verified")

    # cities added through add_city.py: no previous value, new-city criteria
    if new_cities:
        from city_inputs import load_inputs
        inputs = {city_slug(v["name"]): v for v in load_inputs().values()}
        for c in new_cities:
            s = city_slug(c["name"])
            manual = (inputs.get(s, {}).get("climateAir") or {}).get("manualHolds", [])
            for h in new_city_holds(s, c["lat"], ccal[s], acal.get(s), clim.get(s), manual):
                hold(s, h["metric"], h["months"], h["rule"], h["reason"])

    rows = []
    for (s, f), v in sorted(held.items()):
        ms = sorted(v["months"])
        rows.append({"city": s, "metric": f, "months": "all" if len(ms) == 12 else ms,
                     "rule": v["rule"], "reason": v["reason"]})
    doc = {"_meta": {
        "description": ("City-metric-months that keep their current (pre-pipeline) value. apply_climate_air.py "
                        "leaves these numbers unchanged and marks their provenance 'Editorial estimate', "
                        "confidence low, with the reason as the note."),
        "seeded": datetime.date.today().isoformat(),
        "seededBy": "scripts/seed_holdbacks.py (rules in its docstring); edit MANUAL there for hand additions",
        "rules": {"pending": "ERA5 not fetched (quota) and no high-confidence station",
                  "smog": "Sofia/Plovdiv PM2.5 Nov-Mar",
                  "who-scale": f"CAMS->WHO factor outside [{SCALE_LO}, {SCALE_HI}] with no cited override",
                  "trop-rain": "provisional tropical rain threshold, |Δ| > 4 days",
                  "highland": "highland city without station: humidity and night lows",
                  "station-vs-era5": "station and ERA5 disagree by ~5 °C",
                  "shape": f"PM2.5 seasonal pattern correlates < {SHAPE_R} with a previous pattern spanning >= {SHAPE_AMP} µg/m³ (no override)",
                  "material": "non-high-confidence value differs materially from the previous one",
                  "manual": "hand-added case (see reason)"},
        "count": len(rows),
    }, "holdbacks": rows}
    json.dump(doc, open(OUT, "w"), indent=1, ensure_ascii=False)
    by = defaultdict(int)
    for r in rows:
        for rule in r["rule"].split("+"):
            by[rule] += 1
    print(f"{len(rows)} held-back city-metrics; by rule: {dict(by)}\nwrote {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
