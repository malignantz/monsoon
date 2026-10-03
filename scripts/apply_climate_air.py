#!/usr/bin/env python3
"""Map fetched climate normals + PM2.5 climatology into data/travel-data.json.

Inputs (built by scripts/fetch_climate.py and scripts/fetch_air.py):
    data/climate-normals.json   ERA5 via Open-Meteo  -> high, low (°F), hum (%), rain (days >= 1 mm)
    data/air-climatology.json   CAMS via Open-Meteo  -> pm25 (µg/m³), airCat, airColor

Provenance written on --write:
    top-level  sources = {key: {name, url, licence, window, retrieved, method}}
    per city   prov    = {"climate": "<sources key>", "pm25": "<sources key>"}

Untouched: risk/riskNote (hazards), season, evtTier/events, costs, safety.

Usage:
    python3 scripts/apply_climate_air.py                 # == --check: diff summary, no write
    python3 scripts/apply_climate_air.py --check --report tmp/climate-air-diff.md
    python3 scripts/apply_climate_air.py --write         # write, then rebake + sanity check
"""
import copy, json, math, os, subprocess, sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from openmeteo_common import ROOT, DATA, city_slug
from rebake_scores import weather_score, air_score

CLIMATE = os.path.join(ROOT, "data", "climate-normals.json")
AIR = os.path.join(ROOT, "data", "air-climatology.json")
FIELDS = ["high", "low", "hum", "rain", "pm25"]
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

SOURCE_KEYS = {"climate": "era5-om", "pm25": "cams-om"}


def air_band(pm):
    for hi, cat, color in AIR_BANDS:
        if pm <= hi:
            return cat, color


def source_entry(meta):
    return {"name": meta["source"], "url": meta["url"], "licence": meta["licence"],
        "window": meta["window"], "retrieved": meta["retrieved"], "method": meta["method"]}


def load():
    d = json.load(open(DATA))
    clim = json.load(open(CLIMATE))
    air = json.load(open(AIR))
    return d, clim, air


def apply(d, clim, air):
    """Return (new_doc, missing, covered) — a deep copy with fetched inputs mapped in.

    Each source is applied independently, so a city missing from one file keeps
    its old values (and gets no prov entry) for that source only. covered maps
    "climate"/"pm25" -> set of city names actually replaced.
    """
    nd = copy.deepcopy(d)
    missing, covered = [], {"climate": set(), "pm25": set()}
    for c in nd["cities"]:
        slug = city_slug(c["name"])
        cr, ar = clim.get(slug), air.get(slug)
        if not cr or not ar:
            missing.append((slug, bool(cr), bool(ar)))
        prov = {}
        for i, m in enumerate(c["months"]):
            assert m["moNum"] == i + 1
            if cr:
                cm = cr["months"][i]
                assert cm["mo"] == i + 1
                m["high"] = round(cm["tmaxF"])
                m["low"] = round(cm["tminF"])
                m["hum"] = round(cm["rhPct"])
                m["rain"] = round(cm["wetDays"])
            if ar:
                am = ar["months"][i]
                assert am["mo"] == i + 1
                m["pm25"] = round(am["pm25"])
                m["airCat"], m["airColor"] = air_band(m["pm25"])
        if cr:
            prov["climate"] = SOURCE_KEYS["climate"]
            covered["climate"].add(c["name"])
        if ar:
            prov["pm25"] = SOURCE_KEYS["pm25"]
            covered["pm25"].add(c["name"])
        if prov:
            c["prov"] = prov
    nd["sources"] = {SOURCE_KEYS["climate"]: source_entry(clim["_meta"]),
                     SOURCE_KEYS["pm25"]: source_entry(air["_meta"])}
    return nd, missing, covered


# ---------- scoring (same formulas as rebake_scores.py, in memory) ----------

def score_doc(doc):
    """{(city, monthIdx): qol} using rebake_scores formulas on the doc's raw inputs."""
    s = doc["settings"]
    qw = (s["q_weather"], s["q_safety"], s["q_air"], s["q_season"], s["q_event"])
    out = {}
    for c in doc["cities"]:
        saf, floor = c["safety"]["score"], c["safety"]["qolFloor"]
        for i, m in enumerate(c["months"]):
            w = round(weather_score(m, s), 1)
            a = round(air_score(m["pm25"], s), 1)
            qb = qw[0] * w + qw[1] * saf + qw[2] * a + qw[3] * m["seasonScore"] + qw[4] * m["eventScore"]
            out[(c["name"], i)] = {"weather": w, "air": a, "qol": round(floor * qb, 1)}
    return out


# ---------- diff ----------

def field_stats(d, nd, covered):
    """field -> [(city, mi, old, new)], only for cities whose source was applied."""
    rows = defaultdict(list)
    for c, nc in zip(d["cities"], nd["cities"]):
        for i, (m, nm) in enumerate(zip(c["months"], nc["months"])):
            for f in FIELDS:
                if c["name"] in covered["pm25" if f == "pm25" else "climate"]:
                    rows[f].append((c["name"], i, m[f], nm[f]))
    return rows


def summary_lines(d, nd, covered):
    rows = field_stats(d, nd, covered)
    out = [f"{'field':6} {'cities':>6} {'mean old':>9} {'mean new':>9} {'bias':>7} {'MAE':>6} {'max|Δ|':>7} {'changed':>8}"]
    for f in FIELDS:
        r = rows[f]
        diffs = [n - o for _, _, o, n in r]
        out.append(f"{f:6} {len(r)//12:6} {sum(o for *_, o, _ in r)/len(r):9.1f} {sum(n for *_, n in r)/len(r):9.1f} "
                   f"{sum(diffs)/len(diffs):+7.2f} {sum(map(abs, diffs))/len(diffs):6.2f} "
                   f"{max(map(abs, diffs)):7} {sum(1 for x in diffs if x)/len(diffs):7.0%}")
    cats = Counter((m["airCat"], nm["airCat"]) for c, nc in zip(d["cities"], nd["cities"])
                   for m, nm in zip(c["months"], nc["months"]))
    out.append(f"airCat changed in {sum(v for (a, b), v in cats.items() if a != b)} of "
               f"{sum(cats.values())} city-months")
    return out, rows


# ---------- markdown report ----------

def md_table(header, rows):
    s = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    s += ["| " + " | ".join(str(x) for x in r) + " |" for r in rows]
    return "\n".join(s)


def report(d, nd, clim, air, path, covered, missing):
    L = []
    summ, rows = summary_lines(d, nd, covered)
    L.append("# Climate + PM2.5 replacement — diff report (check mode, nothing written)\n")
    L.append(f"Generated by `python3 scripts/apply_climate_air.py --check --report {os.path.relpath(path, ROOT)}`.\n")
    L.append(f"- Climate: {clim['_meta']['source']} — window **{clim['_meta']['window']}**, retrieved {clim['_meta']['retrieved']}.")
    L.append(f"- PM2.5: {air['_meta']['source']} — window **{air['_meta']['window']}**, retrieved {air['_meta']['retrieved']}.")
    L.append("- New values are rounded to integers like the existing schema (`rain` = mean days with ≥ 1 mm).")
    L.append("- `bias` = mean(new − old). Positive = new data is warmer / more humid / wetter / dirtier.")
    nclim = [m for m in missing if not m[1]]
    nair = [m for m in missing if not m[2]]
    if missing:
        L.append(f"- **Coverage gap:** climate missing for {len(nclim)} cities"
                 f"{' (' + ', '.join(m[0] for m in nclim) + ')' if nclim else ''}; PM2.5 missing for {len(nair)}. "
                 "Those cities keep their old values for the missing source in every section below (incl. the "
                 "ranking simulation); stats only cover replaced cities. Rerun the fetcher, then this report.")
    L.append("")

    L.append("## 1. Field summary (replaced cities × 12 months)\n")
    L.append("```\n" + "\n".join(summ) + "\n```\n")

    # per-field worst 15 cities (by mean |Δ| across the 12 months)
    L.append("## 2. Worst 15 cities per field (mean |Δ| over 12 months)\n")
    for f in FIELDS:
        by_city = defaultdict(list)
        for name, i, o, n in rows[f]:
            by_city[name].append((i, o, n))
        ranked = sorted(by_city.items(), key=lambda kv: -sum(abs(n - o) for _, o, n in kv[1]))[:15]
        tab = []
        for name, ms in ranked:
            mae = sum(abs(n - o) for _, o, n in ms) / 12
            bias = sum(n - o for _, o, n in ms) / 12
            wi, wo, wn = max(ms, key=lambda t: abs(t[2] - t[1]))
            slug = city_slug(name)
            g = clim.get(slug, {}).get("grid")
            tab.append([name, f"{mae:.1f}", f"{bias:+.1f}", f"{MONTHS[wi]} {wo}→{wn}",
                        f"{g['elevation']:.0f} / {g['modelCellElevation']:.0f}" if g else "n/a"])
        L.append(f"### {f}\n")
        L.append(md_table(["city", "MAE", "bias", "worst month (old→new)", "DEM / model-cell elev (m)"], tab) + "\n")

    # elevation mismatches
    L.append("## 3. Elevation / grid-cell suspicion list\n")
    L.append("Open-Meteo already lapse-rate-downscales temperature from the model cell height to a 90 m DEM height "
             "at the city point, so the residual risk is **not** the raw height gap itself but what a simple "
             "lapse rate cannot fix: coastal cells mixing sea and mountain (Kotor, Funchal…), valley inversions "
             "and rain/cloud regimes of the surrounding terrain. Listed: |model cell − DEM| ≥ 250 m, with the "
             "city's old-vs-new annual temperature and rain-day deltas.\n")
    tab = []
    for c, nc in zip(d["cities"], nd["cities"]):
        if c["name"] not in covered["climate"]:
            continue
        g = clim[city_slug(c["name"])]["grid"]
        gap = g["modelCellElevation"] - g["elevation"]
        if abs(gap) >= 250:
            dh = sum(nm["high"] - m["high"] for m, nm in zip(c["months"], nc["months"])) / 12
            dl = sum(nm["low"] - m["low"] for m, nm in zip(c["months"], nc["months"])) / 12
            dr = sum(nm["rain"] - m["rain"] for m, nm in zip(c["months"], nc["months"])) / 12
            tab.append((abs(gap), [c["name"], f"{g['elevation']:.0f}", f"{g['modelCellElevation']:.0f}",
                                   f"{gap:+.0f}", f"{dh:+.1f}", f"{dl:+.1f}", f"{dr:+.1f}"]))
    tab.sort(key=lambda t: -t[0])
    L.append(md_table(["city", "DEM elev", "model cell", "gap (m)", "Δhigh °F", "Δlow °F", "Δrain d"],
                      [t[1] for t in tab]) + "\n")

    # large temperature disagreements regardless of elevation
    L.append("### Large climate disagreements (any city-month |Δhigh| or |Δlow| ≥ 8 °F, or |Δrain| ≥ 8 days)\n")
    flagged = []
    for c, nc in zip(d["cities"], nd["cities"]):
        bad = [(MONTHS[i], m, nm) for i, (m, nm) in enumerate(zip(c["months"], nc["months"]))
               if abs(nm["high"] - m["high"]) >= 8 or abs(nm["low"] - m["low"]) >= 8 or abs(nm["rain"] - m["rain"]) >= 8]
        if bad:
            flagged.append([c["name"], len(bad), "; ".join(
                f"{mo} H {m['high']}→{nm['high']} L {m['low']}→{nm['low']} R {m['rain']}→{nm['rain']}"
                for mo, m, nm in bad[:3]) + (" …" if len(bad) > 3 else "")])
    flagged.sort(key=lambda r: -r[1])
    L.append(md_table(["city", "months", "examples"], flagged) + "\n" if flagged else "_none_\n")

    # PM2.5
    L.append("## 4. PM2.5 suspicion list\n")
    L.append("CAMS global (~45 km) is a regional background model. Cases where it is far **below** the old value "
             "for months the old data rated polluted (old ≥ 25 µg/m³ and new ≤ 0.6 × old):\n")
    tab = []
    for c, nc in zip(d["cities"], nd["cities"]):
        hits = [(MONTHS[i], m["pm25"], nm["pm25"]) for i, (m, nm) in enumerate(zip(c["months"], nc["months"]))
                if m["pm25"] >= 25 and nm["pm25"] <= 0.6 * m["pm25"]]
        if hits:
            tab.append([c["name"], len(hits), ", ".join(f"{mo} {o}→{n}" for mo, o, n in hits)])
    tab.sort(key=lambda r: -r[1])
    L.append(md_table(["city", "months", "old→new"], tab) + "\n" if tab else "_none_\n")

    L.append("Cases where CAMS is far **above** the old value (new ≥ 25 and ≥ 1.6 × old) — typically desert dust "
             "or regional smoke that CAMS may overstate, or an old value that was too optimistic:\n")
    tab = []
    for c, nc in zip(d["cities"], nd["cities"]):
        hits = [(MONTHS[i], m["pm25"], nm["pm25"]) for i, (m, nm) in enumerate(zip(c["months"], nc["months"]))
                if nm["pm25"] >= 25 and nm["pm25"] >= 1.6 * m["pm25"]]
        if hits:
            tab.append([c["name"], len(hits), ", ".join(f"{mo} {o}→{n}" for mo, o, n in hits)])
    tab.sort(key=lambda r: -r[1])
    L.append(md_table(["city", "months", "old→new"], tab) + "\n" if tab else "_none_\n")

    watch = ["Chiang Mai", "Hanoi", "Bangkok", "Kathmandu", "Skopje", "Sarajevo", "Belgrade", "Tbilisi",
             "Sofia", "Krakow", "Kraków", "Ho Chi Minh City", "Siem Reap", "Pokhara", "Mexico City", "Lima",
             "Cairo", "Marrakech", "Istanbul", "Kuala Lumpur", "Delhi", "Goa", "Colombo", "Jaipur"]
    present = [c for c in d["cities"] if c["name"] in watch]
    L.append("### Watch list — monthly PM2.5 old → new (µg/m³), CAMS year-to-year range in brackets\n")
    tab = []
    nd_by = {c["name"]: c for c in nd["cities"]}
    for c in present:
        am = air[city_slug(c["name"])]["months"]
        tab.append([c["name"]] + [f"{m['pm25']}→{nm['pm25']} [{a['yearMin']:.0f}-{a['yearMax']:.0f}]"
                                  for m, nm, a in zip(c["months"], nd_by[c["name"]]["months"], am)])
    L.append(md_table(["city"] + MONTHS, tab) + "\n")

    cats = Counter((m["airCat"], nm["airCat"]) for c, nc in zip(d["cities"], nd["cities"])
                   for m, nm in zip(c["months"], nc["months"]))
    order = [b[1] for b in AIR_BANDS]
    L.append("### airCat transition matrix (rows old, columns new; city-months)\n")
    L.append(md_table(["old \\ new"] + order,
                      [[a] + [cats.get((a, b), "") for b in order] for a in order]) + "\n")

    # rankings
    L.append("## 5. Simulated top-20 (Balanced Score = stored qol formula) — before vs after\n")
    L.append("Scores recomputed in memory with `rebake_scores.py` formulas; safety, season, events and hazard "
             "multipliers unchanged. `Δrank` = old rank − new rank (positive = moves up).\n")
    old_s, new_s = score_doc(d), score_doc(nd)
    full = covered["climate"] & covered["pm25"]
    pool_old = [c for c in d["cities"] if c["name"] in full]
    pool_new = [c for c in nd["cities"] if c["name"] in full]
    if len(full) < len(d["cities"]):
        L.append(f"**Ranked pool restricted to the {len(full)} cities with both sources replaced** — mixing "
                 "half-replaced cities would bias the comparison (old climate inputs are systematically "
                 "drier/sunnier than ERA5). Ranks are within that pool.\n")
    for mi in (0, 6, 9):
        old_rank = sorted(pool_old, key=lambda c: -old_s[(c["name"], mi)]["qol"])
        new_rank = sorted(pool_new, key=lambda c: -new_s[(c["name"], mi)]["qol"])
        orank = {c["name"]: r for r, c in enumerate(old_rank, 1)}
        nrank = {c["name"]: r for r, c in enumerate(new_rank, 1)}
        tab = []
        for r in range(min(20, len(old_rank))):
            o, n = old_rank[r]["name"], new_rank[r]["name"]
            tab.append([r + 1, f"{o} ({old_s[(o, mi)]['qol']})",
                        f"{n} ({new_s[(n, mi)]['qol']})", f"{orank[n] - r - 1:+d}" if orank[n] != r + 1 else "="])
        dropped = [c["name"] for c in old_rank[:20] if nrank[c["name"]] > 20]
        entered = [c["name"] for c in new_rank[:20] if orank[c["name"]] > 20]
        moves = [abs(orank[k] - nrank[k]) for k in orank]
        L.append(f"### {MONTHS[mi]}\n")
        L.append(md_table(["#", "before (qol)", "after (qol)", "Δrank of after-city"], tab) + "\n")
        L.append(f"- Dropped out of top 20: {', '.join(f'{x} (→#{nrank[x]})' for x in dropped) or 'none'}")
        L.append(f"- Entered top 20: {', '.join(f'{x} (from #{orank[x]})' for x in entered) or 'none'}")
        L.append(f"- Mean |rank change| across all {len(moves)}: {sum(moves)/len(moves):.1f}; max {max(moves)}\n")

    # parity check on the old data
    drift = sum(1 for c in d["cities"] for i, m in enumerate(c["months"])
                if abs(old_s[(c["name"], i)]["qol"] - m["qol"]) > 0.11)
    L.append(f"_Parity: recomputed old qol differs from stored qol in {drift} city-months (should be 0)._\n")

    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write("\n".join(L))
    print(f"wrote {os.path.relpath(path, ROOT)}")


def main():
    args = sys.argv[1:]
    mode = "--write" if "--write" in args else "--check"
    d, clim, air = load()
    nd, missing, covered = apply(d, clim, air)
    if missing:
        print("MISSING inputs (city, climate?, air?):", missing)
        if mode == "--write":
            raise SystemExit("refusing to write with missing cities — rerun the fetchers")
    summ, _ = summary_lines(d, nd, covered)
    print("\n".join(summ))

    if "--report" in args:
        report(d, nd, clim, air, os.path.join(ROOT, args[args.index("--report") + 1]), covered, missing)

    if mode == "--write":
        json.dump(nd, open(DATA, "w"), indent=2, ensure_ascii=False)
        print(f"\nwrote {os.path.relpath(DATA, ROOT)} — rebaking scores + sanity check")
        here = os.path.dirname(os.path.abspath(__file__))
        subprocess.run([sys.executable, os.path.join(here, "rebake_scores.py"), "--write"], check=True)
        subprocess.run([sys.executable, os.path.join(here, "sanity_check.py")], check=True)
    else:
        print("\ncheck only — travel-data.json not modified (use --write to apply, then it rebakes)")


if __name__ == "__main__":
    main()
