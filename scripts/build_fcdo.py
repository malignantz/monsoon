#!/usr/bin/env python3
"""Bake the UK FCDO advisory layer onto every city's safety object.

Reads:
  data/travel-data.json   (cities; written in place)
  data/fcdo-advice.json   (country-keyed FCDO records, hand-authored)

Writes per city: safety.advisoryUK = {status, appliesToCity, area, summary, url, asOf}.

FCDO is DISPLAY-ONLY — it never touches the numeric score (METHODOLOGY §5: "badge,
not ceiling"). Its only influence on the model is human: it is cited evidence when
hand-setting touristMod, and this script emits an *advisory-divergence* QA report so a
city we rate "Safe"+ while the US (localLevel>=3) AND/OR FCDO (carve-out applies)
elevate it gets a second look (e.g. San Miguel de Allende / Guanajuato in the 45D
zone, or Antigua / Lake Atitlán on US L3 alone).

Run order: after safety_v3.py (which rebuilds the safety object) and before build.sh.
Idempotent.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")
FCDO = os.path.join(ROOT, "data", "fcdo-advice.json")

# Our "Safe"+ band starts at 58 (label_for in safety_v3.py). A divergence is only
# interesting when we call a place safe while two governments elevate it.
SAFE_THRESHOLD = 58


def advisory_for(city, rec):
    """Resolve a city's FCDO advisoryUK from its country record."""
    if not rec:
        return {"status": "none", "appliesToCity": False, "area": None,
                "summary": None, "url": None, "asOf": None}, None

    name = city["name"]
    hit = None
    for co in rec.get("carveouts", []):
        if name in co.get("matchCities", []):
            # most severe carve-out wins if a city somehow matches several
            if hit is None or _rank(co["status"]) > _rank(hit["status"]):
                hit = co

    if hit:
        status, applies, area = hit["status"], True, hit["area"]
    else:
        status, applies, area = rec.get("overall", "none"), False, None

    return {
        "status": status,
        "appliesToCity": applies,
        "area": area,
        "summary": rec.get("crimeSummary"),
        "url": rec.get("url"),
        "asOf": rec.get("asOf"),
    }, hit


def _rank(status):
    return {"none": 0, "amber": 1, "red": 2}.get(status, 0)


def main():
    d = json.load(open(DATA))
    fcdo = json.load(open(FCDO))

    covered, applied, divergences = 0, [], []
    for c in d["cities"]:
        rec = fcdo.get(c["country"])
        uk, hit = advisory_for(c, rec)
        sf = c["safety"]
        sf["advisoryUK"] = uk
        if rec:
            covered += 1
        if uk["appliesToCity"]:
            applied.append((c["name"], uk["status"], uk["area"]))

        # QA: do US + FCDO both elevate a city we rate safe?
        us_level = (sf.get("advisoryLocal") or {}).get("level") or sf.get("regionalLevel") or 1
        us_elevated = us_level >= 3
        fcdo_elevated = uk["appliesToCity"] and uk["status"] in ("amber", "red")
        diverges = (us_elevated or fcdo_elevated) and sf.get("score", 0) >= SAFE_THRESHOLD
        sf["advisoryDivergence"] = bool(diverges)
        if diverges:
            divergences.append((c["name"], sf["score"], us_level, uk["status"], uk["appliesToCity"]))

    json.dump(d, open(DATA, "w"), indent=2, ensure_ascii=False)

    print(f"FCDO baked: {covered} cities in {len(fcdo) - 1} authored countries; "
          f"{len(applied)} city-level carve-out hit(s).")
    for name, status, area in applied:
        print(f"  carve-out -> {name}: FCDO {status} ({area})")
    print(f"\nAdvisory-divergence QA flags ({len(divergences)}): cities we call Safe+ "
          f"that US and/or FCDO elevate")
    if not divergences:
        print("  (none)")
    for name, score, us, uk_status, uk_applies in divergences:
        tag = f"US L{us}" + (f" + FCDO {uk_status}" if uk_applies else "")
        print(f"  ⚠ {name}: score {score} but {tag}")


if __name__ == "__main__":
    main()
