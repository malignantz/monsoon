#!/usr/bin/env python3
"""Match each city to WMO 1991-2020 climatological standard normals stations.

Source: WMO Climatological Standard Normals for 1991-2020 (NCEI Accession 0253808),
https://doi.org/10.25921/800j-vn07 — composite primary-parameter CSVs plus, for
relative humidity (optional parameter code 38), the per-station CSV sheets.

Per city (lat/lng from data/travel-data.json, elevation from Open-Meteo's 90 m
DEM elevation API, cached in data/raw/elevation.json) and per element group:

    temp  TMAX + TMIN (all 12 months)
    rain  DP01 = mean days with precipitation >= 1 mm (all 12 months)
    hum   RH (param 38, station sheet) else derived from MNVP + TAVG

the best station is the one minimising dist_km + |dz_m| / 20 among stations with
dist <= MAX_KM and |dz| <= MAX_DZ. Groups are matched independently (a city can
take temperature from one station and rain days from another), and every match
records station name, WMO/WIGOS id, distance and elevation.

Writes data/station-normals.json. Raw downloads are cached under data/raw/.

Usage: python3 scripts/build_station_normals.py
"""
import csv, datetime, json, math, os, re, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from openmeteo_common import ROOT, load_cities, fetch_json, cached, UA

BASE = "https://www.ncei.noaa.gov/data/oceans/archive/arc0216/0253808/1.1/data/0-data"
RAW = os.path.join(ROOT, "data", "raw", "wmo-normals")
ELEV = os.path.join(ROOT, "data", "raw", "elevation.json")
OUT = os.path.join(ROOT, "data", "station-normals.json")
CLIM = os.path.join(ROOT, "data", "climate-normals.json")  # ERA5, used only as a QC reference
ELEMS = ["DP01", "TMAX", "TMIN", "TAVG", "MNVP"]
MAX_KM, MAX_DZ = 35.0, 200.0           # acceptance
HIGH_KM, HIGH_DZ = 20.0, 100.0         # "high" confidence
DZ_PER_KM = 20.0                       # 20 m of elevation mismatch ~ 1 km of distance


def get(url, path):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        data = urllib.request.urlopen(req, timeout=300).read()
        open(path, "wb").write(data)
        time.sleep(0.3)
    return open(path, "rb").read().decode("latin-1")


def num(v, lo):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x > lo else None


# The composite CSVs encode these countries' coordinates as DD.MM (degrees +
# minutes), not decimal degrees: none of Poland's 51 stations has a fractional
# part >= .60, and e.g. Krakow-Balice is listed at 50.045/19.481 (= 50°04.5'/19°48.1').
DMM_COUNTRIES = {"Poland", "Egypt"}


def dmm(x):
    sgn = -1 if x < 0 else 1
    x = abs(x)
    return sgn * (int(x) + (x - int(x)) * 100 / 60)


def load_composite(elem):
    txt = get(f"{BASE}/data-composite-primary-parameters/wmo_normals_9120_{elem}.csv",
              os.path.join(RAW, f"wmo_normals_9120_{elem}.csv"))
    out = {}
    lo = -0.001 if elem == "DP01" else (0 if elem == "MNVP" else -90)
    for r in list(csv.reader(txt.splitlines()))[1:]:
        if len(r) < 21:
            continue
        vals = [num(v, lo) for v in r[9:21]]
        if any(v is None for v in vals):
            continue
        lat, lon = float(r[4]), float(r[5])
        if r[7].strip() in DMM_COUNTRIES:
            lat, lon = dmm(lat), dmm(lon)
        out[r[2].strip()] = {"region": int(r[1]), "id": r[2].strip(), "wigos": r[3].strip(),
                             "lat": lat, "lon": lon, "rawLat": float(r[4]), "rawLon": float(r[5]),
                             "elev": num(r[6], -500),
                             "country": r[7].strip(), "name": r[8].strip(), "months": vals}
    return out


def haversine(a, b, c, d):
    p = math.pi / 180
    h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def city_elevations(cities):
    def fetch():
        out = {}
        for i in range(0, len(cities), 100):
            chunk = cities[i:i + 100]
            r = fetch_json("https://api.open-meteo.com/v1/elevation",
                           {"latitude": ",".join(str(c["lat"]) for c in chunk),
                            "longitude": ",".join(str(c["lng"]) for c in chunk)})
            out.update({c["slug"]: e for c, e in zip(chunk, r["elevation"])})
        return out
    return cached(ELEV, fetch)[0]


# Stations that pass the distance/elevation test but are not representative of
# the city (manual, with reason; recorded in _meta.excluded).
EXCLUDE = {
    ("gdansk", "Hel"): "tip of the Hel peninsula across the Gulf of Gdansk; open-sea exposure, not the city's climate",
}


def ranked(cands, c, z):
    """All acceptable stations for a city, best first, as match records."""
    scored = []
    for st in cands:
        if st["elev"] is None or (c["slug"], st["name"]) in EXCLUDE:
            continue
        dkm = haversine(c["lat"], c["lng"], st["lat"], st["lon"])
        dz = st["elev"] - z
        if dkm <= MAX_KM and abs(dz) <= MAX_DZ:
            scored.append((dkm + abs(dz) / DZ_PER_KM, dkm, dz, st))
    out = []
    for _, dkm, dz, st in sorted(scored, key=lambda t: t[0]):
        conf = "high" if dkm <= HIGH_KM and abs(dz) <= HIGH_DZ else "medium"
        out.append({"name": st["name"], "id": st["id"], "wigos": st["wigos"], "country": st["country"],
                    "lat": st["lat"], "lon": st["lon"], "elevation": st["elev"],
                    "distKm": round(dkm, 1), "dzM": round(dz), "confidence": conf, "_st": st})
    return out


# ---- quality control ----
# The composites contain some clearly mis-submitted series (e.g. Yerevan-Arabkir TMAX
# ~5 °C above any plausible mean maximum, Pafos DP01 = 33.7 days in January, Catania-
# Fontanarossa DP01 = 0 in months with 30+ mm, Marrakech MNVP giving RH 15-26 %).
# A station series is rejected (and the next-best station tried) if it fails these
# checks; ERA5 (data/climate-normals.json) is used as a coarse plausibility reference
# when available — its station MAE is ~1.2 °C / ~4.5 RH points, so the limits below
# only catch gross errors.
DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
QC_T_MEAN, QC_T_MAX = 5.5, 7.5      # °C, mean / worst-month |station - ERA5| (gross errors only)
QC_RH_MEAN = 15.0                   # RH points


def qc_temp(tx, tn, era):
    if any(a <= b for a, b in zip(tx, tn)):
        return "TMAX <= TMIN in some month"
    if era:
        for name, st, ref in (("TMAX", tx, [m["tmaxC"] for m in era]), ("TMIN", tn, [m["tminC"] for m in era])):
            d = [abs(a - b) for a, b in zip(st, ref)]
            if sum(d) / 12 > QC_T_MEAN or max(d) > QC_T_MAX:
                return f"{name} differs from ERA5 by mean {sum(d)/12:.1f} / max {max(d):.1f} °C"
    return None


def qc_rain(dp, prcp):
    if any(v > DAYS[i] for i, v in enumerate(dp)):
        return "DP01 exceeds days in month"
    for i, v in enumerate(dp):  # exact zero next to a clearly wet month = missing coded as 0
        if v == 0 and max(dp[i - 1], dp[(i + 1) % 12]) >= 4:
            return f"DP01 = 0 in month {i+1} next to a month with >= 4 wet days (missing coded as 0)"
    if prcp:
        for i, (v, p) in enumerate(zip(dp, prcp)):
            if p >= 10 and v < 0.5:
                return f"DP01 ~0 in month {i+1} with {p:.0f} mm precipitation (missing coded as 0)"
            if v > p + 0.5:
                return f"DP01 {v} > precipitation {p} mm in month {i+1}"
    return None


def qc_rh(rh, era):
    if any(not (5 <= v <= 100) for v in rh):
        return "RH outside 5-100 %"
    if era:
        d = [abs(a - m["rhPct"]) for a, m in zip(rh, era)]
        if sum(d) / 12 > QC_RH_MEAN:
            return f"RH differs from ERA5 by mean {sum(d)/12:.1f} pts"
    return None


# ---- per-station sheets (for RH, parameter code 38) ----

_dirs = {}


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def station_sheet(st):
    """Return the per-station CSV text for a composite station, or None."""
    meta = get(f"{BASE}/metadata/wmo_normals_9120_8param_meta.csv",
               os.path.join(RAW, "wmo_normals_9120_8param_meta.csv"))
    fname = None
    for r in list(csv.reader(meta.splitlines()))[1:]:
        # Country names may contain commas (e.g. "Hong_Kong,_China"): locate the status
        # column, lat/lon follow it, filename is the last field.
        k = next((i for i, v in enumerate(r) if v.strip() in ("WMO_Member", "Territory") or "Member" in v), None)
        if k is None or len(r) < k + 3:
            continue
        lat, lon = num(r[k + 1], -91), num(r[k + 2], -181)
        if lat is not None and lon is not None and abs(lat - st["rawLat"]) < 0.002 and abs(lon - st["rawLon"]) < 0.002:
            fname = r[-1].strip()
            break
    if not fname:
        return None
    reg = st["region"]
    if reg not in _dirs:
        html = get(f"{BASE}/Region-{reg}-WMO-Normals-9120/", os.path.join(RAW, f"region-{reg}-index.html"))
        _dirs[reg] = re.findall(r'href="([^"/?]+)/"', html)
    cdir = next((d for d in _dirs[reg] if norm(d) == norm(st["country"])), None)
    if not cdir:
        cdir = next((d for d in _dirs[reg] if norm(st["country"]).startswith(norm(d)) or norm(d).startswith(norm(st["country"]))), None)
    if not cdir:
        return None
    try:
        return get(f"{BASE}/Region-{reg}-WMO-Normals-9120/{cdir}/CSV/{fname}",
                   os.path.join(RAW, "stations", fname))
    except Exception as e:  # missing sheet: fall back to vapour-pressure RH
        print(f"    sheet {cdir}/{fname}: {e}", file=sys.stderr)
        return None


def sheet_rh(txt):
    for r in csv.reader(txt.splitlines()):
        if len(r) >= 16 and r[1].strip() == "38" and r[2].strip().lower() == "mean":
            vals = [num(v, 0) for v in r[4:16]]
            if all(v is not None and v <= 100 for v in vals):
                return vals
    return None


def magnus_es(t):
    return 6.112 * math.exp(17.62 * t / (243.12 + t))


def main():
    comp = {e: load_composite(e) for e in ELEMS + ["PRCP"]}
    temp_ids = set(comp["TMAX"]) & set(comp["TMIN"])
    temp_c = [comp["TMAX"][i] for i in temp_ids]
    rain_c = list(comp["DP01"].values())
    vp_ids = set(comp["MNVP"]) & set(comp["TAVG"])
    cities = load_cities()
    elev = city_elevations(cities)
    era5 = json.load(open(CLIM)) if os.path.exists(CLIM) else {}

    out, rejected = {}, []
    for c in cities:
        z = elev[c["slug"]]
        era = (era5.get(c["slug"]) or {}).get("months")
        rec = {"name": c["name"], "country": c["country"], "cityElevation": z,
               "qcReference": "era5" if era else "basic checks only (ERA5 pending)"}
        strip = lambda g: {k: g[k] for k in ("name", "id", "wigos", "country", "lat", "lon", "elevation",
                                             "distKm", "dzM", "confidence")}

        t = None
        for g in ranked(temp_c, c, z):
            st = g.pop("_st")
            tx, tn = st["months"], comp["TMIN"][st["id"]]["months"]
            why = qc_temp(tx, tn, era)
            if why:
                rejected.append((c["slug"], "temp", g["name"], why))
                continue
            t = dict(g, tmaxC=tx, tminC=tn)
            break

        r = None
        for g in ranked(rain_c, c, z):
            st = g.pop("_st")
            prcp = (comp["PRCP"].get(st["id"]) or {}).get("months")
            why = qc_rain(st["months"], prcp)
            if why:
                rejected.append((c["slug"], "rain", g["name"], why))
                continue
            r = dict(g, dp01=st["months"])
            break

        # humidity: RH param 38 from the chosen temp (or rain) station's sheet, else MNVP+TAVG
        h = None
        for g in (t, r):
            if g and h is None:
                txt = station_sheet(comp["TMAX"].get(g["id"]) or comp["DP01"].get(g["id"]))
                rh = sheet_rh(txt) if txt else None
                if rh:
                    why = qc_rh(rh, era)
                    if why:
                        rejected.append((c["slug"], "hum", g["name"] + " (param 38)", why))
                        continue
                    h = dict(strip(g), rhPct=rh, method="station RH normal (WMO param 38)")
        if h is None:
            for g in ranked([dict(comp["MNVP"][i], _tavg=comp["TAVG"][i]["months"]) for i in vp_ids], c, z):
                st = g.pop("_st")
                rh = [round(min(100.0, 100 * e / magnus_es(ta)), 1) for e, ta in zip(st["months"], st["_tavg"])]
                why = qc_rh(rh, era)
                if why:
                    rejected.append((c["slug"], "hum", g["name"] + " (MNVP)", why))
                    continue
                h = dict(g, rhPct=rh, method=("derived: 100*MNVP/es(TAVG) (Magnus); vs param-38 RH at 28 "
                                              "stations with both: bias +0.6, MAE 1.6 pts"))
                break
        rec.update({"temp": t, "rain": r, "hum": h})
        out[c["slug"]] = rec
        print(f"{c['slug']:28} temp:{(t or {}).get('name','-'):22} rain:{(r or {}).get('name','-'):22} "
              f"hum:{(h or {}).get('name','-')}")

    n = {g: sum(1 for v in out.values() if v[g]) for g in ("temp", "rain", "hum")}
    doc = {"_meta": {
        "source": "WMO Climatological Standard Normals 1991-2020 (WMO Member Nations), NCEI Accession 0253808",
        "url": BASE + "/",
        "doi": "https://doi.org/10.25921/800j-vn07",
        "citation": ("WMO Member Nations (2023). WMO Climatological Standard Normals for 1991-2020 (NCEI Accession "
                     "0253808). Primary parameters DP01/TMAX/TMIN/TAVG/MNVP + RH (param 38). NOAA National Centers "
                     f"for Environmental Information. https://doi.org/10.25921/800j-vn07. Accessed {datetime.date.today()}."),
        "licence": ("Public access (NCEI accessLevel: public; use constraint: cite as above). Climate normals are "
                    "'core data' under the WMO Unified Data Policy (Resolution 1, Cg-Ext(2021)), exchanged free "
                    "and unrestricted; redistribute with attribution."),
        "window": "1991-01-01..2020-12-31",
        "retrieved": datetime.date.today().isoformat(),
        "method": (f"Per city and element group (temp TMAX+TMIN, rain DP01 = days >= 1 mm, hum RH) pick the station "
                   f"minimising dist_km + |dz_m|/{DZ_PER_KM:g} with dist <= {MAX_KM:g} km and |dz| <= {MAX_DZ:g} m "
                   f"(city elevation = Open-Meteo 90 m DEM). confidence 'high' if dist <= {HIGH_KM:g} km and "
                   f"|dz| <= {HIGH_DZ:g} m, else 'medium'. RH from the station's param-38 normal when present, else "
                   "derived from mean vapour pressure and mean temperature (validated against param-38 at 28 stations: bias +0.6, MAE 1.6 RH points)."),
        "coverage": n,
        "excluded": {f"{k[0]}:{k[1]}": v for k, v in EXCLUDE.items()},
        "qc": (f"Series rejected (next-best station tried) if: TMAX <= TMIN; mean/worst-month |station - ERA5| > "
               f"{QC_T_MEAN:g}/{QC_T_MAX:g} °C; DP01 > days in month, DP01 ~0 with >= 10 mm PRCP, an exact 0 beside a month with >= 4 wet days, or DP01 > PRCP; "
               f"RH outside 5-100 or mean |station - ERA5| > {QC_RH_MEAN:g} pts. ERA5 comparison skipped where "
               "ERA5 is not yet fetched."),
        "rejected": [{"city": a, "group": b, "station": s_, "why": w} for a, b, s_, w in rejected],
        "caveat": ("Composite coordinates for Poland and Egypt are DD.MM, not decimal degrees, and are converted "
                   "before matching. Not every country submitted 1991-2020 normals (e.g. Vietnam, Cambodia, Portugal, Greece, Peru, "
                   "Taiwan, Albania, North Macedonia, Lithuania, Malta, Panama are absent); those cities fall back "
                   "to calibrated ERA5. Airport stations can differ from city centres by ~1 °C."),
    }}
    doc.update(out)
    json.dump(doc, open(OUT, "w"), indent=1, ensure_ascii=False)
    print(f"\ncoverage {n} of {len(out)}; wrote {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
