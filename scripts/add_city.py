#!/usr/bin/env python3
"""Add (or re-bake) a city from its per-city input file — the add-a-city pipeline.

    python3 scripts/add_city.py <slug> [<slug> ...]   # bake these cities
    python3 scripts/add_city.py --all                 # every data/cities/<slug>.json
    python3 scripts/add_city.py --check               # validate inputs, verify managed records
                                                      # match their inputs, run every check
Options:
    --offline      never call Open-Meteo (use cache / committed normals only)
    --no-build     skip `npm run build`, scripts/build.sh and check:seo (faster loop)
    --allow a,b    existing cities whose climate/air may legitimately change in this
                   run (e.g. a hold-back lifted after their ERA5 data arrived)

Inputs (all authored by hand, see docs/adding-a-city.md):
    data/cities/<slug>.json          identity, visa, english, season, hazards, swim, events,
                                     draw/vibe/narrative, safety inputs + advisory (schema:
                                     data/cities/_schema.json)
    data/cost-evidence/<slug>.json   itemised, sourced cost components

Steps per city, in order (each idempotent; safe to re-run):
    1. validate the input against the schema (+ semantic checks)
    2. climate/air chain for the slug: fetch_climate.py --only, fetch_air.py --only
       (incremental, Open-Meteo quota resets 00:00 UTC), build_station_normals.py,
       calibrate_climate.py (frozen fit), calibrate_air.py
    3. hold-back rules for a new city (seed_holdbacks.new_city_holds). A held-back
       metric has no fallback for a new city, so the city stays PENDING (exit 2) and
       is not added.
    4. compose the record with the existing bake functions (build_costs.derive,
       safety_v3.compute_safety, reconcile_events.derived_month,
       apply_climate_air.build, rebake_scores formulas) and write ONLY that record
       into data/travel-data.json (appended for a new city, replaced in place on a
       re-run). Legacy all-city scripts skip managed cities.
    5. global idempotent passes: seed_holdbacks.py, apply_climate_air.py --write
       (which rebakes + sanity-checks), so the new record is exactly what the
       all-city pipeline produces.
    6. assert every pre-existing city record is byte-identical (canonical JSON hash),
       except cities named in --allow (climate/air fields only).
    7. append the slug to src/lib/cityIds.v1.js if missing (append-only).
    8. checks: sanity_check.py, rebake_scores.py --check, reconcile --check-derived,
       npm run build (regenerates src/generated/), check:ids, check:seeds,
       test:schengen, test:daycount, scripts/build.sh (SEO pages + leak check),
       check:seo, and that every managed city has a static page + sitemap entry.
"""
import copy, hashlib, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data", "travel-data.json")
IDS = os.path.join(ROOT, "src", "lib", "cityIds.v1.js")

import city_inputs as CI                                    # noqa: E402
from build_costs import derive as derive_costs, load_store  # noqa: E402
from safety_v3 import compute_safety                        # noqa: E402
from reconcile_events import derived_month, check_derived   # noqa: E402
from rebake_scores import weather_score, air_score, season_score, event_score  # noqa: E402
import apply_climate_air as AP                              # noqa: E402
import seed_holdbacks as SH                                 # noqa: E402

P = lambda *a: os.path.join(ROOT, "data", *a)
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
ACTIVITY_ORDER = ["adventure", "culture", "nomad", "wellness", "water", "food", "nature", "nightlife"]
CLIMATE_FIELDS = {"high", "low", "hum", "rain", "pm25", "airCat", "airColor",
                  "weather", "air", "qolBase", "qol", "value"}
ADVISORY_SOURCE = "U.S. Department of State Travel Advisories"


def load(p):
    return json.load(open(p))


def write_data(d):
    # identical serialisation to every other bake step (indent 2, UTF-8, no trailing newline)
    json.dump(d, open(DATA, "w"), indent=2, ensure_ascii=False)


def rec_hash(c):
    return hashlib.sha256(json.dumps(c, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def run(cmd, check=True, quiet=False):
    print("  $ " + " ".join(cmd))
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip()
    if out and not quiet:
        print("    " + "\n    ".join(out.splitlines()[-6:]))
    if check and r.returncode != 0:
        if quiet and out:
            print("    " + "\n    ".join(out.splitlines()[-20:]))
        raise SystemExit(f"step failed: {' '.join(cmd)} (exit {r.returncode})")
    return r


# ---------------------------------------------------------------- climate/air chain

def climate_air_chain(slugs, offline):
    only = ",".join(slugs)
    net = ["--offline"] if offline else []
    run([sys.executable, "scripts/fetch_climate.py", "--only", only] + net)
    run([sys.executable, "scripts/fetch_air.py", "--only", only] + net)
    run([sys.executable, "scripts/build_station_normals.py"], quiet=True)
    run([sys.executable, "scripts/calibrate_climate.py"], quiet=True)
    run([sys.executable, "scripts/calibrate_air.py"], quiet=True)


def holds_for(s, inp):
    ccal, acal = load(P("climate-calibrated.json")), load(P("air-calibrated.json"))
    clim = load(P("climate-normals.json"))
    if s not in ccal:
        return [{"metric": "all", "months": "all", "rule": "pending", "reason": "not in the calibrated climate file"}]
    manual = (inp.get("climateAir") or {}).get("manualHolds", [])
    return SH.new_city_holds(s, inp["lat"], ccal[s], acal.get(s), clim.get(s), manual)


# ---------------------------------------------------------------- record composition

def visa_for(inp):
    if inp.get("visa"):
        return inp["visa"]
    import add_visa
    if inp["country"] not in add_visa.VISA:
        raise SystemExit(f"{inp['name']}: no visa rule for {inp['country']} in scripts/add_visa.py — "
                         "author `visa` in the city file")
    return add_visa.VISA[inp["country"]]


def safety_inputs(inp):
    sf = inp["safety"]
    m = {k: sf[k] for k in ("propertySub", "propertyNote", "womensSafetyNote", "touristMod",
                            "touristRationale", "touristTags", "womensAdj")}
    ho = sf.get("homicideOverride")
    if ho:
        m.update(homicideOverride=ho["rate"], homicideScope=ho["scope"],
                 homicideSource=ho["source"], homicideUrl=ho.get("url"))
    a = sf["advisory"]
    regional = a.get("regionalLevel", a["level"])
    m["localLevel"] = a.get("localLevel", regional)
    m["localArea"] = a.get("localArea")
    adv = {"advisory": a["text"], "advisoryLevel": a["level"], "regionalLevel": regional,
           "risks": a["risks"], "source": ADVISORY_SOURCE, "url": a["url"], "date": a["date"]}
    return m, adv


def compose(inp, d):
    """The full catalog record for one city, built from its input file + pipeline outputs."""
    s = CI.slug(inp["name"])
    st = d["settings"]
    store = load_store()
    if inp["name"] not in store:
        raise SystemExit(f"{s}: no cost evidence for {inp['name']!r}")
    rent, util, var, solo, couple, cost1, cost2 = derive_costs(store[inp["name"]])

    m, adv = safety_inputs(inp)
    safety = compute_safety(inp["name"], inp["country"], m, adv, st, load(P("worldbank-homicide.json")),
                            load(P("wps-community-safety.json"))["countries"], iso3=inp["iso3"],
                            as_of=inp["asOf"])

    risk = {}
    for h in inp["hazards"]:
        for mo in h["months"]:
            risk[mo] = (h["level"], h["note"])
    events = []
    for e in inp["events"]:
        ev = {"name": e["name"], "months": sorted(e["months"]), "tier": e["tier"]}
        if e.get("blurb"):
            ev["blurb"] = e["blurb"]
        events.append(ev)
    swim = None
    if inp["swim"]:
        w = inp["swim"]
        swim = {"body": w["body"], "name": w["name"], "months": sorted(set(w["months"])), "note": w.get("note")}

    months = []
    for i in range(12):
        mo = i + 1
        tier, label = derived_month({"events": events}, mo)
        months.append({
            "mo": MONTHS[i], "moNum": mo,
            "high": None, "low": None, "hum": None, "rain": None, "pm25": None,  # filled by the climate pass
            "airCat": None, "airColor": None,
            "risk": risk.get(mo, (0, ""))[0], "riskNote": risk.get(mo, (0, ""))[1],
            "season": inp["season"]["months"][i], "evtTier": tier, "events": label,
            "weather": None, "air": None, "seasonScore": None, "eventScore": None, "qol": None,
            "cost1": cost1[i], "cost2": cost2[i], "value": None, "qolBase": None,
        })

    rec = {
        "name": inp["name"], "country": inp["country"], "region": inp["region"],
        "draw": inp["draw"], "vibe": inp["vibe"], "visa": visa_for(inp),
        "rent": rent, "util": util, "var": var, "solo": solo, "couple": couple,
        "months": months, "safety": safety, "schengen": inp["schengen"],
        "drawDetail": {"narrative": inp["narrative"],
                       "activities": {k: int(inp["activities"][k]) for k in ACTIVITY_ORDER}},
        "events": events, "timezone": inp["timezone"], "media": None,
        "english": {"tier": inp["english"]["tier"], "note": inp["english"]["note"]},
        "swim": swim, "lat": inp["lat"], "lng": inp["lng"],
    }

    # climate/air: exactly what apply_climate_air.build() does for every city
    mini = {"settings": st, "cities": [rec]}
    nd, _ = AP.build(mini, load(P("climate-normals.json")), load(P("air-climatology.json")),
                     load(P("climate-calibrated.json")), load(P("air-calibrated.json")), {"holdbacks": []})
    rec = nd["cities"][0]

    # component scores (rebake_scores.py formulas)
    qw = (st["q_weather"], st["q_safety"], st["q_air"], st["q_season"], st["q_event"])
    for mth in rec["months"]:
        mth["weather"] = round(weather_score(mth, st), 1)
        mth["air"] = round(air_score(mth["pm25"], st), 1)
        mth["seasonScore"] = round(season_score(mth["season"], st))
        mth["eventScore"] = round(event_score(mth["evtTier"], st), 1)
        qb = (qw[0] * mth["weather"] + qw[1] * safety["score"] + qw[2] * mth["air"]
              + qw[3] * mth["seasonScore"] + qw[4] * mth["eventScore"])
        mth["qolBase"] = round(qb, 1)
        mth["qol"] = round(safety["qolFloor"] * qb, 1)
        mth["value"] = round(mth["qol"] / (mth["cost2"] / 1000) ** st["value_cost_exponent"], 2)
    return rec


# ---------------------------------------------------------------- invariants

def snapshot(d, exclude):
    return {c["name"]: rec_hash(c) for c in d["cities"] if c["name"] not in exclude}


def assert_unchanged(before, d_before, d_after, allow):
    after = {c["name"]: c for c in d_after["cities"]}
    old = {c["name"]: c for c in d_before["cities"]}
    bad = []
    for name, h in before.items():
        c = after.get(name)
        if c is None:
            bad.append(f"{name}: removed")
            continue
        if rec_hash(c) == h:
            continue
        if CI.slug(name) in allow:
            o = copy.deepcopy(old[name])
            n = copy.deepcopy(c)
            o.pop("prov", None), n.pop("prov", None)
            for mo_o, mo_n in zip(o["months"], n["months"]):
                for f in CLIMATE_FIELDS:
                    mo_o.pop(f, None), mo_n.pop(f, None)
            if rec_hash(o) == rec_hash(n):
                continue
            bad.append(f"{name}: changed outside climate/air fields")
        else:
            bad.append(f"{name}: record changed")
    for k in ("settings", "months"):
        if json.dumps(d_before[k], sort_keys=True) != json.dumps(d_after[k], sort_keys=True):
            bad.append(f"top-level {k} changed")
    if bad:
        raise SystemExit("pre-existing data changed:\n  " + "\n  ".join(bad[:20]))
    print(f"  invariant: {len(before)} pre-existing city records unchanged"
          + (f" (climate/air allowed to change for: {', '.join(sorted(allow))})" if allow else ""))


def append_ids(slugs):
    src = open(IDS).read()
    have = set(CI.slug(x) for x in __import__("re").findall(r'"([^"]*)"', src[src.index("CITY_IDS_V1 = ["):]))
    add = [s for s in slugs if s not in have]
    if not add:
        return
    n = len(have)
    body_end = src.index("];", src.index("CITY_IDS_V1 = ["))
    lines = "".join(f'  "{s}", // {n + i}\n' for i, s in enumerate(add))
    open(IDS, "w").write(src[:body_end] + lines + src[body_end:])
    print(f"  appended {len(add)} ID(s) to src/lib/cityIds.v1.js: {', '.join(add)}")


# ---------------------------------------------------------------- checks

def run_checks(build):
    print("\n== checks")
    run([sys.executable, "scripts/rebake_scores.py", "--check"])
    run([sys.executable, "scripts/sanity_check.py"])
    run([sys.executable, "scripts/reconcile_events.py", "--check-derived"])
    run([sys.executable, "scripts/city_inputs.py"], quiet=True)
    if not build:
        print("  (--no-build: skipped npm build, check:ids, check:seeds, tests, build.sh, check:seo)")
        return
    run(["npm", "run", "build"], quiet=True)
    for script in ("check:ids", "check:seeds", "test:schengen", "test:daycount"):
        run(["npm", "run", script])
    run(["bash", "scripts/build.sh"], quiet=True)
    run(["npm", "run", "check:seo"])
    sitemap = open(os.path.join(ROOT, "dist", "sitemap.xml")).read()
    missing = []
    for s in CI.input_slugs():
        d = load(DATA)
        if not any(CI.slug(c["name"]) == s for c in d["cities"]):
            continue  # pending city, not in the catalog
        if not os.path.exists(os.path.join(ROOT, "dist", "city", s, "index.html")) or f"/city/{s}/" not in sitemap:
            missing.append(s)
    if missing:
        raise SystemExit(f"static page or sitemap entry missing for: {missing}")
    print("  static pages + sitemap cover every managed city")


# ---------------------------------------------------------------- main

def bake(slugs, offline, build, allow):
    d0 = load(DATA)
    names = {c["name"] for c in d0["cities"]}
    inputs = {}
    for s in slugs:
        errs = CI.validate(s, catalog_names=names)
        if errs:
            raise SystemExit(f"{s}: input invalid:\n  " + "\n  ".join(errs))
        inputs[s] = CI.load_input(s)
        clash = [c for c in d0["cities"] if CI.slug(c["name"]) == s and c["name"] != inputs[s]["name"]]
        if clash:
            raise SystemExit(f"{s}: slug collides with existing city {clash[0]['name']!r}")
    managed = {v["name"] for v in inputs.values()}
    before = snapshot(d0, exclude=managed)

    print(f"== climate/air chain for {', '.join(slugs)}")
    climate_air_chain(slugs, offline)

    shipped, pending = [], {}
    d = load(DATA)
    for s in slugs:
        inp = inputs[s]
        holds = holds_for(s, inp)
        if holds:
            pending[s] = holds
            if any(c["name"] == inp["name"] for c in d["cities"]):
                raise SystemExit(f"{s} is in the catalog but now has hold-backs {holds}; fix or remove it by hand")
            continue
        rec = compose(inp, d)
        idx = next((i for i, c in enumerate(d["cities"]) if c["name"] == inp["name"]), None)
        if idx is None:
            d["cities"].append(rec)
        else:
            d["cities"][idx] = rec
        shipped.append(s)
    write_data(d)

    print("\n== global idempotent passes")
    run([sys.executable, "scripts/seed_holdbacks.py"])
    run([sys.executable, "scripts/apply_climate_air.py", "--write"])
    d1 = load(DATA)
    for s in shipped:   # the all-city pipeline must reproduce the composed record exactly
        a = next(c for c in d["cities"] if CI.slug(c["name"]) == s)
        b = next(c for c in d1["cities"] if CI.slug(c["name"]) == s)
        if rec_hash(a) != rec_hash(b):
            raise SystemExit(f"{s}: the all-city climate/air pass changed the composed record — investigate")
    assert_unchanged(before, d0, d1, allow)
    append_ids(shipped)

    for s, hs in pending.items():
        print(f"\nPENDING {s} (not added): " + "; ".join(f"{h['metric']} {h['months']}: {h['rule']} — {h['reason']}"
                                                       for h in hs))
    if shipped:
        print(f"\nbaked: {', '.join(shipped)}")
    run_checks(build)
    return 2 if pending else 0


def check_only(build):
    d = load(DATA)
    names = {c["name"] for c in d["cities"]}
    bad = 0
    for s in CI.input_slugs():
        errs = CI.validate(s, catalog_names=names)
        inp = CI.load_input(s)
        cur = next((c for c in d["cities"] if c["name"] == inp["name"]), None)
        if errs:
            print(f"ERR {s}: " + "; ".join(errs))
            bad += 1
        elif cur is None:
            print(f"--  {s}: not in the catalog (pending)")
        elif rec_hash(compose(inp, d)) != rec_hash(cur):
            print(f"ERR {s}: catalog record differs from what its inputs produce — run add_city.py {s}")
            bad += 1
        else:
            print(f"OK  {s}")
    if check_derived(d):
        print("ERR event calendar drift")
        bad += 1
    if bad:
        raise SystemExit(f"{bad} problem(s)")
    run_checks(build)
    return 0


def main():
    args = sys.argv[1:]
    offline = "--offline" in args
    build = "--no-build" not in args
    allow = set()
    if "--allow" in args:
        allow = set(args[args.index("--allow") + 1].split(","))
    if "--check" in args:
        sys.exit(check_only(build))
    if "--all" in args:
        slugs = CI.input_slugs()
    else:
        skip = {args[args.index("--allow") + 1]} if "--allow" in args else set()
        slugs = [a for a in args if not a.startswith("--") and a not in skip]
        unknown = [s for s in slugs if s not in CI.input_slugs()]
        if unknown:
            raise SystemExit(f"no data/cities/<slug>.json for: {unknown}")
    if not slugs:
        raise SystemExit(__doc__)
    sys.exit(bake(slugs, offline, build, allow))


if __name__ == "__main__":
    main()
