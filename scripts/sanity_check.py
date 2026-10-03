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
            checks["value"] = round(floor * qb, 1) / (m["cost2"] / 1000) ** s["value_cost_exponent"]
            for k, want in checks.items():
                if abs(m[k] - want) > (0.06 if k != "value" else 0.06):
                    print(f"DRIFT  {c['name']} {m['mo']} {k}: stored {m[k]} != {round(want,2)}")
                    errors += 1

    # Hand-traced anchor: Chiang Mai Jan under v5 settings, with the 2026-10-03
    # sourced inputs (WMO station normals, PM2.5 = CAMS shape x WHO annual).
    cm = next(c for c in d["cities"] if c["name"] == "Chiang Mai")
    jan = cm["months"][0]
    want_in = {"high": 86, "low": 60, "hum": 69, "rain": 1, "pm25": 35}
    got_in = {k: jan[k] for k in want_in}
    if got_in != want_in:
        print(f"ANCHOR Chiang Mai Jan inputs changed: {got_in} (anchor traced for {want_in}) — re-trace it")
        errors += 1
    else:
        # high 86 -> 100-6*4 = 76, low 60 -> 100, temp 0.6*76+0.4*100 = 85.6;
        # hum 69 -> 100-9*2 = 82; rain 1 day -> 98 (tiered)
        want_weather = 0.4 * 85.6 + 0.25 * 82 + 0.35 * 98
        if abs(jan["weather"] - round(want_weather, 1)) > TOL:
            print(f"ANCHOR Chiang Mai Jan weather: stored {jan['weather']} != {want_weather}"); errors += 1
        # pm25 35 -> 100 - 25*1.2 = 70.0
        if abs(jan["air"] - 70.0) > TOL:
            print(f"ANCHOR Chiang Mai Jan air: stored {jan['air']} != 70.0"); errors += 1

    # Events invariant: the scored calendar derives from the visible event list.
    from reconcile_events import check_derived
    ev_drift = check_derived(d)
    for city, mo, ot, nt, ol, nl in ev_drift[:10]:
        print(f"EVENTS {city} m{mo}: evtTier {ot} '{ol}' != derived {nt} '{nl}'")
    if ev_drift:
        print(f"{len(ev_drift)} event month(s) diverge from city.events — run "
              "scripts/reconcile_events.py --derive, then rebake_scores.py --write")
        errors += len(ev_drift)

    if errors:
        print(f"\n{errors} drift(s) — run scripts/rebake_scores.py --write")
        sys.exit(1)
    print(f"OK — {len(d['cities'])} cities x 12 months reproduce METHODOLOGY formulas")


if __name__ == "__main__":
    main()
