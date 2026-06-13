#!/usr/bin/env python3
"""Replace a city's hero with a specific Commons file (manual override).

Usage: python3 scripts/set_hero.py "City Name=File:Some image.jpg" [more...]

Fetches a 1280px rendered thumb + attribution for each File: title, writes the
WebP hero/thumb pair, and updates data/city-media.json with review:false for
re-review. Use when the Wikipedia lead image is a montage, coat of arms, or
otherwise wrong (see TITLE_OVERRIDES in fetch_city_photos.py for title-level
fixes — this is the image-level fix).
"""
import json, os, re, sys, time, urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_city_photos import _get, _json, optimize, city_key, COMMONS, THROTTLE_S

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")
MEDIA = os.path.join(ROOT, "data", "city-media.json")


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cities = {c["name"]: c for c in json.load(open(DATA))["cities"]}
    media = json.load(open(MEDIA))

    for arg in sys.argv[1:]:
        name, _, fname = arg.partition("=")
        if name not in cities or not fname.startswith("File:"):
            print(f"✗ bad arg: {arg}"); continue
        try:
            q = (f"{COMMONS}?action=query&titles={urllib.parse.quote(fname)}"
                 "&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1280&format=json")
            info = next(iter(_json(q)["query"]["pages"].values()))["imageinfo"][0]
            url = info.get("thumburl") or info["url"]
            ext = info.get("extmetadata", {})
            artist = re.sub("<[^>]+>", "", ext.get("Artist", {}).get("value", "")).strip()
            lic = ext.get("LicenseShortName", {}).get("value", "")
            hero, thumb = optimize(_get(url), city_key(cities[name]))
            media[name] = {"hero": hero, "thumb": thumb,
                           "credit": f"{artist} / Wikimedia Commons".strip(" /"),
                           "license": lic, "sourceUrl": info.get("descriptionurl", url),
                           "review": False}
            json.dump(media, open(MEDIA, "w"), indent=2, ensure_ascii=False)
            print(f"✓ {name}: {fname} ({lic})")
        except Exception as e:
            print(f"✗ {name}: {e}")
        time.sleep(THROTTLE_S)


if __name__ == "__main__":
    main()
