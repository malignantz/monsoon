#!/usr/bin/env python3
"""Rebake monthly component scores from raw inputs (METHODOLOGY §§1–4, 6–7).

Recomputes, for every city-month, from the stored raw inputs (high/low/hum/
rain/risk/pm25/season/evtTier) and the parameters in settings:

    weather, air, seasonScore, eventScore, qolBase, qol, value(classic)

Safety scores are NOT touched (run scripts/safety_v3.py for those); qol reuses
each city's stored safety.score and safety.qolFloor.

Usage:
    python3 scripts/rebake_scores.py --check   # parity report only, no write
    python3 scripts/rebake_scores.py --write   # rebake travel-data.json in place
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")


def temp_sub(t, lo, hi, cold_pen, heat_pen):
    if t < lo:
        pen = (lo - t) * cold_pen
    elif t > hi:
        pen = (t - hi) * heat_pen
    else:
        pen = 0
    return max(0.0, min(100.0, 100.0 - pen))


def weather_score(m, s):
    high_sub = temp_sub(m["high"], s["ideal_low_temp"], s["ideal_high_temp"],
                        s["cold_penalty_per_F"], s["heat_penalty_per_F"])
    low_sub = temp_sub(m["low"], s["low_ideal_temp"], s["low_high_temp"],
                       s["cold_penalty_per_F"], s["heat_penalty_per_F"])
    temp = s["w_temp_high"] * high_sub + s["w_temp_low"] * low_sub

    hum = m["hum"]
    if hum < s["ideal_low_hum"]:
        hum_pen = (s["ideal_low_hum"] - hum) * s["dry_penalty_per_pct"]
    elif hum > s["ideal_high_hum"]:
        hum_pen = (hum - s["ideal_high_hum"]) * s["humid_penalty_per_pct"]
    else:
        hum_pen = 0
    humidity = max(0.0, min(100.0, 100.0 - hum_pen))

    rain = rain_score(m["rain"], s)

    base = s["w_temp"] * temp + s["w_humidity"] * humidity + s["w_rain"] * rain
    mult = {0: 1.0, 1: s["extreme_elevated_mult"], 2: s["extreme_severe_mult"]}[m.get("risk", 0)]
    return max(0.0, min(100.0, base * mult))


def rain_score(days, s):
    # Tiered penalty (see METHODOLOGY §1): light rain months are barely
    # penalized, sustained-wet months are. Falls back to the legacy linear
    # rate when the tier settings are absent.
    if "rain_tier1_days" in s:
        t1, t2 = s["rain_tier1_days"], s["rain_tier2_days"]
        p1, p2, p3 = s["rain_tier1_pen"], s["rain_tier2_pen"], s["rain_tier3_pen"]
        pen = min(days, t1) * p1
        if days > t1:
            pen += (min(days, t2) - t1) * p2
        if days > t2:
            pen += (days - t2) * p3
    else:
        pen = days * s["rain_penalty_per_day"]
    return max(0.0, min(100.0, 100.0 - pen))


def air_score(pm, s):
    clean, moderate = s["air_clean_pm"], s["air_moderate_pm"]
    pen_base, pen_extra = s["air_pen_per_ug"], s["air_extra_pen_per_ug"]
    if pm <= clean:
        return 100.0
    score = 100.0 - (min(pm, moderate) - clean) * pen_base
    if pm > moderate:
        score -= (pm - moderate) * (pen_base + pen_extra)
    return max(0.0, min(100.0, score))


def season_score(season, s):
    return s[f"season_{season}"]


def event_score(tier, s):
    return max(0.0, min(100.0, s["event_base"] + tier * s["event_per_tier"]))


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--check"
    if mode not in ("--check", "--write"):
        raise SystemExit(__doc__)

    d = json.load(open(DATA))
    s = d["settings"]
    qw = (s["q_weather"], s["q_safety"], s["q_air"], s["q_season"], s["q_event"])

    diffs = {"weather": [], "air": [], "seasonScore": [], "eventScore": [], "qol": [], "value": []}
    for c in d["cities"]:
        safety = c["safety"]["score"]
        floor = c["safety"]["qolFloor"]
        for m in c["months"]:
            new = {
                "weather": round(weather_score(m, s), 1),
                "air": round(air_score(m["pm25"], s), 1),
                "seasonScore": round(season_score(m["season"], s)),
                "eventScore": round(event_score(m["evtTier"], s), 1),
            }
            qb = (qw[0] * new["weather"] + qw[1] * safety + qw[2] * new["air"]
                  + qw[3] * new["seasonScore"] + qw[4] * new["eventScore"])
            new["qolBase"] = round(qb, 1)
            new["qol"] = round(floor * qb, 1)
            new["value"] = round(new["qol"] / (m["cost2"] / 1000), 2)

            for k, v in new.items():
                if k in diffs and abs(m[k] - v) > 0.051:
                    diffs[k].append((c["name"], m["mo"], m[k], v))
            if mode == "--write":
                m.update(new)

    for k, rows in diffs.items():
        print(f"{k:12} {len(rows):4} months changed"
              + (f"   e.g. {rows[0][0]} {rows[0][1]}: {rows[0][2]} -> {rows[0][3]}" if rows else ""))

    if mode == "--write":
        json.dump(d, open(DATA, "w"), indent=2, ensure_ascii=False)
        print(f"\nwrote {os.path.relpath(DATA, ROOT)}")
    else:
        total = sum(len(v) for v in diffs.values())
        print(f"\ncheck only — {total} total deltas vs stored data (0 = formulas in parity)")


if __name__ == "__main__":
    main()
