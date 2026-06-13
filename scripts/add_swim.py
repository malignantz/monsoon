#!/usr/bin/env python3
"""Tag each city with `swim` — seasonally swimmable open water (display-only).

Reads data/swim-inputs.json (hand-authored: body sea|lake|river|cenotes, name,
months 1-12, optional note/review) and writes `city.swim` (object or null) into
data/travel-data.json. Never touches any score — this is a badge/filter layer,
like schengen and timezone.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")
INPUTS = os.path.join(ROOT, "data", "swim-inputs.json")

BODIES = {"sea", "lake", "river", "cenotes"}

d = json.load(open(DATA))
inputs = json.load(open(INPUTS))["cities"]

unknown = set(inputs) - {c["name"] for c in d["cities"]}
if unknown:
    raise SystemExit(f"swim-inputs cities not in catalog: {sorted(unknown)}")

n = review = 0
for c in d["cities"]:
    m = inputs.get(c["name"])
    if m is None:
        c["swim"] = None
        continue
    assert m["body"] in BODIES, f"{c['name']}: bad body {m['body']}"
    months = sorted(set(m["months"]))
    assert months and all(1 <= x <= 12 for x in months), f"{c['name']}: bad months"
    c["swim"] = {"body": m["body"], "name": m["name"], "months": months,
                 "note": m.get("note")}
    n += 1
    review += bool(m.get("review"))

json.dump(d, open(DATA, "w"), indent=2, ensure_ascii=False)
print(f"tagged {len(d['cities'])} cities — {n} with swimmable water "
      f"({review} flagged review in inputs), {len(d['cities'])-n} without")
