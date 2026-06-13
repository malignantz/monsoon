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
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")
CONTENT = os.path.join(ROOT, "data", "city-content.json")

ACTIVITY_KEYS = {"food", "nature", "water", "culture", "nightlife", "wellness", "adventure", "nomad"}


def main():
    d = json.load(open(DATA))
    content = json.load(open(CONTENT))

    authored, missing = [], []
    for c in d["cities"]:
        rec = content.get(c["name"])
        if not rec:
            missing.append(c["name"])
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
                "activities": {k: int(acts.get(k, 0)) for k in ACTIVITY_KEYS},
            }

        if rec.get("events"):
            c["events"] = rec["events"]

        authored.append(c["name"])

    json.dump(d, open(DATA, "w"), indent=2, ensure_ascii=False)
    print(f"city content baked: {len(authored)} authored, {len(missing)} pending.")
    print("authored:", ", ".join(authored))
    print(f"\n{len(missing)} cities still use graceful fallbacks (legacy draw + month.events).")


if __name__ == "__main__":
    main()
