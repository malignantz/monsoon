"""Shared helpers for the Open-Meteo climate / air-quality fetchers.

- city_slug(): the repo's stable city slug, identical to scripts/check-city-ids.mjs
  (NFD-decompose, strip combining marks, non-alnum -> '-'), i.e. the keys of
  src/lib/cityIds.v1.js.
- fetch_json(): polite GET with retry + backoff on 429 / 5xx / network errors.
- load_cities(): name/slug/lat/lng for every city in data/travel-data.json.
"""
import json, os, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")
UA = "monsoon.fyi data pipeline (climate/air normals; contact via monsoon.fyi)"


def city_slug(name):
    s = unicodedata.normalize("NFD", name.lower())
    s = "".join(ch for ch in s if not ("̀" <= ch <= "ͯ"))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def load_cities():
    d = json.load(open(DATA))
    return [{"name": c["name"], "country": c["country"], "slug": city_slug(c["name"]),
             "lat": c["lat"], "lng": c["lng"]} for c in d["cities"]]


class DailyLimit(Exception):
    pass


def fetch_json(base, params, tries=8):
    url = base + "?" + urllib.parse.urlencode(params)
    delay = 15
    for attempt in range(1, tries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf8", "replace")
            if e.code == 429:
                if "Daily" in body:
                    raise DailyLimit(body)
                wait = 600 if "Hourly" in body else max(delay, 65)
                print(f"    429 ({body.strip()[:120]}) — sleeping {wait}s", file=sys.stderr)
                time.sleep(wait)
                delay = min(delay * 2, 600)
                continue
            if e.code >= 500:
                print(f"    HTTP {e.code} — retry in {delay}s", file=sys.stderr)
                time.sleep(delay); delay = min(delay * 2, 600)
                continue
            raise RuntimeError(f"HTTP {e.code} for {url}: {body[:300]}")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            print(f"    network error {e} — retry in {delay}s", file=sys.stderr)
            time.sleep(delay); delay = min(delay * 2, 600)
    raise RuntimeError(f"gave up after {tries} tries: {url}")


def cached(path, fetch):
    """Return JSON at path, fetching + writing it first if absent."""
    if os.path.exists(path):
        return json.load(open(path)), False
    data = fetch()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".part"
    json.dump(data, open(tmp, "w"), separators=(",", ":"))
    os.replace(tmp, path)
    return data, True


def c_to_f(c):
    return c * 9 / 5 + 32
