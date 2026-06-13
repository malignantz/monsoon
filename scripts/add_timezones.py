#!/usr/bin/env python3
"""Tag every city with a standard-time UTC offset (city.timezone).

Display-only (city sheet "Practical" section + US-workday-overlap note in the
app); not part of any score. Offsets are STANDARD time — DST shifts of ±1h are
noted in the string where the country observes it. City-level exceptions cover
multi-zone countries (Canary Islands, Madeira, Yucatán). Idempotent.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")

CET = "UTC+1 (DST +2)"
EET = "UTC+2 (DST +3)"

COUNTRY_TZ = {
    "Albania": CET, "Austria": CET, "Bosnia & Herzegovina": CET, "Croatia": CET,
    "Czech Republic": CET, "Denmark": CET, "France": CET, "Germany": CET,
    "Hungary": CET, "Italy": CET, "Sicily": CET, "Malta": CET, "Montenegro": CET,
    "Netherlands": CET, "North Macedonia": CET, "Norway": CET, "Poland": CET,
    "Serbia": CET, "Slovakia": CET, "Slovenia": CET, "Spain": CET, "Sweden": CET,
    "Switzerland": CET,
    "Bulgaria": EET, "Cyprus": EET, "Estonia": EET, "Finland": EET, "Greece": EET,
    "Latvia": EET, "Lithuania": EET, "Romania": EET,
    "Portugal": "UTC+0 (DST +1)", "United Kingdom": "UTC+0 (DST +1)",
    "Ireland": "UTC+0 (DST +1)", "Morocco": "UTC+1",
    "Georgia": "UTC+4", "Armenia": "UTC+4", "Turkey": "UTC+3",
    "Thailand": "UTC+7", "Cambodia": "UTC+7", "Vietnam": "UTC+7",
    "Indonesia": "UTC+8",  # Bali is WITA
    "Malaysia": "UTC+8", "Philippines": "UTC+8", "Taiwan": "UTC+8",
    "Japan": "UTC+9",
    "Australia": "UTC+10 (DST +11)",  # Melbourne
    "New Zealand": "UTC+12 (DST +13)",
    "Mexico": "UTC-6",  # CDMX/central, no DST since 2022
    "Guatemala": "UTC-6", "Costa Rica": "UTC-6",
    "Panama": "UTC-5", "Colombia": "UTC-5", "Peru": "UTC-5", "Ecuador": "UTC-5",
    "Chile": "UTC-4 (DST -3)", "Brazil": "UTC-3",
    "Argentina": "UTC-3", "Uruguay": "UTC-3",
    "Canada": "UTC-8 (DST -7)",  # Vancouver
    "South Africa": "UTC+2",
}

CITY_TZ = {
    "Las Palmas (Gran Canaria)": "UTC+0 (DST +1)",  # Canaries, not mainland Spain
    "Funchal (Madeira)": "UTC+0 (DST +1)",          # same zone as Lisbon, kept explicit
    "Mérida": "UTC-5",                              # Yucatán left DST/central in 2015
}


def main():
    d = json.load(open(DATA))
    missing = []
    for c in d["cities"]:
        tz = CITY_TZ.get(c["name"]) or COUNTRY_TZ.get(c["country"])
        if not tz:
            missing.append(f"{c['name']} ({c['country']})")
            continue
        c["timezone"] = tz
    if missing:
        raise SystemExit("no timezone for: " + ", ".join(missing))
    json.dump(d, open(DATA, "w"), indent=2, ensure_ascii=False)
    print(f"tagged {len(d['cities'])} cities with timezones")


if __name__ == "__main__":
    main()
