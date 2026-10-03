#!/usr/bin/env python3
"""Build calibrated monthly climate inputs (high/low/hum/rain) per city.

Precedence per metric group:
  1. WMO 1991-2020 station normal (data/station-normals.json), if a station passed
     the distance/elevation test for that group.
  2. ERA5 via Open-Meteo (data/climate-normals.json; temperature already
     lapse-rate-downscaled to the city's DEM height). Rain days use a wet-day
     threshold calibrated against the station-backed cities (fit reported here
     and in _meta.rainCalibration) instead of the raw >= 1 mm count.
  3. Neither (ERA5 fetch still pending): the legacy estimate is kept and flagged.

Each city gets prov.{temp,hum,rain} = {method, confidence, reason, [station]}.
Confidence for the reanalysis fallback is set from how well ERA5 matched the
station normals in the same city class (inland-lowland / coastal / highland).

Writes data/climate-calibrated.json.

The ERA5 rain-day thresholds and the ERA5-vs-station skill table (which sets the
reanalysis confidence labels) are FROZEN once written: a rerun reuses the values
in the existing file's _meta, so adding cities (or fetching ERA5 for a station
city) never shifts any other city's rain days or confidence. --refit recomputes
them from every station-backed city (a deliberate methodology change: review the
diff and log it in docs/data-changes/).

Cities come from openmeteo_common.load_cities(): the catalog plus managed inputs
in data/cities/ that are not in the catalog yet. A new city with neither a
station nor ERA5 gets method "pending" (no values).

Usage: python3 scripts/calibrate_climate.py [--refit]
"""
import datetime, json, os, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from openmeteo_common import ROOT, DATA, city_slug, c_to_f, load_cities

CLIM = os.path.join(ROOT, "data", "climate-normals.json")
STN = os.path.join(ROOT, "data", "station-normals.json")
OUT = os.path.join(ROOT, "data", "climate-calibrated.json")
HIGHLAND_M, GAP_M, COAST_M = 1000, 250, 100


def city_class(c, z, cr):
    """('highland'|'coastal'|'lowland', reason)."""
    gap = abs(cr["grid"]["modelCellElevation"] - cr["grid"]["elevation"]) if cr else 0
    if z >= HIGHLAND_M or gap >= GAP_M:
        return "highland", (f"highland/complex terrain (city {z:.0f} m, ERA5 cell "
                            f"{cr['grid']['modelCellElevation']:.0f} m)" if cr else f"highland ({z:.0f} m)")
    sea = (c.get("swim") or {}).get("body") == "sea"
    if sea and z < COAST_M:
        return "coastal", f"coastal (sea-swim city, {z:.0f} m): ERA5 cell may mix land and sea"
    return "lowland", "inland lowland"


def mean(xs):
    return sum(xs) / len(xs) if xs else float("nan")


def fit_rain(pairs):
    """pairs: [(cls, era5 wetDaysByMm dict, station dp01)] per city-month -> per-threshold stats."""
    ths = sorted({float(k) for _, g, _ in pairs for k in g})
    res = {}
    for cls in ("all", "tropical", "extratropical"):
        sub = [(g, s) for k, g, s in pairs if cls == "all" or k == cls]
        if not sub:
            continue
        res[cls] = {"n": len(sub) // 12, "grid": {}}
        for th in ths:
            d = [g[f"{th:g}"] - s for g, s in sub]
            res[cls]["grid"][f"{th:g}"] = {"bias": round(mean(d), 2), "mae": round(mean([abs(x) for x in d]), 2)}
        bt = min(res[cls]["grid"], key=lambda k: res[cls]["grid"][k]["mae"])
        res[cls]["best"] = bt
    return res


def main():
    refit = "--refit" in sys.argv[1:]
    d = json.load(open(DATA))
    catalog = {city_slug(c["name"]): c for c in d["cities"]}
    cities = load_cities()
    clim = json.load(open(CLIM))
    stn = json.load(open(STN))
    frozen = None
    if not refit and os.path.exists(OUT):
        fm = json.load(open(OUT)).get("_meta", {})
        if fm.get("rainCalibration") and fm.get("era5VsStation"):
            frozen = fm

    # ---------- 1. calibrate the ERA5 wet-day threshold against station DP01 ----------
    pairs, temp_err, hum_err = [], defaultdict(list), defaultdict(list)
    for c in ([] if frozen else d["cities"]):
        s = city_slug(c["name"])
        cr, sr = clim.get(s), stn.get(s)
        if not cr or not sr:
            continue
        z = sr["cityElevation"]
        cls, _ = city_class(c, z, cr)
        if sr["rain"]:
            band = "tropical" if abs(c["lat"]) < 23.5 else "extratropical"
            pairs += [(band, m["wetDaysByMm"], dp) for m, dp in zip(cr["months"], sr["rain"]["dp01"])]
        if sr["temp"]:
            for m, tx, tn in zip(cr["months"], sr["temp"]["tmaxC"], sr["temp"]["tminC"]):
                temp_err[cls] += [c_to_f(m["tmaxC"]) - c_to_f(tx), c_to_f(m["tminC"]) - c_to_f(tn)]
        if sr["hum"]:
            hum_err[cls] += [m["rhPct"] - h for m, h in zip(cr["months"], sr["hum"]["rhPct"])]
    def era5_skill(errs):
        return {k: {"bias": round(mean(v), 2), "mae": round(mean([abs(x) for x in v]), 2), "n": len(v)}
                for k, v in errs.items()}

    if frozen:
        rain_fit = frozen["rainCalibration"]["fit"]
        th = frozen["rainCalibration"]["thresholdMm"]
        tskill, hskill = frozen["era5VsStation"]["tempF"], frozen["era5VsStation"]["rhPct"]
    else:
        rain_fit = fit_rain(pairs)
        # Use a separate tropical threshold only if it beats the global one there by > 0.5 day MAE.
        th_all = rain_fit["all"]["best"]
        th = {"extratropical": rain_fit["extratropical"]["best"], "tropical": rain_fit["tropical"]["best"]}
        if rain_fit["tropical"]["grid"][th_all]["mae"] - rain_fit["tropical"]["grid"][th["tropical"]]["mae"] <= 0.5:
            th["tropical"] = th_all
        if rain_fit["extratropical"]["grid"][th_all]["mae"] - rain_fit["extratropical"]["grid"][th["extratropical"]]["mae"] <= 0.5:
            th["extratropical"] = th_all
        tskill, hskill = era5_skill(temp_err), era5_skill(hum_err)
    rain_mae = {b: rain_fit[b]["grid"][th[b]]["mae"] for b in th}

    def re_conf(skill, cls, good, ok):
        mae = skill.get(cls, {}).get("mae", 99)
        return "high" if mae <= good else ("medium" if mae <= ok else "low"), mae

    # ---------- 2. per-city calibrated values ----------
    out = {}
    for c in cities:
        s = c["slug"]
        legacy_months = catalog[s]["months"] if s in catalog else None
        cr, sr = clim.get(s), stn[s]
        z = sr["cityElevation"]
        cls, cls_reason = city_class(c, z, cr)
        band = "tropical" if abs(c["lat"]) < 23.5 else "extratropical"
        months = [{} for _ in range(12)]
        prov = {}

        def station_prov(g, what):
            st = {k: g[k] for k in ("name", "id", "wigos", "country", "lat", "lon", "elevation", "distKm", "dzM")}
            return {"method": "station", "source": "wmo-9120", "station": st, "confidence": g["confidence"],
                    "reason": f"WMO 1991-2020 {what} normal at {g['name']} ({g['distKm']} km, {g['dzM']:+d} m)"}

        def legacy(what):
            if legacy_months is None:  # new city: there is no previous estimate to keep
                return {"method": "pending", "confidence": None,
                        "reason": f"no station within limits and ERA5 not fetched yet; no {what} value"}
            return {"method": "legacy-estimate", "confidence": "low",
                    "reason": f"no station within limits and ERA5 fetch pending (Open-Meteo quota); old unsourced {what} kept"}

        def old(i, f):
            return legacy_months[i][f] if legacy_months is not None else None

        # temperature
        if sr["temp"]:
            for i in range(12):
                months[i]["high"] = round(c_to_f(sr["temp"]["tmaxC"][i]), 1)
                months[i]["low"] = round(c_to_f(sr["temp"]["tminC"][i]), 1)
            prov["temp"] = station_prov(sr["temp"], "Tmax/Tmin")
        elif cr:
            for i, m in enumerate(cr["months"]):
                months[i]["high"], months[i]["low"] = m["tmaxF"], m["tminF"]
            conf, mae = re_conf(tskill, cls, 1.5, 3.0)
            if cls != "lowland" and conf == "high":
                conf = "medium"
            prov["temp"] = {"method": "reanalysis", "source": "era5-om", "confidence": conf,
                            "grid": cr["grid"],
                            "reason": f"no station; ERA5 (elevation-downscaled), {cls_reason}; ERA5 vs stations in "
                                      f"{cls} cities: MAE {mae:.1f} °F"}
        else:
            for i in range(12):
                months[i]["high"], months[i]["low"] = old(i, "high"), old(i, "low")
            prov["temp"] = legacy("high/low")

        # humidity
        if sr["hum"]:
            for i in range(12):
                months[i]["hum"] = round(sr["hum"]["rhPct"][i], 1)
            prov["hum"] = station_prov(sr["hum"], "relative-humidity")
            prov["hum"]["humMethod"] = sr["hum"]["method"]
        elif cr:
            for i, m in enumerate(cr["months"]):
                months[i]["hum"] = m["rhPct"]
            conf, mae = re_conf(hskill, cls, 4.0, 8.0)
            if cls != "lowland" and conf == "high":
                conf = "medium"
            prov["hum"] = {"method": "reanalysis", "source": "era5-om", "confidence": conf,
                           "reason": f"no station; ERA5 cell RH (not elevation-corrected), {cls_reason}; ERA5 vs "
                                     f"stations in {cls} cities: MAE {mae:.1f} pts"}
        else:
            for i in range(12):
                months[i]["hum"] = old(i, "hum")
            prov["hum"] = legacy("humidity")

        # rain days
        if sr["rain"]:
            for i in range(12):
                months[i]["rain"] = round(sr["rain"]["dp01"][i], 1)
            prov["rain"] = station_prov(sr["rain"], "days >= 1 mm")
        elif cr:
            t = th[band]
            for i, m in enumerate(cr["months"]):
                months[i]["rain"] = m["wetDaysByMm"][t]
            mae = rain_mae[band]
            conf = "medium" if mae <= 2.0 and cls == "lowland" else "low"
            prov["rain"] = {"method": "reanalysis-calibrated", "source": "era5-om", "confidence": conf,
                            "thresholdMm": float(t),
                            "reason": f"no station; ERA5 days >= {t} mm (threshold fitted to {band} station "
                                      f"normals, MAE {mae:.1f} d), {cls_reason}"}
        else:
            for i in range(12):
                months[i]["rain"] = old(i, "rain")
            prov["rain"] = legacy("rain days")

        out[s] = {"name": c["name"], "class": cls, "cityElevation": z, "months": months, "prov": prov}

    cov = defaultdict(lambda: defaultdict(int))
    for v in out.values():
        for g, p in v["prov"].items():
            cov[g][p["method"]] += 1
    doc = {"_meta": {
        "description": "Calibrated monthly climate inputs: WMO station normals first, else ERA5 (Open-Meteo).",
        "sources": {"wmo-9120": stn["_meta"]["citation"], "era5-om": clim["_meta"]["source"] + " " + clim["_meta"]["url"]},
        "generated": datetime.date.today().isoformat(),
        "fitFrozen": bool(frozen),
        "rainCalibration": {
            "target": "WMO 1991-2020 DP01 (days >= 1 mm) at station-backed cities",
            "thresholdMm": th, "fit": rain_fit,
            "note": "Thresholds chosen by min MAE over all city-months; separate tropical threshold used only if it improves tropical MAE by > 0.5 day."},
        "era5VsStation": {"tempF": tskill, "rhPct": hskill,
                          "classes": {"highland": f"city >= {HIGHLAND_M} m or |ERA5 cell - DEM| >= {GAP_M} m",
                                      "coastal": f"sea-swim city (data/swim-inputs.json) below {COAST_M} m",
                                      "lowland": "everything else"}},
        "confidenceRules": {
            "station": "high if <= 20 km and |dz| <= 100 m, else medium (see station-normals _meta)",
            "reanalysis temp/hum": "from ERA5-vs-station MAE in the same city class (temp high <= 1.5 °F, medium <= 3; "
                                   "RH high <= 4, medium <= 8); never above medium for highland/coastal",
            "reanalysis rain": "medium if lowland and fitted MAE <= 2 days, else low",
            "legacy-estimate": "low (old unsourced value kept; ERA5 pending)"},
        "coverage": {g: dict(v) for g, v in cov.items()},
    }}
    doc.update(out)
    json.dump(doc, open(OUT, "w"), indent=1, ensure_ascii=False)

    print("Rain-day threshold fit vs WMO DP01 (days >= 1 mm):")
    for b, r in rain_fit.items():
        g = r["grid"]
        print(f"  {b:13} n={r['n']:3}  >=1mm bias {g['1']['bias']:+.2f} MAE {g['1']['mae']:.2f} | best >= {r['best']} mm "
              f"bias {g[r['best']]['bias']:+.2f} MAE {g[r['best']]['mae']:.2f}")
    print(f"  chosen thresholds: {th}")
    print(f"ERA5 vs station temp °F: {tskill}")
    print(f"ERA5 vs station RH pts: {hskill}")
    print(f"coverage: { {g: dict(v) for g, v in cov.items()} }")
    print(f"wrote {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
