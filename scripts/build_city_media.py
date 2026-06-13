#!/usr/bin/env python3
"""Bake reviewed hero photos into travel-data.json.

Reads data/city-media.json and sets city.media ONLY for entries flagged review:true
(so unreviewed / bad auto-picks never ship). Cities without a reviewed photo keep no
media object and the sheet renders a region-gradient hero. Idempotent.

Run after fetch_city_photos.py (and your manual review), before build.sh.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")
MEDIA = os.path.join(ROOT, "data", "city-media.json")


def main():
    d = json.load(open(DATA))
    media = json.load(open(MEDIA))

    shipped, skipped = 0, 0
    for c in d["cities"]:
        rec = media.get(c["name"])
        if rec and rec.get("review") and rec.get("hero"):
            c["media"] = {
                "hero": rec["hero"], "thumb": rec.get("thumb"),
                "credit": rec.get("credit", ""), "license": rec.get("license", ""),
                "sourceUrl": rec.get("sourceUrl", ""),
            }
            shipped += 1
        else:
            c.pop("media", None)
            skipped += 1

    json.dump(d, open(DATA, "w"), indent=2, ensure_ascii=False)
    print(f"media baked: {shipped} reviewed photos shipped, {skipped} on gradient fallback.")


if __name__ == "__main__":
    main()
