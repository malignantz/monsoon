#!/usr/bin/env python3
"""Tag every city with an English-friendliness tier (city.english = {tier, note}).

Display-only (city sheet "Practical" section); not part of any score.
Tier anchors on the EF English Proficiency Index country band, bumped +1 for
cities whose tourist/expat economy runs far ahead of the national average
(established nomad hubs, expat havens). 0-3 scale:

    3  Widespread     — native/official or near-universal fluency
    2  Good in town   — high-proficiency country or strong expat infrastructure
    1  Tourist zones  — get by in hotels/restaurants, thin beyond them
    0  Limited        — expect phrasebook/translator outside major hotels

Idempotent; run after add_timezones.py in the bake order.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")

# EF EPI 2024-25 country bands, collapsed to tiers.
COUNTRY_TIER = {
    # native / official / very-high EPI
    "United Kingdom": 3, "Ireland": 3, "Canada": 3, "Australia": 3, "New Zealand": 3,
    "Netherlands": 3, "Denmark": 3, "Sweden": 3, "Norway": 3, "Finland": 3,
    "Malta": 3, "South Africa": 3, "Philippines": 3,
    # high EPI
    "Germany": 2, "Austria": 2, "Switzerland": 2, "Portugal": 2, "Greece": 2,
    "Croatia": 2, "Slovenia": 2, "Estonia": 2, "Latvia": 2, "Lithuania": 2,
    "Poland": 2, "Czech Republic": 2, "Slovakia": 2, "Hungary": 2, "Romania": 2,
    "Bulgaria": 2, "Serbia": 2, "Cyprus": 2, "Malaysia": 2, "Bosnia & Herzegovina": 2,
    "North Macedonia": 2, "Albania": 2, "Montenegro": 2,
    # moderate EPI — tourist-zone English
    "Spain": 1, "Italy": 1, "Sicily": 1, "France": 1, "Turkey": 1, "Georgia": 1,
    "Armenia": 1, "Mexico": 1, "Guatemala": 1, "Costa Rica": 1, "Panama": 1,
    "Colombia": 1, "Peru": 1, "Ecuador": 1, "Chile": 1, "Argentina": 1,
    "Uruguay": 1, "Brazil": 1, "Morocco": 1, "Thailand": 1, "Vietnam": 1,
    "Cambodia": 1, "Indonesia": 1, "Taiwan": 1, "Japan": 1,
}

# Cities whose expat/nomad economy runs well ahead of the national band.
CITY_BUMP = {
    "Lisbon", "Porto", "Chiang Mai", "Bangkok", "Bali (Canggu/Ubud)",
    "Mexico City", "San Miguel de Allende", "Mérida", "Medellín", "Tbilisi",
    "Barcelona", "Madrid", "Buenos Aires", "Boquete", "Cuenca",
    "Antigua", "Lake Atitlán (Panajachel)", "Marrakech",
}

LABEL = {3: "Widespread", 2: "Good in town", 1: "Tourist zones", 0: "Limited"}


def main():
    d = json.load(open(DATA))
    missing = []
    for c in d["cities"]:
        base = COUNTRY_TIER.get(c["country"])
        if base is None:
            missing.append(f"{c['name']} ({c['country']})")
            continue
        tier = min(3, base + (1 if c["name"] in CITY_BUMP else 0))
        note = LABEL[tier]
        if c["name"] in CITY_BUMP and base < 3:
            note += " (expat hub — above national average)"
        c["english"] = {"tier": tier, "note": note}
    if missing:
        raise SystemExit("no english tier for: " + ", ".join(missing))
    json.dump(d, open(DATA, "w"), indent=2, ensure_ascii=False)
    counts = {}
    for c in d["cities"]:
        counts[c["english"]["tier"]] = counts.get(c["english"]["tier"], 0) + 1
    print(f"tagged {len(d['cities'])} cities — tier counts: {dict(sorted(counts.items(), reverse=True))}")


if __name__ == "__main__":
    main()
