#!/usr/bin/env python3
"""Build city cost fields in data/travel-data.json from the cost-evidence store.

The evidence store (data/cost-evidence/<slug>.json, gitignored — see _schema.json)
is the source of truth for cost. Each file holds itemized, sourced components for
ONE persona: a solo nomad living mid-range. This script turns those into the
fields the app reads: rent, util, var, solo, couple, and monthly cost1/cost2.

  solo   = sum of component.usd
  couple = sum of component.usd * PARTY_MULT[component.party]
  monthly cost1/cost2:
     - if the file carries monthlyOverride, use it verbatim (legacy-seed cities,
       so this build is byte-identical to the old hand-seeded data);
     - else compute from components, applying accomSeasonality to RENT ONLY.

Modes:
  python3 scripts/build_costs.py migrate   # one-time: seed legacy evidence files
                                            # from the current travel-data.json
  python3 scripts/build_costs.py check      # dry-run diff vs current data
  python3 scripts/build_costs.py build      # write cost fields into travel-data.json

After `build`, run rebake_scores.py --write (refreshes `value`) then sanity_check.py.
"""
import json, os, re, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")
STORE = os.path.join(ROOT, "data", "cost-evidence")

PARTY_MULT = {"shared": 1.15, "perPerson": 1.90, "perPersonDiscounted": 1.60}

# How the opaque legacy `var` bucket is split into itemized components on
# migration. Solo-nomad-midrange shares. Marked low-confidence legacy-seed.
VAR_SPLIT = {
    "groceries": ("perPerson", 0.25),
    "diningOut": ("perPerson", 0.30),
    "transit":   ("perPerson", 0.10),
    "coworking": ("perPersonDiscounted", 0.20),
    "simData":   ("perPerson", 0.05),
    "misc":      ("perPersonDiscounted", 0.10),
}
COMPONENT_ORDER = ["rent", "utilities", "groceries", "diningOut",
                   "transit", "coworking", "simData", "misc"]


def slug(name):
    s = name.lower()
    s = (s.replace("ł", "l").replace("ø", "o").replace("å", "a")
          .replace("ä", "a").replace("ö", "o").replace("ü", "u")
          .replace("é", "e").replace("è", "e").replace("ñ", "n")
          .replace("ç", "c").replace("ã", "a").replace("á", "a"))
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def store_files():
    return [p for p in glob.glob(os.path.join(STORE, "*.json"))
            if not os.path.basename(p).startswith("_")]


def load_store():
    by_city = {}
    for p in store_files():
        ev = json.load(open(p))
        by_city[ev["city"]] = ev
    return by_city


def components_totals(comps):
    solo = sum(c["usd"] for c in comps.values())
    couple = sum(c["usd"] * PARTY_MULT[c["party"]] for c in comps.values())
    return round(solo), round(couple)


def monthly_from_components(comps, season):
    """cost1/cost2 with accomSeasonality applied to rent only."""
    rent = comps["rent"]["usd"]
    rent_couple = rent * PARTY_MULT[comps["rent"]["party"]]
    solo, couple = components_totals(comps)
    base1, base2 = solo - rent, couple - rent_couple
    cost1 = [round(base1 + rent * season[m]) for m in range(12)]
    cost2 = [round(base2 + rent_couple * season[m]) for m in range(12)]
    return cost1, cost2


def derive(ev):
    """Return (rent, util, var, solo, couple, cost1[12], cost2[12]) for one city."""
    comps = {k: v for k, v in ev["components"].items() if not k.startswith("_")}
    solo, couple = components_totals(comps)
    tot = ev.get("totalsOverride")
    if tot:  # legacy-seed: pin displayed solo/couple so migration is byte-identical
        solo, couple = tot["solo"], tot["couple"]
    rent = round(comps["rent"]["usd"])
    util = round(comps["utilities"]["usd"])
    var = solo - rent - util
    ov = ev.get("monthlyOverride")
    if ov and ov.get("cost1") and ov.get("cost2"):
        cost1, cost2 = ov["cost1"], ov["cost2"]
    else:
        season = ev.get("accomSeasonality", {}).get("values", [1.0] * 12)
        cost1, cost2 = monthly_from_components(comps, season)
    return rent, util, var, solo, couple, cost1, cost2


# ---- migrate -------------------------------------------------------------

def migrate():
    d = json.load(open(DATA))
    os.makedirs(STORE, exist_ok=True)
    existing = load_store()
    made = 0
    for c in d["cities"]:
        if c["name"] in existing:
            continue
        rent = c.get("rent", 0) or 0
        util = c.get("util", 0) or 0
        var = c.get("var", 0) or 0
        solo = c.get("solo", rent + util + var)
        cost1 = [m["cost1"] for m in c["months"]]
        cost2 = [m["cost2"] for m in c["months"]]
        # back out accommodation seasonality from the legacy whole-total swing,
        # attributed to rent (unused while monthlyOverride is present, but kept
        # so a future researcher sees the implied curve).
        season = [round(1 + (cost1[i] - solo) / rent, 3) if rent else 1.0
                  for i in range(12)]
        comps = {
            "rent": _leg(rent, "shared", "furnished 1BR in a nomad area"),
            "utilities": _leg(util, "shared", "electric + water + home internet"),
        }
        for name, (party, frac) in VAR_SPLIT.items():
            comps[name] = _leg(round(var * frac), party, f"legacy split ({int(frac*100)}% of var bucket)")
        ev = {
            "city": c["name"],
            "anchor": "solo-nomad-midrange",
            "currency": "USD",
            "asOf": "2026-06",
            "provenance": "legacy-seed",
            "components": {k: comps[k] for k in COMPONENT_ORDER},
            "accomSeasonality": {"values": season},
            "totalsOverride": {"solo": solo, "couple": c.get("couple", solo)},
            "monthlyOverride": {"cost1": cost1, "cost2": cost2},
            "evidence": [],
        }
        json.dump(ev, open(os.path.join(STORE, slug(c["name"]) + ".json"), "w"),
                  indent=2, ensure_ascii=False)
        made += 1
    print(f"migrated {made} city evidence files into {os.path.relpath(STORE, ROOT)}/"
          f" ({len(existing)} already existed)")


def _leg(usd, party, note):
    return {"usd": usd, "party": party, "source": "legacy seed (unsourced)",
            "asOf": "2026-06", "confidence": "low", "note": note}


# ---- check / build -------------------------------------------------------

def apply(write):
    d = json.load(open(DATA))
    store = load_store()
    missing, changed = [], 0
    for c in d["cities"]:
        ev = store.get(c["name"])
        if not ev:
            missing.append(c["name"]); continue
        rent, util, var, solo, couple, cost1, cost2 = derive(ev)
        before = (c.get("rent"), c.get("util"), c.get("var"), c.get("solo"),
                  c.get("couple"), [m["cost1"] for m in c["months"]],
                  [m["cost2"] for m in c["months"]])
        after = (rent, util, var, solo, couple, cost1, cost2)
        if before != after:
            changed += 1
            if not write and changed <= 6:
                print(f"  ~ {c['name']}: solo {before[3]}->{solo} couple {before[4]}->{couple}"
                      f" cost2[Jun] {before[6][5]}->{cost2[5]}")
        if write:
            c["rent"], c["util"], c["var"] = rent, util, var
            c["solo"], c["couple"] = solo, couple
            for i, m in enumerate(c["months"]):
                m["cost1"], m["cost2"] = cost1[i], cost2[i]
    if missing:
        print(f"WARNING {len(missing)} cities have no evidence file: {missing[:5]}...")
    if write:
        json.dump(d, open(DATA, "w"), indent=2, ensure_ascii=False)
        print(f"wrote cost fields for {len(d['cities'])-len(missing)} cities "
              f"({changed} changed) -> {os.path.relpath(DATA, ROOT)}")
        print("next: python3 scripts/rebake_scores.py --write && python3 scripts/sanity_check.py")
    else:
        print(f"check only — {changed} cities would change, {len(missing)} missing")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    if mode == "migrate":
        migrate()
    elif mode == "check":
        apply(write=False)
    elif mode == "build":
        apply(write=True)
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
