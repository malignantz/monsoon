#!/usr/bin/env python3
"""Assert the baked data still reproduces the METHODOLOGY formulas.

Checks every city-month identity (component scores -> qolBase -> qol -> value)
against a fresh recompute from raw inputs, plus a few hand-traced anchors.
Run after any settings retune + rebake; exits non-zero on drift.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rebake_scores import weather_score, air_score, season_score, event_score

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")
TOL = 0.06  # one rounding step of slack


def main():
    d = json.load(open(DATA))
    s = d["settings"]
    qw = (s["q_weather"], s["q_safety"], s["q_air"], s["q_season"], s["q_event"])
    assert abs(sum(qw) - 1.0) < 1e-9, f"QoL weights must sum to 1.0, got {sum(qw)}"

    errors = 0
    for c in d["cities"]:
        safety, floor = c["safety"]["score"], c["safety"]["qolFloor"]
        # floor identity
        th, lo = s["safety_floor_threshold"], s["safety_floor_min"]
        want_floor = 1.0 if safety >= th else round(lo + (1 - lo) * safety / th, 4)
        if abs(floor - want_floor) > 1e-4:
            print(f"FLOOR  {c['name']}: stored {floor} != {want_floor}"); errors += 1
        for m in c["months"]:
            checks = {
                "weather": weather_score(m, s),
                "air": air_score(m["pm25"], s),
                "seasonScore": season_score(m["season"], s),
                "eventScore": event_score(m["evtTier"], s),
            }
            qb = (qw[0] * round(checks["weather"], 1) + qw[1] * safety
                  + qw[2] * round(checks["air"], 1)
                  + qw[3] * checks["seasonScore"] + qw[4] * round(checks["eventScore"], 1))
            checks["qolBase"] = qb
            checks["qol"] = floor * qb
            checks["value"] = round(floor * qb, 1) / (m["cost2"] / 1000)
            for k, want in checks.items():
                if abs(m[k] - want) > (0.06 if k != "value" else 0.06):
                    print(f"DRIFT  {c['name']} {m['mo']} {k}: stored {m[k]} != {round(want,2)}")
                    errors += 1

    # Hand-traced anchor: Chiang Mai Jan under v5 settings.
    cm = next(c for c in d["cities"] if c["name"] == "Chiang Mai")
    jan = cm["months"][0]
    # high 84 -> 84, low 57 -> 100, temp 90.4; hum 60 -> 100; rain 2 days -> 96 (tiered)
    want_weather = 0.4 * 90.4 + 0.25 * 100 + 0.35 * 96
    if abs(jan["weather"] - round(want_weather, 1)) > TOL:
        print(f"ANCHOR Chiang Mai Jan weather: stored {jan['weather']} != {want_weather}"); errors += 1
    # pm25 25 -> 100 - 15*1.2 = 82.0
    if abs(jan["air"] - 82.0) > TOL:
        print(f"ANCHOR Chiang Mai Jan air: stored {jan['air']} != 82.0"); errors += 1

    if errors:
        print(f"\n{errors} drift(s) — run scripts/rebake_scores.py --write")
        sys.exit(1)
    print(f"OK — {len(d['cities'])} cities x 12 months reproduce METHODOLOGY formulas")


if __name__ == "__main__":
    main()
