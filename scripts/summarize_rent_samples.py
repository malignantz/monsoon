#!/usr/bin/env python3
"""Compute the per-market rent summary in data/rent-samples/<slug>.json from its listings.

  python3 scripts/summarize_rent_samples.py            # rewrite usd + summaries in every file
  python3 scripts/summarize_rent_samples.py lisbon     # one city
  python3 scripts/summarize_rent_samples.py --check    # fail if any stored value differs

Deterministic rules (also stated in data/rent-samples/_schema.json):
  usd        = round(priceLocal / fx[currency].perUSD, 2); USD prices pass through.
  exclusions = listings with a manual `exclude` reason (duplicate, wrong type, ...)
               are dropped first; then, among the rest, any usd below
               Q1 - 1.5*IQR or above Q3 + 1.5*IQR is dropped as an outlier.
               Outlier fences are computed once (no repeated trimming).
  percentiles: linear interpolation between closest ranks (the "inclusive" method,
               same as numpy's default and Excel PERCENTILE.INC).
Stdlib only. Never touches data/cost-evidence or data/travel-data.json.
"""
import json, os, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "data", "rent-samples")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def pct(xs, p):
    xs = sorted(xs)
    if not xs:
        return None
    k = (len(xs) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def r2(x):
    return None if x is None else round(x + 0.0, 2)


def to_usd(l, fx):
    cur = l["currency"]
    if cur == "USD":
        return round(float(l["priceLocal"]), 2)
    return round(l["priceLocal"] / fx[cur]["perUSD"], 2)


def summarize_market(m, fx, stored_rent):
    for l in m["listings"]:
        l["usd"] = to_usd(l, fx)
    manual = [l for l in m["listings"] if l.get("exclude")]
    kept = [l for l in m["listings"] if not l.get("exclude")]
    excl = [{"id": l["id"], "reason": l["exclude"]} for l in manual]
    if len(kept) >= 4:
        q1, q3 = pct([l["usd"] for l in kept], .25), pct([l["usd"] for l in kept], .75)
        lo, hi = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
        out = [l for l in kept if l["usd"] < lo or l["usd"] > hi]
        for l in out:
            excl.append({"id": l["id"], "reason": f"outlier: usd {l['usd']} outside 1.5xIQR fences "
                                                  f"[{round(lo)}, {round(hi)}]"})
        kept = [l for l in kept if l not in out]
    xs = [l["usd"] for l in kept]
    med = pct(xs, .5)
    s = {"listingsSeen": len(m["listings"]), "n": len(xs),
         "medianUsd": r2(med), "p25Usd": r2(pct(xs, .25)), "p75Usd": r2(pct(xs, .75)),
         "minUsd": r2(min(xs)) if xs else None, "maxUsd": r2(max(xs)) if xs else None,
         "storedRentUsd": stored_rent,
         "diffVsStoredPct": (round(100 * (med - stored_rent) / stored_rent, 1)
                             if med is not None and stored_rent else None),
         "exclusions": excl}
    return s


def process(path, write):
    d = json.load(open(path))
    before = json.dumps(d, sort_keys=True)
    for name, m in d["markets"].items():
        m["summary"] = summarize_market(m, d["fx"], d.get("storedRentUsd"))
    after = json.dumps(d, sort_keys=True)
    if write and after != before:
        json.dump(d, open(path, "w"), indent=1, ensure_ascii=False)
        open(path, "a").write("\n")
    return after == before, d


def check_snapshots(d, slug):
    """Every listing must reference a snapshot record whose excerpt holds its quote."""
    from collect_evidence import snapshot_supports
    errs = []
    for name, m in d["markets"].items():
        for l in m["listings"]:
            if not l.get("snapshot") or not l.get("quote"):
                errs.append(f"{slug} {name} {l['id']}: missing snapshot or quote")
            elif not snapshot_supports(l["snapshot"], l["quote"]):
                errs.append(f"{slug} {name} {l['id']}: snapshot {l['snapshot']} does not contain its quote")
    return errs


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check = "--check" in sys.argv
    files = [p for p in sorted(glob.glob(os.path.join(DIR, "*.json")))
             if not os.path.basename(p).startswith("_")
             and (not args or os.path.basename(p)[:-5] in args)]
    bad = []
    for p in files:
        slug = os.path.basename(p)[:-5]
        same, d = process(p, write=not check)
        if check and not same:
            bad.append(f"{slug}: stored usd/summary differ from listings; run scripts/summarize_rent_samples.py {slug}")
        bad += check_snapshots(d, slug)
        if not check:
            for name, m in d["markets"].items():
                s = m["summary"]
                print(f"{slug:14} {name:22} n={s['n']:>3}/{s['listingsSeen']:<3} median={s['medianUsd']} "
                      f"IQR=[{s['p25Usd']}, {s['p75Usd']}] stored={s['storedRentUsd']} diff={s['diffVsStoredPct']}%")
    for b in bad:
        print("  " + b)
    if check:
        print(f"rent samples: {len(files)} files, {len(bad)} problems")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
