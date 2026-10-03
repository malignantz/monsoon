#!/usr/bin/env python3
"""Map calibrated climate + PM2.5 inputs into data/travel-data.json.

Pipeline (each step writes a committed JSON file):
    fetch_climate.py          -> data/climate-normals.json    ERA5 (raw reanalysis)
    fetch_air.py              -> data/air-climatology.json    CAMS (raw model)
    build_station_normals.py  -> data/station-normals.json    WMO 1991-2020 station matches
    calibrate_climate.py      -> data/climate-calibrated.json station-first high/low/hum/rain
    calibrate_air.py          -> data/air-calibrated.json     CAMS shape x WHO annual + overrides
    apply_climate_air.py      (this) -> travel-data.json months + sources + per-city prov

Fields replaced per month: high, low (°F), hum (%), rain (days >= 1 mm), pm25
(µg/m³) and the derived airCat/airColor (all rounded to integers, as today).
Untouched: risk/riskNote (hazards), season, evtTier/events, costs, safety.

Provenance written on --write:
    sources   top-level table {key: {name, url, licence, window, retrieved, method}}
    city.prov {temp|hum|rain|pm25: {method, source, confidence, reason, [station], ...}}

Usage:
    python3 scripts/apply_climate_air.py                       # == --check
    python3 scripts/apply_climate_air.py --check --report tmp/climate-air-diff.md
    python3 scripts/apply_climate_air.py --write [--allow-legacy]   # then rebake + sanity check
"""
import copy, json, math, os, subprocess, sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from openmeteo_common import ROOT, DATA, city_slug
from rebake_scores import weather_score, air_score

P = lambda *a: os.path.join(ROOT, "data", *a)
FIELDS = ["high", "low", "hum", "rain", "pm25"]
GROUP = {"high": "temp", "low": "temp", "hum": "hum", "rain": "rain", "pm25": "pm25"}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

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
            j("station-normals.json"), j("climate-calibrated.json"), j("air-calibrated.json"))


def sources_table(clim, air, stn, ccal, acal):
    cm, am, sm, wm = clim["_meta"], air["_meta"], stn["_meta"], acal["_meta"]["sources"]["who-aaq-v8"]
    return {
        "wmo-9120": {"name": sm["source"], "url": sm["doi"], "licence": sm["licence"], "window": sm["window"],
                     "retrieved": sm["retrieved"], "method": sm["method"], "citation": sm["citation"]},
        "era5-om": {"name": cm["source"], "url": cm["url"], "licence": cm["licence"], "window": cm["window"],
                    "retrieved": cm["retrieved"], "method": cm["method"],
                    "rainThresholdMm": ccal["_meta"]["rainCalibration"]["thresholdMm"]},
        "cams-om": {"name": am["source"], "url": am["url"], "licence": am["licence"], "window": am["window"],
                    "retrieved": am["retrieved"], "method": am["method"]},
        "who-aaq-v8": {"name": wm["name"], "url": wm["url"], "licence": wm["licence"],
                       "window": "latest up-to-3 reported years >= 2018", "retrieved": acal["_meta"]["generated"],
                       "method": acal["_meta"]["method"], "citation": wm["citation"]},
    }


def build(d, clim, air, ccal, acal, mode):
    """Deep copy of d with inputs from 'raw' (ERA5 >= 1 mm + raw CAMS) or 'cal' (calibrated)."""
    nd = copy.deepcopy(d)
    for c in nd["cities"]:
        s = city_slug(c["name"])
        for i, m in enumerate(c["months"]):
            if mode == "raw":
                cr = clim.get(s)
                if cr:
                    cm = cr["months"][i]
                    m["high"], m["low"] = round(cm["tmaxF"]), round(cm["tminF"])
                    m["hum"], m["rain"] = round(cm["rhPct"]), round(cm["wetDays"])
                m["pm25"] = round(air[s]["months"][i]["pm25"])
            else:
                cm = ccal[s]["months"][i]
                m["high"], m["low"] = round(cm["high"]), round(cm["low"])
                m["hum"], m["rain"] = round(cm["hum"]), round(cm["rain"])
                m["pm25"] = round(acal[s]["months"][i])
            m["airCat"], m["airColor"] = air_band(m["pm25"])
        if mode == "cal":
            c["prov"] = dict(ccal[s]["prov"], pm25=acal[s]["prov"])
    return nd


# ---------- scoring (rebake_scores.py formulas, in memory) ----------

def qol_of(c, m, s):
    qw = (s["q_weather"], s["q_safety"], s["q_air"], s["q_season"], s["q_event"])
    w = round(weather_score(m, s), 1)
    a = round(air_score(m["pm25"], s), 1)
    qb = qw[0] * w + qw[1] * c["safety"]["score"] + qw[2] * a + qw[3] * m["seasonScore"] + qw[4] * m["eventScore"]
    return round(c["safety"]["qolFloor"] * qb, 1)


def scores(doc):
    s = doc["settings"]
    return {(c["name"], i): qol_of(c, m, s) for c in doc["cities"] for i, m in enumerate(c["months"])}


# ---------- report helpers ----------

def md_table(header, rows):
    out = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    out += ["| " + " | ".join(str(x) for x in r) + " |" for r in rows]
    return "\n".join(out)


def stats(pairs):
    dd = [n - o for o, n in pairs]
    return (sum(dd) / len(dd), sum(map(abs, dd)) / len(dd), max(map(abs, dd)))


def summary(d, raw, cal, covered_raw):
    rows = []
    for f in FIELDS:
        o_r, o_c, r_c = [], [], []
        for c, rc, cc in zip(d["cities"], raw["cities"], cal["cities"]):
            ok = f == "pm25" or c["name"] in covered_raw
            for m, rm, cm in zip(c["months"], rc["months"], cc["months"]):
                o_c.append((m[f], cm[f]))
                if ok:
                    o_r.append((m[f], rm[f]))
                    r_c.append((rm[f], cm[f]))
        a, b, cmx = stats(o_r), stats(o_c), stats(r_c)
        rows.append([f, f"{sum(o for o, _ in o_c)/len(o_c):.1f}",
                     f"{a[0]:+.2f} / {a[1]:.2f}", f"{b[0]:+.2f} / {b[1]:.2f} (max {b[2]})", f"{cmx[1]:.2f}"])
    return md_table(["field", "old mean", "raw − old (bias / MAE)", "calibrated − old (bias / MAE)",
                     "calibrated vs raw MAE"], rows)


def mover_reason(c_old, c_cal, mi, s):
    """Attribute a city-month qol change to fields by swapping each field in alone."""
    m_old, m_new = c_old["months"][mi], c_cal["months"][mi]
    base = qol_of(c_old, m_old, s)
    parts = []
    for f in FIELDS:
        if m_old[f] == m_new[f]:
            continue
        t = dict(m_old, **{f: m_new[f]})
        parts.append((qol_of(c_old, t, s) - base, f, m_old[f], m_new[f]))
    parts.sort(key=lambda p: -abs(p[0]))
    return parts


def report(d, clim, air, stn, ccal, acal, raw, cal, path):
    s = d["settings"]
    covered_raw = {c["name"] for c in d["cities"] if city_slug(c["name"]) in clim}
    L = ["# Climate + PM2.5 — old vs raw reanalysis vs calibrated (check mode, nothing written)\n",
         f"Generated by `python3 scripts/apply_climate_air.py --check --report {os.path.relpath(path, ROOT)}`.\n",
         "- **old** = current unsourced values in data/travel-data.json",
         f"- **raw** = ERA5 (Open-Meteo, {clim['_meta']['window']}; rain = days ≥ 1 mm) + raw CAMS "
         f"({air['_meta']['window']})",
         "- **calibrated** = WMO 1991–2020 station normals where a station is within limits, else ERA5 (rain at a "
         "threshold fitted to station DP01); PM2.5 = CAMS seasonal shape × WHO AAQ v8 annual mean, plus cited overrides",
         f"- ERA5 is still missing for {len(d['cities']) - len(covered_raw)} cities (Open-Meteo daily quota); "
         "where they also lack a station the old value is kept and flagged `legacy-estimate`. Raw-vs-old stats "
         "cover only cities with ERA5.\n"]

    # 1. coverage
    L.append("## 1. Coverage and confidence\n")
    rows = []
    for g in ("temp", "hum", "rain", "pm25"):
        meth = Counter(c["prov"][g]["method"] for c in cal["cities"])
        conf = Counter(c["prov"][g]["confidence"] for c in cal["cities"])
        rows.append([g, ", ".join(f"{k} {v}" for k, v in meth.most_common()),
                     ", ".join(f"{k} {conf.get(k, 0)}" for k in ("high", "medium", "low"))])
    L.append(md_table(["metric", "method (cities)", "confidence (cities)"], rows) + "\n")

    # 2. field summary
    L.append("## 2. Field summary (all city-months)\n")
    L.append(summary(d, raw, cal, covered_raw) + "\n")
    cats = Counter((m["airCat"], nm["airCat"]) for c, nc in zip(d["cities"], cal["cities"])
                   for m, nm in zip(c["months"], nc["months"]))
    L.append(f"airCat changes old → calibrated: {sum(v for (a, b), v in cats.items() if a != b)} of "
             f"{sum(cats.values())} city-months.\n")

    # 3. calibration fits
    rc = ccal["_meta"]["rainCalibration"]
    L.append("## 3. Calibration fits\n")
    L.append("### Rain days: ERA5 wet-day threshold vs WMO DP01 (days ≥ 1 mm) at station-backed cities\n")
    rows = []
    for band, r in rc["fit"].items():
        g = r["grid"]
        rows.append([band, r["n"], f"{g['1']['bias']:+.2f} / {g['1']['mae']:.2f}",
                     f"≥ {r['best']} mm: {g[r['best']]['bias']:+.2f} / {g[r['best']]['mae']:.2f}"])
    L.append(md_table(["band", "cities", "≥ 1 mm bias / MAE (days)", "best threshold bias / MAE"], rows))
    L.append(f"\nChosen: {rc['thresholdMm']} (tropical threshold fitted on only "
             f"{rc['fit']['tropical']['n']} cities — treat as provisional).\n")
    ev = ccal["_meta"]["era5VsStation"]
    L.append("### ERA5 vs station normals (same cities), used to grade reanalysis-fallback confidence\n")
    L.append(md_table(["class", "Tmax/Tmin bias / MAE (°F)", "RH bias / MAE (pts)"],
                      [[k, f"{ev['tempF'][k]['bias']:+.2f} / {ev['tempF'][k]['mae']:.2f}",
                        f"{ev['rhPct'][k]['bias']:+.2f} / {ev['rhPct'][k]['mae']:.2f}" if k in ev["rhPct"] else "–"]
                       for k in ev["tempF"]]) + "\n")
    am = acal["_meta"]
    scaled = [(v["name"], v["prov"]) for k, v in acal.items() if k != "_meta" and "scale" in v["prov"]]
    ks = sorted(p["scale"] for _, p in scaled)
    L.append("### PM2.5: CAMS → WHO annual scale factors\n")
    L.append(f"{len(scaled)} cities WHO-scaled; median factor {ks[len(ks)//2]:.2f} (CAMS annual × factor = WHO "
             f"annual). Extreme factors (< 0.6 or > 2): " + ", ".join(
                 f"{n} ×{p['scale']} ({p['whoSettlement']}, {p['whoStationTypes'][:30] or 'type n/a'})"
                 for n, p in sorted(scaled, key=lambda t: t[1]["scale"]) if p["scale"] < 0.6 or p["scale"] > 2) + "\n")

    # 4. worst 15 per field (calibrated vs old)
    L.append("## 4. Worst 15 cities per field (calibrated vs old, mean |Δ| over 12 months)\n")
    for f in FIELDS:
        g = GROUP[f]
        rows = []
        for c, rc_, cc in zip(d["cities"], raw["cities"], cal["cities"]):
            ms = [(i, m[f], rm[f], cm[f]) for i, (m, rm, cm) in enumerate(zip(c["months"], rc_["months"], cc["months"]))]
            mae = sum(abs(n - o) for _, o, _, n in ms) / 12
            rows.append((mae, c, ms, cc["prov"][g]))
        rows.sort(key=lambda t: -t[0])
        tab = []
        for mae, c, ms, pv in rows[:15]:
            wi, wo, wr, wn = max(ms, key=lambda t: abs(t[3] - t[1]))
            st = pv.get("station", {}).get("name", "")
            tab.append([c["name"], f"{mae:.1f}", f"{MONTHS[wi]} {wo} / {wr} / {wn}",
                        f"{pv['method']}{' (' + st + ')' if st else ''}", pv["confidence"]])
        L.append(f"### {f}\n")
        L.append(md_table(["city", "MAE vs old", "worst month old / raw / cal", "calibrated method", "conf."], tab) + "\n")

    # 5. rankings
    L.append("## 5. Simulated top-20 (Balanced Score) — old vs calibrated, all 111 cities\n")
    L.append("Scores recomputed with `rebake_scores.py` formulas on in-memory copies; safety/season/events/hazard "
             "multipliers unchanged. Raw-reanalysis rank in brackets for reference.\n")
    so, sr, sc = scores(d), scores(raw), scores(cal)
    for mi in (0, 6, 9):
        rank = lambda sc_: {n: r for r, n in enumerate(sorted((c["name"] for c in d["cities"]),
                                                             key=lambda n: -sc_[(n, mi)]), 1)}
        ro, rr, rcl = rank(so), rank(sr), rank(sc)
        old_top = sorted(ro, key=ro.get)[:20]
        cal_top = sorted(rcl, key=rcl.get)[:20]
        tab = [[i + 1, f"{o} ({so[(o, mi)]})", f"{n} ({sc[(n, mi)]})",
                ("=" if ro[n] == i + 1 else f"{ro[n] - i - 1:+d}") + f" [raw #{rr[n]}]"]
               for i, (o, n) in enumerate(zip(old_top, cal_top))]
        moves = [abs(ro[k] - rcl[k]) for k in ro]
        L.append(f"### {MONTHS[mi]}\n")
        L.append(md_table(["#", "old (qol)", "calibrated (qol)", "Δrank vs old [raw rank]"], tab) + "\n")
        L.append(f"- Dropped out: {', '.join(f'{x} (→#{rcl[x]})' for x in old_top if rcl[x] > 20) or 'none'}")
        L.append(f"- Entered: {', '.join(f'{x} (from #{ro[x]})' for x in cal_top if ro[x] > 20) or 'none'}")
        L.append(f"- Mean |rank change| over 111 cities: {sum(moves)/len(moves):.1f}; max {max(moves)}\n")

    # 6. top 25 movers
    L.append("## 6. Top 25 score movers (mean |Δqol| over 12 months, old → calibrated)\n")
    L.append("Reason = the fields whose individual swap moves that city's biggest-changing month most "
             "(Δqol contribution in brackets), with the calibrated method for that metric.\n")
    movers = []
    for c, cc in zip(d["cities"], cal["cities"]):
        dq = [sc[(c["name"], i)] - so[(c["name"], i)] for i in range(12)]
        movers.append((sum(map(abs, dq)) / 12, sum(dq) / 12, c, cc, dq))
    movers.sort(key=lambda t: -t[0])
    tab = []
    for mae, bias, c, cc, dq in movers[:25]:
        mi = max(range(12), key=lambda i: abs(dq[i]))
        parts = mover_reason(c, cc, mi, s)[:3]
        why = "; ".join(f"{f} {o}→{n} ({dv:+.1f}, {cc['prov'][GROUP[f]]['method']})" for dv, f, o, n in parts)
        tab.append([c["name"], f"{mae:.1f}", f"{bias:+.1f}", f"{MONTHS[mi]} {dq[mi]:+.1f}", why])
    L.append(md_table(["city", "mean |Δqol|", "mean Δqol", "biggest month", "reason (that month)"], tab) + "\n")

    # 7. unresolved
    L.append("## 7. Large old-vs-calibrated gaps where the calibrated value is not high-confidence\n")
    L.append("Criteria: |Δhigh| or |Δlow| ≥ 6 °F, |Δhum| ≥ 15 pts, |Δrain| ≥ 6 days, or PM2.5 off by ≥ 10 µg/m³ "
             "and ≥ 1.8× either way — and the calibrated metric's confidence is medium/low. Station-backed "
             "high-confidence gaps are treated as resolved in favour of the station and are not listed. These are "
             "the cases where I could not tell which value is right.\n")
    tab = []
    for c, cc in zip(d["cities"], cal["cities"]):
        hits = []
        for i, (m, n) in enumerate(zip(c["months"], cc["months"])):
            for f, thr in (("high", 6), ("low", 6), ("hum", 15), ("rain", 6)):
                if abs(n[f] - m[f]) >= thr and cc["prov"][GROUP[f]]["confidence"] != "high":
                    hits.append((f, MONTHS[i], m[f], n[f]))
            o, p = m["pm25"], n["pm25"]
            if abs(p - o) >= 10 and max(p, o) >= 1.8 * max(1, min(p, o)) and cc["prov"]["pm25"]["confidence"] != "high":
                hits.append(("pm25", MONTHS[i], o, p))
        if hits:
            by = defaultdict(list)
            for f, mo, o, n in hits:
                by[f].append(f"{mo} {o}→{n}")
            tab.append([c["name"], len(hits), "; ".join(f"**{f}** ({cc['prov'][GROUP[f]]['confidence']}): "
                                                      + ", ".join(v[:4]) + (" …" if len(v) > 4 else "")
                                                      for f, v in by.items())])
    tab.sort(key=lambda r: -r[1])
    L.append(md_table(["city", "city-months", "details (old→calibrated)"], tab) + "\n")
    unres = json.load(open(P("air-overrides.json")))["_meta"].get("unresolved", {})
    if unres:
        L.append("Known PM2.5 gaps with no citable override yet: " +
                 "; ".join(f"**{k}** — {v}" for k, v in unres.items()) + "\n")

    drift = sum(1 for c in d["cities"] for i, m in enumerate(c["months"]) if abs(so[(c["name"], i)] - m["qol"]) > 0.11)
    L.append(f"_Parity: recomputed old qol differs from stored qol in {drift} city-months (should be 0)._\n")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write("\n".join(L))
    print(f"wrote {os.path.relpath(path, ROOT)}")


def main():
    args = sys.argv[1:]
    mode = "--write" if "--write" in args else "--check"
    d, clim, air, stn, ccal, acal = load()
    raw = build(d, clim, air, ccal, acal, "raw")
    cal = build(d, clim, air, ccal, acal, "cal")
    cal["sources"] = sources_table(clim, air, stn, ccal, acal)

    legacy = sorted({c["name"] for c in cal["cities"] for g in ("temp", "hum", "rain")
                     if c["prov"][g]["method"] == "legacy-estimate"})
    covered_raw = {c["name"] for c in d["cities"] if city_slug(c["name"]) in clim}
    print(summary(d, raw, cal, covered_raw))
    if legacy:
        print(f"\n{len(legacy)} cities still on legacy climate values (no station, ERA5 pending): {', '.join(legacy)}")

    if "--report" in args:
        report(d, clim, air, stn, ccal, acal, raw, cal, os.path.join(ROOT, args[args.index("--report") + 1]))

    if mode == "--write":
        if legacy and "--allow-legacy" not in args:
            raise SystemExit("refusing to write while cities are on legacy climate values — rerun "
                             "fetch_climate.py + calibrate_climate.py, or pass --allow-legacy")
        json.dump(cal, open(DATA, "w"), indent=2, ensure_ascii=False)
        print(f"\nwrote {os.path.relpath(DATA, ROOT)} — rebaking scores + sanity check")
        here = os.path.dirname(os.path.abspath(__file__))
        subprocess.run([sys.executable, os.path.join(here, "rebake_scores.py"), "--write"], check=True)
        subprocess.run([sys.executable, os.path.join(here, "sanity_check.py")], check=True)
    else:
        print("\ncheck only — travel-data.json not modified")


if __name__ == "__main__":
    main()
