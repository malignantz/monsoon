#!/usr/bin/env python3
"""Source one licensed hero photo per city from Wikimedia and record attribution.

This is the heaviest new pipeline and is LICENSE-SENSITIVE, so it is meant to be run
outside the sandbox and reviewed by hand. Until photos land, the city sheet falls back
to a region-themed gradient — nothing breaks.

Pipeline per city:
  1. Look up the city's Wikipedia page lead image via the REST summary API.
  2. Pull the Commons imageinfo extmetadata (artist + license) for attribution.
  3. Download the original, resize to a 1200w hero + 480w thumb, save as WebP under
     assets/cities/<key>.webp / <key>-sm.webp  (requires Pillow; skipped if absent).
  4. Record {hero, thumb, credit, license, sourceUrl} into data/city-media.json,
     keyed by city NAME, with a "review": false flag for you to flip after eyeballing.

Usage:
  python3 scripts/fetch_city_photos.py --pilot      # 1 city per region (~18), for review
  python3 scripts/fetch_city_photos.py --all        # full catalog
  python3 scripts/fetch_city_photos.py "Lisbon" "Porto"   # specific cities

After running, OPEN each image, fix bad picks by hand (set a "heroOverride" Commons
file URL in city-media.json and re-run for that city), then set "review": true. Only
review:true entries should ship. build.sh copies assets/cities/ into dist/.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")
MEDIA = os.path.join(ROOT, "data", "city-media.json")
OUTDIR = os.path.join(ROOT, "assets", "cities")
# Wikimedia's robot policy (https://w.wiki/4wJS) requires a descriptive UA with
# a contact address; generic UAs get 429'd.
UA = "SlowTravelAtlas/1.0 (personal slow-travel planning app; one-off asset fetch) python-urllib"
THROTTLE_S = 1.5  # be polite; pilot is ~20 cities x 3 requests


def city_key(city):
    """Mirror cityKey() in src/app.js — the stored data has no key field."""
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", f"{city['name']}-{city['country']}".lower()))


# Catalog names that don't resolve to the right Wikipedia article directly —
# parenthetical qualifiers and disambiguation-page collisions.
TITLE_OVERRIDES = {
    "Athens": "Athens, Greece",  # kept from the old special-case
    "Valencia": "Valencia, Spain",
    "Bali (Canggu/Ubud)": "Ubud",
    "George Town (Penang)": "George Town, Penang",
    "Lagos (Algarve)": "Lagos, Portugal",
    "Catania (Sicily)": "Catania",
    "Chania (Crete)": "Chania",
    "Lake Atitlán (Panajachel)": "Lake Atitlán",
    "Funchal (Madeira)": "Funchal",
    "Las Palmas": "Las Palmas",
    "Split": "Split, Croatia",
    "Mérida": "Mérida, Yucatán",
    "Cuenca": "Cuenca, Ecuador",
    "San José": "San José, Costa Rica",
    "Mendoza": "Mendoza, Argentina",
    "João Pessoa": "João Pessoa, Paraíba",
    "Hoi An": "Hội An",
}

REST = "https://en.wikipedia.org/api/rest_v1/page/summary/"
COMMONS = "https://en.wikipedia.org/w/api.php"


def _get(url):
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 2:
                time.sleep(8 * (attempt + 1))
                continue
            raise


def _json(url):
    return json.loads(_get(url).decode("utf-8"))


def lead_image(title):
    """Return (image_title, fetch_url) for a Wikipedia page's lead image.

    Wikimedia's robot policy 429s bulk fetches of full-size originals and asks
    for rendered thumbnails instead — we only need 1200w, so request a 1280px
    thumb (rewriting the width in the summary's thumbnail URL)."""
    summary = _json(REST + urllib.parse.quote(title.replace(" ", "_")))
    thumb = summary.get("thumbnail", {}).get("source")
    orig = summary.get("originalimage", {}).get("source")
    url = re.sub(r"/(\d+)px-", "/1280px-", thumb) if thumb and "px-" in thumb else (thumb or orig)
    return summary.get("title"), url or orig


def original_filename(image_url):
    """Commons File: name from either an original or a /thumb/ rendered URL."""
    parts = urllib.parse.unquote(image_url).split("/")
    if "/thumb/" in image_url:
        return "File:" + parts[-2]
    return "File:" + parts[-1]


def commons_attribution(image_url):
    """Artist + license from Commons extmetadata. License is REQUIRED for
    shipping, so failures propagate instead of silently returning blanks."""
    fname = original_filename(image_url)
    q = (f"{COMMONS}?action=query&titles={urllib.parse.quote(fname)}"
         "&prop=imageinfo&iiprop=extmetadata|url&format=json")
    pages = _json(q)["query"]["pages"]
    info = next(iter(pages.values()))["imageinfo"][0]
    ext = info.get("extmetadata", {})
    artist = re.sub("<[^>]+>", "", ext.get("Artist", {}).get("value", "")).strip()
    lic = ext.get("LicenseShortName", {}).get("value", "")
    return f"{artist} / Wikimedia Commons".strip(" /"), lic, info.get("descriptionurl", "")


def optimize(raw, key):
    """Save 1200w hero + 480w thumb as WebP. Requires Pillow; returns rel paths or None."""
    try:
        from io import BytesIO
        from PIL import Image
    except ImportError:
        print("  (Pillow not installed — skipping image write; attribution still recorded)")
        return None, None
    os.makedirs(OUTDIR, exist_ok=True)
    img = Image.open(BytesIO(raw)).convert("RGB")

    def save(width, suffix):
        w, h = img.size
        scale = width / w
        out = img.resize((width, max(1, int(h * scale))), Image.LANCZOS)
        rel = f"assets/cities/{key}{suffix}.webp"
        out.save(os.path.join(OUTDIR, f"{key}{suffix}.webp"), "WEBP", quality=82)
        return rel

    hero = save(1200, "")
    thumb = save(480, "-sm")
    return hero, thumb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cities", nargs="*")
    ap.add_argument("--pilot", action="store_true")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()

    d = json.load(open(DATA))
    media = json.load(open(MEDIA)) if os.path.exists(MEDIA) else {"_meta": {
        "note": "Hero photos + attribution. Only entries with review:true should ship. "
                "Populated by scripts/fetch_city_photos.py; missing cities fall back to a region gradient.",
        "asOf": "2026-06"}}

    cities = d["cities"]
    if args.all:
        targets = cities
    elif args.pilot:
        seen, targets = set(), []
        for c in cities:
            if c["region"] not in seen:
                seen.add(c["region"])
                targets.append(c)
    elif args.cities:
        names = set(args.cities)
        targets = [c for c in cities if c["name"] in names]
    else:
        ap.error("specify --pilot, --all, or city names")

    def save():
        json.dump(media, open(MEDIA, "w"), indent=2, ensure_ascii=False)

    for c in targets:
        name = c["name"]
        key = city_key(c)
        hero_rel = f"assets/cities/{key}.webp"
        hero_abs = os.path.join(ROOT, hero_rel)
        existing = media.get(name)

        # Resume: complete entry with the file on disk -> nothing to do.
        if existing and existing.get("hero") and os.path.exists(hero_abs):
            print(f"= {name}: already complete", flush=True)
            continue

        try:
            title = TITLE_OVERRIDES.get(name, name)
            _, orig = lead_image(title)
            if not orig:
                print(f"✗ {name}: no lead image", flush=True); continue
            credit, lic, src = commons_attribution(orig)
            if os.path.exists(hero_abs):
                # Image already downloaded by an interrupted run — attribution only.
                hero, thumb = hero_rel, f"assets/cities/{key}-sm.webp"
                tag = "(attribution refreshed)"
            else:
                hero, thumb = optimize(_get(orig), key)
                tag = ""
            media[name] = {
                "hero": hero, "thumb": thumb, "credit": credit, "license": lic,
                "sourceUrl": src or orig, "review": False,
            }
            save()  # incremental — an interrupted run loses at most one city
            print(f"✓ {name}: {lic or 'license?'} — {credit} {tag}", flush=True)
        except Exception as e:
            print(f"✗ {name}: {e}", flush=True)
        time.sleep(THROTTLE_S)

    save()
    print(f"\nwrote {os.path.relpath(MEDIA, ROOT)} — review each, set review:true, then run build_city_media.py", flush=True)


if __name__ == "__main__":
    main()
