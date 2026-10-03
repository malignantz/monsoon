#!/usr/bin/env python3
"""Refresh the U.S. State Department advisory shown per city (display-only, never scored).

Reads the public advisory feed (https://cadataapi.state.gov/api/TravelAdvisories, or a
saved copy via --feed FILE) and updates, for every city whose country is in the feed:
safety.advisory (text), advisoryLevel and date (the feed's publish time as a UTC date).
regionalLevel and advisoryLocal.level follow the country level only where they simply
mirrored it (no local area); hand-set regional carve-outs are left alone and listed.
When a level changes, risks are taken from a sibling city already at the new level,
else cleared — check them against the advisory page.

Cities managed by add_city.py keep their advisory in data/cities/<slug>.json; those
files are updated too, so add_city.py --check still reproduces the record.

  python3 scripts/refresh_advisories.py            # report only
  python3 scripts/refresh_advisories.py --write    # apply
A country rising to Level 3+ is reported and NOT applied (badge and local level need a
human decision). Scores do not depend on any of this; run rebake_scores.py --check after.
"""
import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "travel-data.json"
CITIES_DIR = ROOT / "data" / "cities"
FEED_URL = "https://cadataapi.state.gov/api/TravelAdvisories"
LEVEL_TEXT = {1: "Exercise normal precautions", 2: "Exercise increased caution",
              3: "Reconsider travel", 4: "Do not travel"}
# Our country label -> the feed's name, where they differ.
ALIASES = {"Czech Republic": "Czechia", "Bosnia & Herzegovina": "Bosnia and Herzegovina",
           "Denmark": "Kingdom of Denmark", "Sicily": "Italy", "Mexico": "Mexico Travel Advisory"}


def load_feed(path):
    if path:
        raw = json.loads(Path(path).read_text())
    else:
        with urllib.request.urlopen(FEED_URL, timeout=60) as r:
            raw = json.load(r)
    feed = {}
    for x in raw:
        m = re.match(r"\s*(.+?)\s*[-–]\s*Level (\d)\s*:", x.get("Title", ""))
        if not m:
            continue
        date = datetime.fromisoformat(x["Published"]).astimezone(timezone.utc).date().isoformat()
        feed[m.group(1).strip()] = (int(m.group(2)), date)
    return feed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--feed", help="saved copy of the feed JSON")
    args = ap.parse_args()

    feed = load_feed(args.feed)
    data = json.loads(DATA.read_text())
    inputs = {}
    for p in sorted(CITIES_DIR.glob("*.json")):
        if p.name.startswith("_"):
            continue
        inputs[json.loads(p.read_text())["name"]] = p

    by_country = {}
    for c in data["cities"]:
        by_country.setdefault(c["country"], []).append(c)

    level_changes, date_changes, unmatched, held, carveouts = [], 0, [], [], []
    for country, cities in by_country.items():
        hit = feed.get(ALIASES.get(country, country))
        if not hit:
            unmatched.append(country)
            continue
        level, date = hit
        for c in cities:
            s = c["safety"]
            old = s.get("advisoryLevel")
            if level != old and level >= 3:
                held.append(f"{c['name']} ({country}): Level {old} -> {level}")
                continue
            inp = None
            if c["name"] in inputs:
                inp = json.loads(inputs[c["name"]].read_text())
            a = inp["safety"]["advisory"] if inp else None
            if level != old:
                sib = next((x["safety"].get("risks", []) for x in cities
                            if x is not c and x["safety"].get("advisoryLevel") == level), [])
                level_changes.append(f"{c['name']} ({country}): Level {old} -> {level}, risks {s.get('risks')} -> {sib}")
                s["advisory"], s["advisoryLevel"], s["risks"] = LEVEL_TEXT[level], level, list(sib)
                local = s.get("advisoryLocal") or {}
                if s.get("regionalLevel") == old and not local.get("area"):
                    s["regionalLevel"] = level
                    if local.get("level") == old:
                        local["level"] = level
                else:
                    carveouts.append(f"{c['name']}: regional {s.get('regionalLevel')} / local {local} left as set")
                if a:
                    a.update(level=level, text=LEVEL_TEXT[level], risks=list(sib))
                    if a.get("regionalLevel") == old and not a.get("localArea"):
                        a["regionalLevel"] = level
                        if a.get("localLevel") == old:
                            a["localLevel"] = level
            if s.get("date") != date:
                date_changes += 1
                s["date"] = date
                if a:
                    a["date"] = date
            if inp and args.write:
                inputs[c["name"]].write_text(json.dumps(inp, ensure_ascii=False, indent=2) + "\n")

    print(f"level changes: {len(level_changes)}")
    for line in level_changes:
        print("  " + line)
    print(f"dates updated: {date_changes} cities")
    for line in carveouts:
        print("  carve-out kept: " + line)
    if held:
        print("NOT APPLIED (rose to Level 3+, needs a decision):")
        for line in held:
            print("  " + line)
    if unmatched:
        print("no feed entry for: " + ", ".join(unmatched))
    if args.write:
        DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        print("written — now run rebake_scores.py --check and add_city.py --check")
    else:
        print("report only — travel-data.json not modified")
    return 1 if held else 0


if __name__ == "__main__":
    sys.exit(main())
