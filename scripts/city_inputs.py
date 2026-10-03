#!/usr/bin/env python3
"""Per-city input files (data/cities/<slug>.json) — loading, slugs, validation.

The add-a-city pipeline (scripts/add_city.py) keeps everything a human/agent
authors for a city in one file, validated against data/cities/_schema.json.
Cities that have such a file are "managed": the legacy all-city scripts with
in-script lookup tables (add_swim.py, safety_v3.py, build_city_content.py, ...)
skip them so they can never clobber a managed city's record.

slug() is THE slug convention for the whole repo, identical to
scripts/check-city-ids.mjs and src/lib/data.svelte.js (NFD-decompose, strip
combining marks, non-alnum -> '-'). It is also openmeteo_common.city_slug.

Validation uses a small built-in JSON-Schema subset (type, enum, const,
required, properties, additionalProperties, items, min/maxItems, uniqueItems,
minimum/maximum, pattern, oneOf, $ref) so there is no external dependency.

    python3 scripts/city_inputs.py            # validate every data/cities/*.json
    python3 scripts/city_inputs.py agadir     # validate one
"""
import json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CITIES_DIR = os.path.join(ROOT, "data", "cities")
SCHEMA = os.path.join(CITIES_DIR, "_schema.json")
COST_DIR = os.path.join(ROOT, "data", "cost-evidence")


def slug(name):
    s = unicodedata.normalize("NFD", name.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def input_path(s):
    return os.path.join(CITIES_DIR, s + ".json")


def input_slugs():
    if not os.path.isdir(CITIES_DIR):
        return []
    return sorted(f[:-5] for f in os.listdir(CITIES_DIR) if f.endswith(".json") and not f.startswith("_"))


def load_input(s):
    return json.load(open(input_path(s)))


def load_inputs():
    """{slug: input} for every data/cities/<slug>.json."""
    return {s: load_input(s) for s in input_slugs()}


def managed_names():
    """Catalog names whose record is owned by add_city.py (legacy scripts skip these)."""
    return {v["name"] for v in load_inputs().values()}


# ---------------- minimal JSON-Schema validator ----------------

_TYPES = {"object": dict, "array": list, "string": str, "boolean": bool, "null": type(None)}


def _is_type(v, t):
    if t == "integer":
        return isinstance(v, int) and not isinstance(v, bool)
    if t == "number":
        return isinstance(v, (int, float)) and not isinstance(v, bool)
    return isinstance(v, _TYPES[t])


def _check(v, sch, root, path, errs):
    if "$ref" in sch:
        ref = sch["$ref"]
        assert ref.startswith("#/$defs/"), ref
        sch = root["$defs"][ref.split("/")[-1]]
    if "oneOf" in sch:
        ok = []
        for sub in sch["oneOf"]:
            e = []
            _check(v, sub, root, path, e)
            ok.append(e)
        if sum(1 for e in ok if not e) != 1:
            best = min(ok, key=len)
            errs.extend(best or [f"{path}: matches more than one alternative"])
        return
    t = sch.get("type")
    if t is not None:
        ts = t if isinstance(t, list) else [t]
        if not any(_is_type(v, x) for x in ts):
            errs.append(f"{path}: expected {t}, got {type(v).__name__}")
            return
    if "const" in sch and v != sch["const"]:
        errs.append(f"{path}: must be {sch['const']!r}")
    if "enum" in sch and v not in sch["enum"]:
        errs.append(f"{path}: {v!r} not in {sch['enum']}")
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if "minimum" in sch and v < sch["minimum"]:
            errs.append(f"{path}: {v} < {sch['minimum']}")
        if "maximum" in sch and v > sch["maximum"]:
            errs.append(f"{path}: {v} > {sch['maximum']}")
    if isinstance(v, str) and "pattern" in sch and not re.search(sch["pattern"], v):
        errs.append(f"{path}: {v!r} does not match {sch['pattern']}")
    if isinstance(v, list):
        if "minItems" in sch and len(v) < sch["minItems"]:
            errs.append(f"{path}: fewer than {sch['minItems']} items")
        if "maxItems" in sch and len(v) > sch["maxItems"]:
            errs.append(f"{path}: more than {sch['maxItems']} items")
        if sch.get("uniqueItems") and len({json.dumps(x, sort_keys=True) for x in v}) != len(v):
            errs.append(f"{path}: items not unique")
        if "items" in sch:
            for i, x in enumerate(v):
                _check(x, sch["items"], root, f"{path}[{i}]", errs)
    if isinstance(v, dict):
        for k in sch.get("required", []):
            if k not in v:
                errs.append(f"{path}: missing required '{k}'")
        props = sch.get("properties", {})
        if sch.get("additionalProperties") is False:
            for k in v:
                if k not in props:
                    errs.append(f"{path}: unknown field '{k}'")
        for k, sub in props.items():
            if k in v:
                _check(v[k], sub, root, f"{path}.{k}", errs)


def validate(s, rec=None, catalog_names=None):
    """Return a list of error strings (empty = valid)."""
    schema = json.load(open(SCHEMA))
    rec = load_input(s) if rec is None else rec
    errs = []
    _check(rec, schema, schema, s, errs)
    if errs:
        return errs
    # semantic checks the schema cannot express
    if slug(rec["name"]) != s:
        errs.append(f"{s}: file name must be the slug of name ({slug(rec['name'])!r})")
    seen = {}
    for h in rec["hazards"]:
        for m in h["months"]:
            if m in seen:
                errs.append(f"{s}.hazards: month {m} flagged twice")
            seen[m] = h
    if not os.path.exists(os.path.join(COST_DIR, s + ".json")):
        errs.append(f"{s}: no cost evidence at data/cost-evidence/{s}.json")
    else:
        ev = json.load(open(os.path.join(COST_DIR, s + ".json")))
        if ev.get("city") != rec["name"]:
            errs.append(f"{s}: cost-evidence 'city' is {ev.get('city')!r}, expected {rec['name']!r}")
        if ev.get("monthlyOverride") or ev.get("totalsOverride"):
            errs.append(f"{s}: cost evidence for a new city must not carry monthlyOverride/totalsOverride")
        need = ["rent", "utilities", "groceries", "diningOut", "transit", "coworking", "simData", "misc"]
        comps = ev.get("components", {})
        for k in need:
            c = comps.get(k)
            if not c:
                errs.append(f"{s}: cost component '{k}' missing")
                continue
            for f in ("usd", "party", "source", "asOf", "confidence"):
                if c.get(f) in (None, ""):
                    errs.append(f"{s}: cost component '{k}' has no {f}")
            if c.get("confidence") not in ("low", "med", "high"):
                errs.append(f"{s}: cost component '{k}' confidence must be low|med|high")
        if not ev.get("evidence"):
            errs.append(f"{s}: cost evidence has no evidence[] receipts")
        if len(ev.get("accomSeasonality", {}).get("values", [])) != 12:
            errs.append(f"{s}: accomSeasonality.values must have 12 entries")
    if catalog_names is not None:
        for n in rec["safety"]["calibratedAgainst"]:
            if n not in catalog_names:
                errs.append(f"{s}.safety.calibratedAgainst: {n!r} is not a catalog city")
    return errs


def main():
    args = sys.argv[1:]
    slugs = args or input_slugs()
    data = json.load(open(os.path.join(ROOT, "data", "travel-data.json")))
    names = {c["name"] for c in data["cities"]}
    bad = 0
    for s in slugs:
        errs = validate(s, catalog_names=names)
        print(f"{'OK ' if not errs else 'ERR'} {s}")
        for e in errs:
            print("    " + e)
        bad += bool(errs)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
