#!/usr/bin/env python3
"""Apply calibrated climate + PM2.5 inputs to data/travel-data.json, honouring hold-backs.

Pipeline (each step writes a committed JSON file):
    fetch_climate.py          -> data/climate-normals.json     ERA5 (raw reanalysis)
    fetch_air.py              -> data/air-climatology.json     CAMS (raw model)
    build_station_normals.py  -> data/station-normals.json     WMO 1991-2020 station matches
    calibrate_climate.py      -> data/climate-calibrated.json  station-first high/low/hum/rain
    calibrate_air.py          -> data/air-calibrated.json      CAMS shape x WHO annual + overrides
    seed_holdbacks.py         -> data/climate-air-holdbacks.json  values NOT to replace
    apply_climate_air.py      (this) -> travel-data.json months + sources + per-city prov

Replaced per month: high, low (°F), hum (%), rain (days >= 1 mm), pm25 (µg/m³),
rounded to integers as before, and airCat/airColor derived from the final pm25.
A held-back city-metric-month keeps its current value. Untouched: risk/riskNote,
season, evtTier/events, costs, safety.

Provenance (read by src/lib/provenance.js provFor; detail bundle):
  sources[key] = {name, url, licence, window, retrieved, method, metric, role}
  city.prov    = {climate: <summary for the Weather row>, temp, hum, rain, pm25}
     each      = {source | sources, confidence, note, [station, distanceKm, elevationM]}
     held back = {source: "editorial", confidence: "low", note: <reason>}

Usage:
    python3 scripts/apply_climate_air.py                       # == --check (summary only)
    python3 scripts/apply_climate_air.py --check --report tmp/climate-air-applied.md
    python3 scripts/apply_climate_air.py --write [--report ...] # write, rebake, sanity check
"""
import copy, json, math, os, re, subprocess, sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from openmeteo_common import ROOT, DATA, city_slug
from rebake_scores import weather_score, air_score

P = lambda *a: os.path.join(ROOT, "data", *a)
FIELDS = ["high", "low", "hum", "rain", "pm25"]
GROUP = {"high": "temp", "low": "temp", "hum": "hum", "rain": "rain", "pm25": "pm25"}
LABEL = {"temp": "Temperature", "hum": "Humidity", "rain": "Rain days", "pm25": "PM2.5"}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
CONF_RANK = {"low": 0, "medium": 1, "high": 2}

# PM2.5 -> airCat/airColor. No script in the repo defines these bands; they are
# reverse-engineered from the existing data (non-overlapping on 1,332 city-months):
# Good 6-12, Moderate 13-25, Mediocre 26-35, Unhealthy 36-55, Very Unhealthy 58-90,
# Hazardous 130. The 91-129 boundary is unobserved; 125 is a judgement call.
AIR_BANDS = [
    (12, "Good", "#2ecc71"),
    (25, "Moderate", "#f1c40f"),
    (35, "Mediocre", "#e67e22"),
    (55, "Unhealthy", "#e74c3c"),
    (125, "Very Unhealthy", "#9b59b6"),
    (math.inf, "Hazardous", "#7d1128"),
]


def air_band(pm):
    for hi, cat, color in AIR_BANDS:
        if pm <= hi:
            return cat, color


def load():
    j = lambda f: json.load(open(P(f)))
    return (json.load(open(DATA)), j("climate-normals.json"), j("air-climatology.json"),
            j("station-normals.json"), j("climate-calibrated.json"), j("air-calibrated.json"),
            j("climate-air-holdbacks.json"))


def sources_table(clim, air, stn, ccal, acal):
    cm, am, sm = clim["_meta"], air["_meta"], stn["_meta"]
    wm = acal["_meta"]["sources"]["who-aaq-v8"]
    th = ccal["_meta"]["rainCalibration"]["thresholdMm"]
    return {
        "wmo-9120": {
            "name": "WMO Climatological Standard Normals 1991–2020 (station normals, via NOAA NCEI)",
            "url": sm["doi"], "licence": "Public (NOAA NCEI, cite Accession 0253808); WMO core data", "window": sm["window"], "retrieved": sm["retrieved"],
            "method": "Measured station normals: mean daily max/min temperature, days with >= 1 mm precipitation, "
                      "relative humidity, from the nearest station within 35 km and 200 m of the city.",
            "citation": sm["citation"], "metric": "climate", "role": "primary"},
        "era5-om": {
            "name": "ERA5 / ERA5-Land reanalysis via Open-Meteo",
            "url": "https://open-meteo.com/en/docs/historical-weather-api", "licence": "CC BY 4.0 (Open-Meteo); contains modified Copernicus Climate Change Service information",
            "window": cm["window"], "retrieved": cm["retrieved"],
            "method": f"Reanalysis grid cell, temperature downscaled to the city's elevation; rain days counted at "
                      f">= {th['extratropical']} mm (>= {th['tropical']} mm in the tropics), thresholds fitted to "
                      "station normals. Used where no station passed the checks.",
            "metric": "climate", "role": "fallback"},
        "cams-om": {
            "name": "CAMS global atmospheric composition (Copernicus) via Open-Meteo",
            "url": "https://open-meteo.com/en/docs/air-quality-api", "licence": "CC BY 4.0 (Open-Meteo); contains modified Copernicus Atmosphere Monitoring Service information",
            "window": am["window"], "retrieved": am["retrieved"],
            "method": "Modelled hourly PM2.5 (~45 km grid); used for the seasonal shape of each city's year.",
            "metric": "pm25", "role": "shape"},
        "who-aaq-v8": {
            "name": "WHO Ambient Air Quality Database v8.0 (2026)",
            "url": wm["page"], "licence": "CC BY-NC-SA 3.0 IGO. World Health Organization (2026), WHO Ambient Air Quality Database v8.0", "window": "latest 1–3 reported years, 2018–2025",
            "retrieved": acal["_meta"]["generated"],
            "method": "Ground-monitor annual mean PM2.5 per settlement; the CAMS seasonal shape is scaled to it.",
            "citation": wm["citation"], "metric": "pm25", "role": "level"},
        "editorial": {
            "name": "Editorial estimate (held back)",
            "method": "The previous hand-set value, kept because the measured or modelled replacement could not be "
                      "verified for this city. The note says why.",
            "metric": "any", "role": "holdback"},
    }


def holdback_index(hb):
    idx = {}
    for r in hb["holdbacks"]:
        ms = set(range(1, 13)) if r["months"] == "all" else set(r["months"])
        idx[(r["city"], r["metric"])] = (ms, r["reason"], r["rule"])
    return idx


def months_txt(ms):
    ms = sorted(ms)
    return "all months" if len(ms) == 12 else ", ".join(MONTHS[m - 1] for m in ms)


FIELD_LABEL = {"high": "Day highs", "low": "Night lows", "hum": "Humidity", "rain": "Rain days", "pm25": "PM2.5"}


REANALYSIS_NOTE = {
    "temp": {"lowland": "No station within 35 km; reanalysis adjusted to the city's elevation.",
             "coastal": "No station within 35 km; coastal reanalysis cell may blend land and sea.",
             "highland": "No station within 35 km; reanalysis in mountain terrain is less reliable."},
    "hum": {"lowland": "No station within 35 km; reanalysis grid-cell humidity.",
            "coastal": "No station within 35 km; coastal reanalysis cell may blend land and sea.",
            "highland": "No station within 35 km; grid-cell humidity is not adjusted for elevation."},
    "rain": {"lowland": "No station within 35 km; reanalysis rain days, threshold fitted to station normals.",
             "coastal": "No station within 35 km; reanalysis rain days, threshold fitted to station normals.",
             "highland": "No station within 35 km; reanalysis rain days in mountain terrain."},
}


def pretty_station(n):
    n = re.sub(r"_+", " ", n).strip()
    n = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", n)
    return n.title() if n.isupper() else n


def metric_prov(group, cpv, held, n_fields, cls="lowland"):
    """Compact prov for one metric group.

    cpv = calibrated prov; held = [(field, months, reason)] for this group's fields.
    The whole group becomes an editorial estimate only when every field is held
    for all 12 months; otherwise the source is kept and the note lists what was held.
    """
    if len(held) == n_fields and all(len(h[1]) == 12 for h in held):
        return {"source": "editorial", "confidence": "low",
                "note": ("; ".join(dict.fromkeys(h[2] for h in held)))[:240] + "."}
    o = {}
    if group == "pm25":
        if "scale" in cpv:
            o["sources"] = ["cams-om", "who-aaq-v8"]
            o["note"] = (f"CAMS seasonal shape scaled x{cpv['scale']} to the WHO ground annual mean "
                         f"{cpv['whoAnnual']} µg/m³ ({cpv['whoSettlement'].split('/')[0]}, "
                         f"{'–'.join(str(y) for y in sorted({cpv['whoYears'][0], cpv['whoYears'][-1]}))}).")
        else:
            o["source"] = "cams-om"
            o["note"] = "Raw CAMS model values: no recent WHO ground annual mean for this city."
        if cpv.get("override"):
            ov = cpv["override"]
            o["note"] += f" {months_txt(ov['months'])} from cited ground measurements ({ov['source']})."
        o["confidence"] = cpv["confidence"]
    else:
        if cpv["method"] == "station":
            st = cpv["station"]
            o.update({"source": "wmo-9120", "station": f"{pretty_station(st['name'])} (WMO {st['id'].lstrip('0')})",
                      "distanceKm": st["distKm"], "elevationM": round(st["elevation"])})
            if group == "hum" and "derived" in cpv.get("humMethod", ""):
                o["note"] = "Derived from the station's mean vapour pressure and temperature."
        elif cpv["method"].startswith("reanalysis"):
            o["source"] = "era5-om"
            o["reanalysis"] = True
            o["note"] = REANALYSIS_NOTE[group].get(cls, REANALYSIS_NOTE[group]["lowland"])
        else:  # legacy without hold-back should not happen (seed_holdbacks covers it)
            o["source"] = "editorial"
            o["note"] = cpv["reason"]
        o["confidence"] = cpv["confidence"]
    if held:
        bits = []
        for f, ms, reason in held:
            who = FIELD_LABEL[f] if n_fields > 1 else ""
            bits.append(f"{who + ' in ' if who else ''}{months_txt(ms)} kept as editorial estimates: {reason}")
        o["note"] = (o.get("note", "") + " " + "; ".join(bits) + ".").strip()
        heavy = sum(len(h[1]) for h in held) >= 6 * n_fields or any(len(h[1]) == 12 for h in held)
        o["confidence"] = "low" if heavy else min(o["confidence"], "medium", key=CONF_RANK.get)
    return o


def climate_summary(pt, ph, pr):
    """The single record the Weather row shows (provFor reads prov.climate first)."""
    parts = {"temp": pt, "hum": ph, "rain": pr}
    srcs = []
    for p in parts.values():
        for k in ([p["source"]] if "source" in p else p["sources"]):
            if k not in srcs:
                srcs.append(k)
    conf = min((p["confidence"] for p in parts.values()), key=CONF_RANK.get)
    bits = []
    for g, p in parts.items():
        what = LABEL[g].lower() if bits else LABEL[g]
        if p.get("station"):
            bits.append(f"{what}: station {p['station'].split(' (')[0]}")
        elif p.get("source") == "era5-om":
            bits.append(f"{what}: ERA5 reanalysis")
        else:
            bits.append(f"{what}: editorial estimate")
    o = {"sources": srcs, "confidence": conf, "note": "; ".join(bits) + "."}
    st = next((p for p in (pt, pr, ph) if p.get("station")), None)
    if st:
        o.update({"station": st["station"], "distanceKm": st["distanceKm"], "elevationM": st["elevationM"]})
    elif all(p.get("source") == "era5-om" for p in parts.values()):
        o["reanalysis"] = True
    return o


def build(d, clim, air, ccal, acal, hb):
    """Return (new_doc, info). info[(name, field)] = {"held": set(months), "rule": str|None, "method": str}."""
    idx = holdback_index(hb)
    nd = copy.deepcopy(d)
    info = {}
    for c, oc in zip(nd["cities"], d["cities"]):
        s = city_slug(c["name"])
        cc, ac = ccal[s], acal[s]
        for f in FIELDS:
            ms, reason, rule = idx.get((s, f), (set(), None, None))
            pv = ac["prov"] if f == "pm25" else cc["prov"][GROUP[f]]
            info[(c["name"], f)] = {"held": ms, "rule": rule, "reason": reason, "method": pv["method"]}
            for i, m in enumerate(c["months"]):
                if i + 1 in ms:
                    continue
                if f == "pm25":
                    m["pm25"] = round(ac["months"][i])
                else:
                    m[f] = round(cc["months"][i][f])
        for m in c["months"]:
            m["airCat"], m["airColor"] = air_band(m["pm25"])
        # provenance per group; a group's hold-backs come from its fields
        prov = {}
        for g in ("temp", "hum", "rain", "pm25"):
            fs = [f for f in FIELDS if GROUP[f] == g]
            held = [(f, *idx[(s, f)][:2]) for f in fs if (s, f) in idx]
            prov[g] = metric_prov(g, ac["prov"] if g == "pm25" else cc["prov"][g], held, len(fs), cc["class"])
        c["prov"] = {"climate": climate_summary(prov["temp"], prov["hum"], prov["rain"]), **prov}
    nd["sources"] = sources_table(clim, air, json.load(open(P("station-normals.json"))), ccal, acal)
    return nd, info


# ---------- scoring ----------

def qol_of(c, m, s):
    qw = (s["q_weather"], s["q_safety"], s["q_air"], s["q_season"], s["q_event"])
    w = round(weather_score(m, s), 1)
    a = round(air_score(m["pm25"], s), 1)
    qb = qw[0] * w + qw[1] * c["safety"]["score"] + qw[2] * a + qw[3] * m["seasonScore"] + qw[4] * m["eventScore"]
    return round(c["safety"]["qolFloor"] * qb, 1)


def scores(doc):
    s = doc["settings"]
    return {(c["name"], i): qol_of(c, m, s) for c in doc["cities"] for i, m in enumerate(c["months"])}


def md_table(header, rows):
    out = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    out += ["| " + " | ".join(str(x) for x in r) + " |" for r in rows]
    return "\n".join(out)


def drivers(c_old, c_new, mi, s):
    m_old, m_new = c_old["months"][mi], c_new["months"][mi]
    base = qol_of(c_old, m_old, s)
    parts = []
    for f in FIELDS:
        if m_old[f] != m_new[f]:
            parts.append((qol_of(c_old, dict(m_old, **{f: m_new[f]}), s) - base, f, m_old[f], m_new[f]))
    return sorted(parts, key=lambda p: -abs(p[0]))


def summary_counts(d, nd, info):
    cm = Counter()
    for (name, f), v in info.items():
        held = len(v["held"])
        cm[("held", f)] += held
        cm[("replaced", f)] += 12 - held
    return cm


def report(d, nd, info, hb, path):
    s = d["settings"]
    so, sn = scores(d), scores(nd)
    L = ["# Climate + PM2.5 applied — 2026-10-03\n",
         "Replaces the unsourced monthly climate (day high, night low, humidity, rain days) and PM2.5 inputs "
         "with WMO 1991–2020 station normals, ERA5 reanalysis (where no station passed the checks) and CAMS "
         "PM2.5 scaled to WHO ground annual means. Values that could not be verified were held back (kept "
         "unchanged, shown as editorial estimates with the reason). Generated by "
         f"`python3 scripts/apply_climate_air.py --report`.\n"]

    # counts
    cm = summary_counts(d, nd, info)
    L.append("## 1. Counts (city-months)\n")
    rows = [[f, cm[("replaced", f)], cm[("held", f)]] for f in FIELDS]
    rows.append(["**total**", sum(cm[("replaced", f)] for f in FIELDS), sum(cm[("held", f)] for f in FIELDS)])
    L.append(md_table(["field", "replaced", "held back"], rows) + "\n")
    meth = Counter()
    for (name, f), v in info.items():
        if len(v["held"]) < 12:
            meth[(f, v["method"])] += 1
    L.append("Method for replaced values (cities with at least one month replaced):\n")
    L.append(md_table(["field", "method", "cities"], [[f, m, n] for (f, m), n in sorted(meth.items())]) + "\n")
    rules = Counter()
    for r in hb["holdbacks"]:
        n = 12 if r["months"] == "all" else len(r["months"])
        for rule in r["rule"].split("+"):
            rules[rule] += 1
    L.append(f"Held-back city-metrics: **{len(hb['holdbacks'])}** "
             f"({sum(cm[('held', f)] for f in FIELDS)} city-months). By rule (an entry can match several): "
             + ", ".join(f"{k} {v}" for k, v in rules.most_common()) + ".\n")
    for k, v in hb["_meta"]["rules"].items():
        L.append(f"- **{k}** — {v}")
    L.append("")

    # movers
    L.append("## 2. Top 30 score movers (city-month, Balanced Score)\n")
    mv = []
    for c, nc in zip(d["cities"], nd["cities"]):
        for i in range(12):
            dq = sn[(c["name"], i)] - so[(c["name"], i)]
            mv.append((abs(dq), dq, i, c, nc))
    mv.sort(key=lambda t: -t[0])
    tab = []
    for _, dq, i, c, nc in mv[:30]:
        dr = drivers(c, nc, i, s)[:2]
        why = "; ".join(f"{f} {o}→{n} ({dv:+.1f}, {info[(c['name'], f)]['method']})" for dv, f, o, n in dr)
        tab.append([c["name"], MONTHS[i], f"{so[(c['name'], i)]} → {sn[(c['name'], i)]}", f"{dq:+.1f}", why])
    L.append(md_table(["city", "month", "score old → new", "Δ", "driver"], tab) + "\n")

    # rankings
    L.append("## 3. Top 20 before / after (Balanced Score, all 111 cities)\n")
    for mi in (0, 3, 6, 9):
        rank = lambda sc: {n: r for r, n in enumerate(sorted((c["name"] for c in d["cities"]),
                                                            key=lambda n: -sc[(n, mi)]), 1)}
        ro, rn = rank(so), rank(sn)
        ot, nt = sorted(ro, key=ro.get)[:20], sorted(rn, key=rn.get)[:20]
        tab = [[i + 1, f"{o} ({so[(o, mi)]})", f"{n} ({sn[(n, mi)]})",
                "=" if ro[n] == i + 1 else f"{ro[n] - i - 1:+d}"] for i, (o, n) in enumerate(zip(ot, nt))]
        moves = [abs(ro[k] - rn[k]) for k in ro]
        L.append(f"### {MONTHS[mi]}\n")
        L.append(md_table(["#", "before", "after", "Δrank"], tab) + "\n")
        L.append(f"- Dropped out: {', '.join(f'{x} (→#{rn[x]})' for x in ot if rn[x] > 20) or 'none'}")
        L.append(f"- Entered: {', '.join(f'{x} (from #{ro[x]})' for x in nt if ro[x] > 20) or 'none'}")
        L.append(f"- Mean |rank change|: {sum(moves)/len(moves):.1f}; max {max(moves)}\n")

    # hold-back list
    L.append("## 4. Full hold-back list\n")
    L.append(md_table(["city", "metric", "months", "rule", "reason"],
                      [[r["city"], r["metric"], months_txt(set(range(1, 13)) if r["months"] == "all" else r["months"]),
                        r["rule"], r["reason"]] for r in hb["holdbacks"]]) + "\n")
    L.append("Sources: WMO normals (NCEI, doi:10.25921/800j-vn07, public, cite-as); ERA5 and CAMS via Open-Meteo "
             "(CC BY 4.0, Copernicus); WHO Ambient Air Quality Database v8.0 (**CC BY-NC-SA 3.0 IGO**); PM2.5 "
             "overrides in data/air-overrides.json cite their own sources.\n")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write("\n".join(L))
    print(f"wrote {os.path.relpath(path, ROOT)}")


def main():
    args = sys.argv[1:]
    mode = "--write" if "--write" in args else "--check"
    live, clim, air, stn, ccal, acal, hb = load()
    # Baseline = live doc with the pre-pipeline climate/air inputs restored from the
    # snapshot, so held-back months get the old values and reruns are idempotent.
    legacy = json.load(open(P("legacy-climate-air.json")))
    d = copy.deepcopy(live)
    for c in d["cities"]:
        for f in FIELDS:
            for i, m in enumerate(c["months"]):
                m[f] = legacy[city_slug(c["name"])][f][i]
        for m in c["months"]:
            m["airCat"], m["airColor"] = air_band(m["pm25"])
        c.pop("prov", None)
    d.pop("sources", None)
    nd, info = build(d, clim, air, ccal, acal, hb)

    # every legacy-estimate metric must be held back (nothing unsourced slips through as "new")
    bad = [(n, f) for (n, f), v in info.items() if v["method"] == "legacy-estimate" and len(v["held"]) < 12]
    if bad:
        raise SystemExit(f"legacy-estimate values not covered by hold-backs: {bad[:10]} — rerun seed_holdbacks.py")

    cm = summary_counts(d, nd, info)
    for f in FIELDS:
        print(f"{f:5} replaced {cm[('replaced', f)]:4}  held back {cm[('held', f)]:4} city-months")
    size = len(json.dumps([c["prov"] for c in nd["cities"]], ensure_ascii=False, separators=(",", ":")))
    print(f"prov payload: {size/1024:.1f} KB for {len(nd['cities'])} cities")

    if "--report" in args:
        report(d, nd, info, hb, os.path.join(ROOT, args[args.index("--report") + 1]))

    if mode == "--write":
        json.dump(nd, open(DATA, "w"), indent=2, ensure_ascii=False)
        print(f"\nwrote {os.path.relpath(DATA, ROOT)} — rebaking scores + sanity check")
        here = os.path.dirname(os.path.abspath(__file__))
        subprocess.run([sys.executable, os.path.join(here, "rebake_scores.py"), "--write"], check=True)
        subprocess.run([sys.executable, os.path.join(here, "sanity_check.py")], check=True)
    else:
        print("\ncheck only — travel-data.json not modified")


if __name__ == "__main__":
    main()
