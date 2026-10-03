#!/usr/bin/env python3
"""Calibrate monthly PM2.5: CAMS seasonal shape x ground-measured annual mean.

    calibrated[m] = CAMS[m] * (ground_annual / mean(CAMS))      (per city)

Ground annual mean: WHO Ambient Air Quality Database, V8.0 (June 2026) —
settlement-level annual mean PM2.5 from official monitoring networks.
  * match: WHO settlement in the same country within MATCH_KM of the city point,
    preferring a name match; nearest otherwise
  * years: the latest up-to-3 reported years >= MIN_YEAR (annual means averaged)
  * WHO entries older than MIN_YEAR are recorded for reference but not used
    (European PM2.5 has fallen ~30-50 % since 2010)
OpenAQ was the intended fallback, but its v3 API now requires an API key
(HTTP 401 without one), so cities with no usable WHO entry keep raw CAMS
(confidence "low").

Then data/air-overrides.json is applied (documented, cited month overrides for
burning-season / basin-smog cases that the annual scaling still misses).

Writes data/air-calibrated.json.

Usage: python3 scripts/calibrate_air.py
"""
import csv, datetime, io, json, math, os, re, sys, unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from openmeteo_common import ROOT, DATA, city_slug, load_cities, UA
from xlsx_min import read_xlsx

WHO_URL = ("https://cdn.who.int/media/docs/default-source/air-pollution-documents/air-quality-and-health/"
           "who-ambient-air-quality-database-version-2026-v8.xlsx")
WHO_PAGE = "https://www.who.int/data/gho/data/themes/air-pollution/who-air-quality-database"
WHO_XLSX = os.path.join(ROOT, "data", "raw", "who-aaq", "who_aaq_v8.xlsx")
AIR = os.path.join(ROOT, "data", "air-climatology.json")
OVR = os.path.join(ROOT, "data", "air-overrides.json")
OUT = os.path.join(ROOT, "data", "air-calibrated.json")
MATCH_KM, NAME_KM, EXACT_KM, MIN_YEAR = 10.0, 25.0, 80.0, 2018

ISO3 = {  # catalog country -> ISO3 used by WHO
    "Thailand": "THA", "Vietnam": "VNM", "Indonesia": "IDN", "Malaysia": "MYS", "Cambodia": "KHM",
    "Georgia": "GEO", "Poland": "POL", "Hungary": "HUN", "Bulgaria": "BGR", "Serbia": "SRB",
    "Montenegro": "MNE", "Croatia": "HRV", "Albania": "ALB", "Spain": "ESP", "Portugal": "PRT",
    "Italy": "ITA", "Greece": "GRC", "Mexico": "MEX", "Guatemala": "GTM", "Colombia": "COL",
    "Argentina": "ARG", "Brazil": "BRA", "Uruguay": "URY", "Ecuador": "ECU", "Peru": "PER", "Chile": "CHL",
    "Slovenia": "SVN", "Armenia": "ARM", "Morocco": "MAR", "Turkey": "TUR", "Türkiye": "TUR", "Panama": "PAN",
    "Taiwan": "CHN", "South Africa": "ZAF", "Costa Rica": "CRI", "Cyprus": "CYP", "Malta": "MLT",
    "France": "FRA", "Czechia": "CZE", "Czech Republic": "CZE", "Lithuania": "LTU", "Estonia": "EST",
    "Latvia": "LVA", "Romania": "ROU", "Slovakia": "SVK", "Bosnia and Herzegovina": "BIH",
    "Bosnia & Herzegovina": "BIH", "Netherlands": "NLD", "Germany": "DEU", "Austria": "AUT",
    "Switzerland": "CHE", "United Kingdom": "GBR", "UK": "GBR", "Ireland": "IRL", "Denmark": "DNK",
    "Sweden": "SWE", "Finland": "FIN", "Norway": "NOR", "Canada": "CAN", "Australia": "AUS",
    "New Zealand": "NZL", "Japan": "JPN", "Philippines": "PHL", "North Macedonia": "MKD",
}


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^a-z]", "", "".join(ch for ch in s if not unicodedata.combining(ch)))


def hav(a, b, c, d):
    p = math.pi / 180
    h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def fnum(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def ensure_who():
    """Download the WHO workbook into the (gitignored) raw cache if it is missing."""
    if os.path.exists(WHO_XLSX):
        return
    import urllib.request
    os.makedirs(os.path.dirname(WHO_XLSX), exist_ok=True)
    req = urllib.request.Request(WHO_URL, headers={"User-Agent": UA})
    data = urllib.request.urlopen(req, timeout=300).read()
    open(WHO_XLSX + ".part", "wb").write(data)
    os.replace(WHO_XLSX + ".part", WHO_XLSX)


def load_who():
    ensure_who()
    # The workbook is a CSV dumped into column A; Excel split quoted fields that
    # contain commas into extra cells, so rejoin cells with "," before parsing.
    rows = list(read_xlsx(WHO_XLSX).values())[0]
    lines = [",".join("" if v is None else (str(int(v)) if isinstance(v, float) and v.is_integer() else str(v))
                      for v in r) for r in rows if r and r[0] is not None]
    out = []
    for r in csv.DictReader(io.StringIO("\n".join(lines))):
        pm, la, lo, yr = fnum(r.get("pm25_concentration")), fnum(r.get("latitude")), fnum(r.get("longitude")), fnum(r.get("year"))
        if pm is None or la is None or lo is None or yr is None:
            continue
        out.append({"city": r["city"], "iso3": r["iso3"], "year": int(yr), "pm25": pm,
                    "tempcov": fnum(r.get("pm25_tempcov")), "types": (r.get("type_of_stations") or "").strip(),
                    "nStations": r.get("number_stations"), "reference": (r.get("reference") or "").strip(),
                    "lat": la, "lon": lo})
    return out


def match(c, who):
    iso = ISO3.get(c["country"]) or c.get("iso3")
    cname = norm(c["name"].split("(")[0])
    cands = {}
    for r in who:
        if iso and r["iso3"] != iso:
            continue
        dk = hav(c["lat"], c["lng"], r["lat"], r["lon"])
        wname = norm(r["city"].split("/")[0])
        exact = bool(cname) and wname == cname
        named = exact or (bool(cname) and (wname.startswith(cname) or cname.startswith(wname)))
        # exact-name entries get extra slack: some WHO settlement coordinates are off
        # (e.g. Madrid/ESP is geocoded ~70 km SW of the city)
        if dk <= MATCH_KM or (named and dk <= NAME_KM) or (exact and dk <= EXACT_KM):
            e = cands.setdefault(r["city"], {"rows": [], "dist": dk, "named": named})
            e["rows"].append(dict(r, dist=dk))
            e["dist"] = min(e["dist"], dk)
    if not cands:
        return None
    # prefer settlements with recent data, then a name match, then proximity
    name, m = min(cands.items(), key=lambda kv: (not any(r["year"] >= MIN_YEAR for r in kv[1]["rows"]),
                                                 not kv[1]["named"], kv[1]["dist"]))
    m["city"] = name
    return m


def main():
    d = json.load(open(DATA))
    air = json.load(open(AIR))
    who = load_who()
    ovr = json.load(open(OVR)) if os.path.exists(OVR) else {"overrides": []}
    out, counts = {}, {"who-scaled": 0, "raw-cams": 0, "overridden-cities": 0}

    for c in load_cities():
        s = c["slug"]
        if s not in air:  # managed new city whose CAMS fetch is still pending
            print(f"{s:26} pending: no CAMS climatology yet (run fetch_air.py)")
            continue
        cams = [m["pm25"] for m in air[s]["months"]]
        cams_mean = sum(cams) / 12
        m = match({"name": c["name"], "country": c["country"], "lat": c["lat"], "lng": c["lng"],
                   "iso3": c.get("iso3")}, who)
        prov = {"camsAnnual": round(cams_mean, 1)}
        recent = sorted([r for r in (m["rows"] if m else []) if r["year"] >= MIN_YEAR], key=lambda r: r["year"])
        # one value per year (several rows per year = different versions; keep the latest listed)
        by_year = {}
        for r in recent:
            by_year[r["year"]] = r
        use = [by_year[y] for y in sorted(by_year)[-3:]]
        if use:
            ground = sum(r["pm25"] for r in use) / len(use)
            k = ground / cams_mean
            vals = [v * k for v in cams]
            latest = use[-1]["year"]
            conf = "high" if (len(use) >= 2 and latest >= 2021 and max(r["dist"] for r in use) <= MATCH_KM) else "medium"
            prov.update({
                "method": "cams-shape-x-who-annual", "source": "who-aaq-v8+cams-om", "confidence": conf,
                "whoSettlement": m["city"], "whoDistKm": round(max(r["dist"] for r in use), 1),
                "whoYears": [r["year"] for r in use], "whoAnnual": round(ground, 1),
                "whoStationTypes": use[-1]["types"][:80], "scale": round(k, 2),
                "reason": (f"CAMS seasonal shape scaled x{k:.2f} to WHO AAQ annual mean {ground:.1f} µg/m³ "
                           f"({m['city']}, {', '.join(str(r['year']) for r in use)})"
                           + ("" if conf == "high" else "; fewer than 2 recent years or older data")),
            })
            counts["who-scaled"] += 1
        else:
            vals = list(cams)
            stale = sorted(m["rows"], key=lambda r: r["year"])[-1] if m else None
            prov.update({
                "method": "raw-cams", "source": "cams-om", "confidence": "low",
                "reason": ("no WHO AAQ entry since %d near the city%s; OpenAQ needs an API key; raw CAMS "
                           "(~45 km model) kept" % (MIN_YEAR, f" (latest {stale['city']} {stale['year']}: "
                                                    f"{stale['pm25']:.1f} µg/m³, not used)" if stale else "")),
            })
            counts["raw-cams"] += 1

        applied = []
        for o in ovr["overrides"]:
            if o["city"] != s:
                continue
            for mo in o["months"]:
                before = vals[mo - 1]
                if "values" in o:
                    vals[mo - 1] = o["values"][str(mo)]
                elif "value" in o:
                    vals[mo - 1] = o["value"]
                else:
                    vals[mo - 1] = before * o["multiplier"]
                applied.append({"month": mo, "before": round(before, 1), "after": round(vals[mo - 1], 1)})
            prov["override"] = {"months": o["months"], "reason": o["reason"], "source": o["source"],
                                "sourceLicence": o.get("sourceLicence"), "changes": applied}
            prov["method"] += "+override"
            prov["source"] += "+override"
            if prov["confidence"] == "high":
                prov["confidence"] = "medium"
            prov["reason"] += f"; months {o['months']} overridden from cited ground data ({o['source']})"
        if any(o["city"] == s for o in ovr["overrides"]):
            counts["overridden-cities"] += 1
        out[s] = {"name": c["name"], "months": [round(v, 1) for v in vals], "prov": prov}

    doc = {"_meta": {
        "description": "Monthly PM2.5 = CAMS seasonal shape scaled to a ground-measured annual mean, plus cited overrides.",
        "sources": {
            "who-aaq-v8": {
                "name": "WHO Ambient Air Quality Database, Version 8.0 (update June 2026)",
                "url": WHO_URL, "page": WHO_PAGE,
                "citation": "World Health Organization (2026). WHO Ambient Air Quality Database (Version 8.0). Geneva, World Health Organization, 2026.",
                "licence": ("CC BY-NC-SA 3.0 IGO (WHO's standard licence for its information products). "
                            "Non-commercial, share-alike, attribution required — review before commercial use of "
                            "derived values."),
            },
            "cams-om": {"name": air["_meta"]["source"], "url": air["_meta"]["url"], "licence": air["_meta"]["licence"],
                        "window": air["_meta"]["window"]},
            "openaq": {"status": "not used — https://api.openaq.org/v3 returns HTTP 401 without an API key"},
        },
        "method": (f"calibrated[m] = CAMS[m] * WHO_annual / mean(CAMS). WHO settlement matched in the same country "
                   f"within {MATCH_KM:g} km of the city point (or {NAME_KM:g} km with a name-prefix match, {EXACT_KM:g} km with an exact name match); WHO annual = mean "
                   f"of the latest up-to-3 reported years >= {MIN_YEAR}. Note the year mismatch (WHO 2018-2025 vs "
                   f"CAMS {air['_meta']['window']}). Overrides from data/air-overrides.json are applied last."),
        "confidenceRules": {"high": "WHO-scaled, >= 2 years, latest >= 2021, within 10 km",
                            "medium": "WHO-scaled otherwise",
                            "low": "raw CAMS (no usable ground annual mean)"},
        "generated": datetime.date.today().isoformat(),
        "counts": counts,
    }}
    doc.update(out)
    json.dump(doc, open(OUT, "w"), indent=1, ensure_ascii=False)
    for s, v in out.items():
        p = v["prov"]
        print(f"{s:26} {p['method']:24} {p['confidence']:6} cams {p['camsAnnual']:5.1f} -> "
              f"{sum(v['months'])/12:5.1f}  {p.get('whoSettlement','')} {p.get('whoYears','')}"
              + (f"  OVR {p['override']['months']}" if p.get("override") else ""))
    print(counts, f"\nwrote {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
