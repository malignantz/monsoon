#!/usr/bin/env python3
"""Safety v3 — full-catalog recompute.

Reads:
  data/travel-data.json          (cities + settings; advisory fields reused)
  data/safety-inputs-v3.json     (hand-set per-city inputs)
  data/worldbank-homicide.json   (country homicide baseline, cached)
  data/wps-community-safety.json (country women's feel-safe baseline, cached;
                                  Gallup World Poll via Georgetown WPS Index)

Writes the v3 three-part safety object for every LEGACY city and refreshes each
month's qolBase/qol/value with the same formulas as scripts/rebake_scores.py.

Cities added through scripts/add_city.py ("managed": they have a
data/cities/<slug>.json) are skipped here: add_city.py bakes their safety with
compute_safety() below from the per-city file, so this script can never clobber
them. Rerunning this script on unchanged inputs is byte-identical.

History (fixed 2026-10): the old version recomputed every month's `value` with
the classic QoL/(cost2/1000) formula, ignoring settings.value_cost_exponent, so a
rerun silently broke Best Value until rebake_scores.py ran; it also dropped any
safety.narrative and stamped asOf "2026-06" unconditionally.

    ViolentSub  = curve(homicide rate /100k; city override else country baseline)
    PropertySub = hand-set perception (inputs)            [NO Numbeo]
    Safety      = round(clamp((0.55*ViolentSub + 0.45*PropertySub) * touristMod, 0, 100))
    womensSafety = clamp(womens_curve(country CS%) + womensAdj, 0, 100)
                   displayed only (NOT in the score); CS% = Gallup women-only
                   "feel safe walking alone at night" via the WPS Index cache;
                   womensAdj is a hand-set city delta (harassment evidence,
                   within-country variation, fear-vs-victimization correction)
Advisory does not cap; localLevel >= 3 yields a badge.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")
INPUTS = os.path.join(ROOT, "data", "safety-inputs-v3.json")
WB = os.path.join(ROOT, "data", "worldbank-homicide.json")
WPS = os.path.join(ROOT, "data", "wps-community-safety.json")

W_VIOLENT, W_PROPERTY = 0.55, 0.45
MOD_MIN, MOD_MAX = 0.60, 1.40
CURVE = [(1, 100), (5, 80), (10, 65), (30, 35), (60, 10)]
WOMENS_CURVE = [(20, 35), (40, 52), (60, 63), (75, 74), (90, 88)]
WPS_URL = "https://giwps.georgetown.edu/the-index/"

# our country label -> WPS Index country name, where they differ
WPS_NAME = {
    'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
    'Czech Republic': 'Czechia',
    'Sicily': 'Italy',
    'Turkey': 'Türkiye',
    'Vietnam': 'Viet Nam',
}

COUNTRY_ISO = {
 'Albania':'ALB','Argentina':'ARG','Armenia':'ARM','Austria':'AUT','Bosnia & Herzegovina':'BIH',
 'Brazil':'BRA','Bulgaria':'BGR','Cambodia':'KHM','Chile':'CHL','Colombia':'COL','Costa Rica':'CRI',
 'Croatia':'HRV','Cyprus':'CYP','Czech Republic':'CZE','Denmark':'DNK','Ecuador':'ECU','Estonia':'EST',
 'France':'FRA','Georgia':'GEO','Germany':'DEU','Greece':'GRC','Guatemala':'GTM','Hungary':'HUN',
 'Indonesia':'IDN','Ireland':'IRL','Italy':'ITA','Latvia':'LVA','Lithuania':'LTU','Malaysia':'MYS',
 'Malta':'MLT','Mexico':'MEX','Montenegro':'MNE','Morocco':'MAR','Netherlands':'NLD','Panama':'PAN',
 'Peru':'PER','Poland':'POL','Portugal':'PRT','Romania':'ROU','Serbia':'SRB','Sicily':'ITA',
 'Slovakia':'SVK','Slovenia':'SVN','South Africa':'ZAF','Spain':'ESP','Sweden':'SWE','Switzerland':'CHE',
 'Taiwan':'TWN','Thailand':'THA','Turkey':'TUR','United Kingdom':'GBR','Uruguay':'URY','Vietnam':'VNM',
}


def violent_sub(rate):
    if rate <= CURVE[0][0]:
        return 100.0
    for (r0, s0), (r1, s1) in zip(CURVE, CURVE[1:]):
        if rate <= r1:
            return s0 + (rate - r0) / (r1 - r0) * (s1 - s0)
    r_last, s_last = CURVE[-1]
    return max(s_last - (rate - r_last) * 0.1, 2.0)


def womens_baseline(cs):
    if cs <= WOMENS_CURVE[0][0]:
        return float(WOMENS_CURVE[0][1])
    for (x0, y0), (x1, y1) in zip(WOMENS_CURVE, WOMENS_CURVE[1:]):
        if cs <= x1:
            return y0 + (cs - x0) / (x1 - x0) * (y1 - y0)
    return float(WOMENS_CURVE[-1][1])


def label_for(score):
    if score >= 70: return "Very safe"
    if score >= 58: return "Safe"
    if score >= 45: return "Moderate"
    return "Use caution"


def qol_floor(score, th, lo):
    return 1.0 if score >= th else round(lo + (1 - lo) * (score / th), 4)


def homicide_for(country, m, wb, iso3=None):
    """(rate, scope, source, url) — override from inputs, else World Bank country baseline."""
    if "homicideOverride" in m:
        return (m["homicideOverride"], m.get("homicideScope", "city"),
                m.get("homicideSource", ""), m.get("homicideUrl"))
    iso = COUNTRY_ISO.get(country) or iso3
    rec = wb.get(iso, {})
    rate = rec.get("rate")
    if rate is None:
        raise SystemExit(f"no homicide baseline for {country}/{iso} — add it to data/worldbank-homicide.json "
                         "(World Bank VC.IHR.PSRC.P5) or cite a homicideOverride")
    return (rate, "country",
            rec.get("source") or f"World Bank / UNODC intentional homicide {rec.get('year')} ({country})",
            "https://data.worldbank.org/indicator/VC.IHR.PSRC.P5")


def compute_safety(name, country, m, adv, settings, wb, wps, prev=None, iso3=None, as_of="2026-06"):
    """The v3 safety object for one city.

    m   = hand-set inputs in the safety-inputs-v3.json shape (propertySub, womensAdj, touristMod, ...)
    adv = advisory fields: advisory, advisoryLevel, regionalLevel, risks, source, url, date
    prev = the city's current safety object (narrative / asOf are preserved), or None.
    """
    th, lo = settings["safety_floor_threshold"], settings["safety_floor_min"]
    rate, scope, hsource, hurl = homicide_for(country, m, wb, iso3)

    wps_rec = wps.get(WPS_NAME.get(country, country), {})
    cs = wps_rec.get("communitySafety")
    if cs is None:
        raise SystemExit(f"no WPS community-safety baseline for {name} ({country})")
    wbase = round(womens_baseline(cs), 1)
    wadj = m.get("womensAdj", 0)
    wsub = int(round(max(0, min(100, wbase + wadj))))

    vsub = round(violent_sub(rate), 1)
    prop = m["propertySub"]
    base = W_VIOLENT * vsub + W_PROPERTY * prop
    mod = max(MOD_MIN, min(MOD_MAX, m.get("touristMod", 1.0)))
    score = int(round(max(0, min(100, base * mod))))
    floor = qol_floor(score, th, lo)
    local_level = m.get("localLevel", adv.get("regionalLevel", adv.get("advisoryLevel", 1)))
    local_area = m.get("localArea")

    new = {
        "score": score, "base": round(base, 1), "label": label_for(score),
        "method": "v3", "asOf": (prev or {}).get("asOf", as_of), "qolFloor": floor,
        "violent": {"sub": vsub, "homicideRate": rate, "scope": scope, "source": hsource, "url": hurl},
        "property": {"sub": prop, "source": m.get("propertyNote", ""), "url": None},
        "womensSafety": {"sub": wsub, "baseline": wbase, "cs": cs, "adj": wadj, "scope": "country",
                         "source": m.get("womensSafetyNote", ""),
                         "dataSource": "Gallup World Poll women's feel-safe %, via Georgetown WPS Index 2025/26",
                         "url": WPS_URL},
        "tourist": {"modifier": mod, "rationale": m.get("touristRationale", ""),
                    "tags": m.get("touristTags", []), "source": "OSAC Crime & Safety Reports / U.S. State Dept guidance"},
        "advisory": adv.get("advisory"), "advisoryLevel": adv.get("advisoryLevel"),
        "regionalLevel": adv.get("regionalLevel"),
        "advisoryLocal": {"level": local_level, "area": local_area},
        "badge": ({"level": local_level,
                   "text": f"Level {local_level} — {'Do not travel' if local_level >= 4 else 'Reconsider travel'}",
                   "area": local_area} if local_level >= 3 else None),
        "risks": adv.get("risks", []), "source": adv.get("source"), "url": adv.get("url"), "date": adv.get("date"),
        "note": (f"v3: violent {vsub} (homicide {rate}/100k, {scope}) + property {prop} "
                 f"-> base {round(base,1)}, tourist x{mod} -> {score}."
                 + (f" {m['touristRationale']}" if m.get("touristRationale") else "")),
    }
    if prev and prev.get("narrative"):
        new["narrative"] = prev["narrative"]
    return new


def refresh_month_scores(c, settings):
    """qolBase/qol/value for every month from stored components (same formulas as rebake_scores.py)."""
    s = settings
    qw = (s["q_weather"], s["q_safety"], s["q_air"], s["q_season"], s["q_event"])
    score, floor = c["safety"]["score"], c["safety"]["qolFloor"]
    for mo in c["months"]:
        qb = (qw[0] * mo["weather"] + qw[1] * score + qw[2] * mo["air"]
              + qw[3] * mo["seasonScore"] + qw[4] * mo["eventScore"])
        mo["qolBase"] = round(qb, 1)
        mo["qol"] = round(floor * qb, 1)
        mo["value"] = round(mo["qol"] / (mo["cost2"] / 1000) ** s["value_cost_exponent"], 2)


def main():
    d = json.load(open(DATA))
    inputs = json.load(open(INPUTS))
    wb = json.load(open(WB))
    wps = json.load(open(WPS))["countries"]
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from city_inputs import managed_names
    managed = managed_names()

    s = d["settings"]
    s["safety_v3"] = {
        "w_violent": W_VIOLENT, "w_property": W_PROPERTY,
        "tourist_mod_min": MOD_MIN, "tourist_mod_max": MOD_MAX, "homicide_curve": CURVE,
        "womens_cs_curve": WOMENS_CURVE,
        "method": ("Safety = round(clamp((w_violent*ViolentSub + w_property*PropertySub) * touristMod, 0, 100)). "
                   "ViolentSub from intentional-homicide rate /100k (city override else World Bank country baseline) "
                   "via a piecewise curve. PropertySub hand-set petty/property perception (no Numbeo). touristMod "
                   "(0.60-1.40) encodes visitor-vs-local risk. womensSafety is a displayed-only sub-signal, not in the "
                   "score: womens_cs_curve over the country %% of women who feel safe walking alone at night (Gallup "
                   "World Poll via the Georgetown WPS Index cache) plus a hand-set per-city womensAdj delta. "
                   "State Dept advisory does not cap; localLevel>=3 yields a badge."),
        "status": "full-catalog",
    }
    s["safety_source"] = ("Custom Safety v3 index: World Bank/UNODC intentional-homicide rates (city overrides where "
                          "available) + hand-researched property-crime perception + a visitor-risk modifier from OSAC / "
                          "U.S. State Dept guidance. Numbeo no longer used. Reviewed 2026-06.")
    s["safety_score_method"] = ("0-100, higher is safer. 0.55*Violent(homicide curve) + 0.45*Property(hand-set perception), "
                                "times a 0.60-1.40 visitor-risk modifier. Advisory Level 3/4 shown as a badge, not a cap. "
                                "Women's-safety shown as a separate signal.")

    rows, skipped = [], []
    for c in d["cities"]:
        name = c["name"]
        if name in managed:
            skipped.append(name)
            continue
        sf = c["safety"]
        old = sf.get("score")
        c["safety"] = compute_safety(name, c["country"], inputs[name], sf, s, wb, wps, prev=sf)
        refresh_month_scores(c, s)
        n = c["safety"]
        rows.append((name, c["country"], old, n["score"], n["violent"]["sub"], n["property"]["sub"],
                     n["tourist"]["modifier"], n["violent"]["scope"]))

    json.dump(d, open(DATA, "w"), indent=2, ensure_ascii=False)
    rows.sort(key=lambda r: -r[3])
    print(f"\n{'City':28}{'Country':22}{'old':>4}{'new':>5}{'V':>6}{'P':>4}{'mod':>6}  scope")
    for name, ctry, old, new, v, p, mod, scope in rows:
        print(f"{name:28}{ctry:22}{str(old):>4}{new:>5}{v:>6}{p:>4}{mod:>6}  {scope}")
    print(f"\nwrote {os.path.relpath(DATA, ROOT)} — {len(rows)} cities"
          + (f"; skipped {len(skipped)} managed by add_city.py" if skipped else ""))


if __name__ == "__main__":
    main()
