#!/usr/bin/env python3
"""Tag each city with `schengen` (bool) for the 90/180-day rule.

Schengen Area membership as of 2026: includes Croatia (2023) and Bulgaria +
Romania (full members, land borders from Jan 2025). Note the EU-but-NOT-Schengen
cases present in the catalog: Cyprus and Ireland (and the UK, which left the EU).
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")

SCHENGEN = {
    "Austria", "Belgium", "Bulgaria", "Croatia", "Czech Republic", "Czechia",
    "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary",
    "Iceland", "Italy", "Latvia", "Liechtenstein", "Lithuania", "Luxembourg",
    "Malta", "Netherlands", "Norway", "Poland", "Portugal", "Romania",
    "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland",
    "Sicily",  # catalog country-label for Palermo (Italy → Schengen)
}

d = json.load(open(DATA))
n = 0
for c in d["cities"]:
    c["schengen"] = c["country"] in SCHENGEN
    n += c["schengen"]
json.dump(d, open(DATA, "w"), indent=2, ensure_ascii=False)
print(f"tagged {len(d['cities'])} cities — {n} Schengen, {len(d['cities'])-n} non-Schengen")
print("Schengen cities:", sorted(c["name"] for c in d["cities"] if c["schengen"]))
