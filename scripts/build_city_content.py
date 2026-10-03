#!/usr/bin/env python3
"""Bake qualitative city content (AI-drafted, human-approved) into travel-data.json.

Reads:
  data/travel-data.json     (cities; written in place)
  data/city-content.json    (per-city narratives, draw, events — hand-reviewed)

Writes per city (only when authored — everything degrades gracefully if absent):
  safety.narrative   -> prose safety read (sheet Safety section)
  drawDetail         -> { narrative, activities{8 dims 0-3} }  (sheet "The draw")
  events             -> [ { name, months[], tier, blurb } ]    (sheet Events)

The legacy top-level `draw` string and per-month `events` strings are left intact;
the sheet falls back to them for any city not yet authored. Idempotent. Run after
safety_v3.py / build_fcdo.py, before build.sh.

  python3 scripts/build_city_content.py                # bake everything above
  python3 scripts/build_city_content.py --only events  # bake city.events only
                                                       # (used by reconcile_events.py)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from city_inputs import managed_names  # add_city.py bakes these cities' content

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")
CONTENT = os.path.join(ROOT, "data", "city-content.json")

# Fixed order (the order every baked record already has). It used to come from
# iterating a set, which depends on Python's per-process string hashing, so a
# rerun could reorder every city's activities and rewrite the file.
ACTIVITY_ORDER = ["adventure", "culture", "nomad", "wellness", "water", "food", "nature", "nightlife"]
ACTIVITY_KEYS = set(ACTIVITY_ORDER)


def main():
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
        if only != "events":
            raise SystemExit("--only supports: events")
    d = json.load(open(DATA))
    content = json.load(open(CONTENT))

    authored, missing = [], []
    managed = managed_names()
    for c in d["cities"]:
        if c["name"] in managed:
            continue
        rec = content.get(c["name"])
        if not rec:
            missing.append(c["name"])
            continue

        if only == "events":
            if rec.get("events"):
                c["events"] = rec["events"]
            authored.append(c["name"])
            continue

        if rec.get("safetyNarrative"):
            c["safety"]["narrative"] = rec["safetyNarrative"]

        draw = rec.get("draw")
        if draw:
            acts = draw.get("activities", {})
            bad = set(acts) - ACTIVITY_KEYS
            if bad:
                raise SystemExit(f"{c['name']}: unknown activity keys {bad}")
            c["drawDetail"] = {
                "narrative": draw.get("narrative", ""),
                "activities": {k: int(acts.get(k, 0)) for k in ACTIVITY_ORDER},
            }

        if rec.get("events"):
            c["events"] = rec["events"]

        authored.append(c["name"])

    with open(DATA, "w") as f:
        f.write(json.dumps(d, indent=2, ensure_ascii=False))  # same bytes as every other bake step
    if only:
        print(f"city {only} baked: {len(authored)} cities, {len(missing)} without content.")
        return
    print(f"city content baked: {len(authored)} authored, {len(missing)} pending.")
    print("authored:", ", ".join(authored))
    print(f"\n{len(missing)} cities still use graceful fallbacks (legacy draw + month.events).")


if __name__ == "__main__":
    main()
