#!/usr/bin/env python3
"""Reconcile the scored event calendar with the visible event list. Never touches a score.

Two event records exist per city and used to drift apart:
  * months[i].evtTier + months[i].events (data/travel-data.json) drive eventScore;
  * city.events (data/city-content.json, baked by build_city_content.py) is the
    structured list the city sheet shows as "The calendar worth planning around".

So a month could score Events 100 for an event the sheet never lists (Yerevan in
October: "Yerevan city birthday / Erebuni-Yerevan"). This script checks every
month with evtTier >= 2 for a visible entry that names the same event in that month.

  python3 scripts/reconcile_events.py            # report only (default)
  python3 scripts/reconcile_events.py --write    # add missing entries + rebake

--write adds one structured entry per missing event to data/city-content.json:
  {name, months, tier, from: "score-calendar"}
name is the month's `events` string verbatim, months are every month that string
scores in, tier is the highest evtTier among them. No blurb is written: the
calendar renders entries without one. `from` marks entries that came from the
scoring calendar rather than the reviewed content pass. It then reruns
build_city_content.py --only events so city.events in travel-data.json picks them
up without re-baking any other field.

Not fixed automatically (written to tmp/events-mismatch.md for the owner):
  * month conflicts: the scored month names an event the visible list carries in
    a different month (e.g. Zurich Street Parade scored in Jul, listed in Aug).
    One of the two months is wrong; adding the scored month to the visible entry
    could spread the error, and changing evtTier would change a score.
  * a visible tier-3 "major" entry in a month whose evtTier is below 3.

Matching is deliberately simple: normalised names, a word-boundary substring
test, then shared distinctive words (city-name words and generic words such as
"festival", "season" or "wine" do not count). Known spelling variants live in
ALIASES. Review the report after any data change; it is cheap to rerun.
"""
import json
import os
import re
import subprocess
import sys
import unicodedata
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "travel-data.json")
CONTENT = os.path.join(ROOT, "data", "city-content.json")
REPORT = os.path.join(ROOT, "tmp", "events-mismatch.md")
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Spelling / language variants folded together before comparing.
ALIASES = {
    "carnival": "carnaval",
    "carnevale": "carnaval",
    "muertos": "dead",
    "independencia": "independence",
    "christkindlmarkt": "christmas market",
    "markets": "market",
    "chinese": "lunar",
}

# Never evidence of "same event" on their own.
STOP = {
    "the", "of", "and", "de", "del", "la", "las", "los", "el", "le", "les", "da", "do", "dos",
    "di", "der", "die", "das", "en", "y", "e", "a", "in", "on", "at", "to", "nearby", "late",
    "early", "mid", "opens", "finale", "build", "up", "events", "event", "celebrations",
    "festival", "festivals", "fest", "fiesta", "fiestas", "feria", "fair", "season", "day", "days",
    "week", "nights", "night", "city", "international", "national", "new", "year", "world",
    "famous", "summer", "winter", "spring", "autumn", "san", "santa", "santo", "sao", "st", "saint",
    "festa", "festas", "festes", "fete", "em",
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
}
# Extra words that are fine inside one month but too generic to tie two different
# months together ("New Wine Festival" in May is not "Rtveli wine harvest" in Sep).
CROSS_MONTH_GENERIC = {
    "wine", "harvest", "lantern", "lanterns", "film", "music", "jazz", "food", "market",
    "christmas", "pride", "easter", "semana", "holy", "lights", "beach", "high", "open", "air",
    "lake", "surf", "ski", "concert", "concerts", "parade", "dead", "lunar", "independence",
}


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return " ".join(ALIASES.get(w, w) for w in s.split())


def strip_paren(s):
    return re.sub(r"\s*\([^)]*\)", "", s).strip()


def words(s, city_words, extra=()):
    return {w for w in norm(s).split()
            if len(w) >= 3 and w not in STOP and w not in city_words and w not in extra}


def contains(a, b):
    """Word-boundary substring either way, on normalised names without parentheticals."""
    na, nb = norm(strip_paren(a)), norm(strip_paren(b))
    if not na or not nb:
        return False
    pa, pb = f" {na} ", f" {nb} "
    return pa in pb or pb in pa


def same_event(a, b, city_words, cross_month):
    if contains(a, b):
        return True
    extra = CROSS_MONTH_GENERIC if cross_month else ()
    return bool(words(a, city_words, extra) & words(b, city_words, extra))


def city_words_for(city):
    return set(norm(city["name"]).split()) | set(norm(city["country"]).split())


def analyse(d, content):
    """Return (additions, conflicts, majors, matched_count, checked_count)."""
    additions = OrderedDict()   # city -> list of new entries
    conflicts, majors = [], []
    matched = checked = 0
    for c in d["cities"]:
        rec = content.get(c["name"]) or {}
        visible = list(rec.get("events") or [])
        cw = city_words_for(c)
        missing = OrderedDict()  # group key -> entry
        for i, m in enumerate(c["months"]):
            tier = m.get("evtTier") or 0
            label = (m.get("events") or "").strip()
            if tier < 2:
                continue
            checked += 1
            mo = i + 1
            if not label:
                conflicts.append((c["name"], mo, tier, "(no event named)", "evtTier >= 2 but the month's events string is empty"))
                continue
            in_month = [e for e in visible if mo in (e.get("months") or [])]
            if any(same_event(label, e["name"], cw, False) for e in in_month):
                matched += 1
                continue
            elsewhere = [e for e in visible if mo not in (e.get("months") or [])
                         and same_event(label, e["name"], cw, True)]
            if elsewhere:
                where = "; ".join(f"{e['name']} ({'/'.join(MONTHS[x - 1] for x in e['months'])})" for e in elsewhere)
                conflicts.append((c["name"], mo, tier, label, f"visible list has {where}"))
                continue
            key = norm(strip_paren(label))
            entry = missing.get(key)
            if entry is None:
                missing[key] = {"name": label, "months": [mo], "tier": tier, "from": "score-calendar"}
            else:
                entry["months"].append(mo)
                entry["tier"] = max(entry["tier"], tier)
        if missing:
            additions[c["name"]] = list(missing.values())

        # Visible tier-3 entries in months the score does not treat as major.
        for e in visible:
            if (e.get("tier") or 0) < 3:
                continue
            for mo in e.get("months") or []:
                t = c["months"][mo - 1].get("evtTier") or 0
                if t < 3:
                    majors.append((c["name"], e["name"], mo, t, c["months"][mo - 1].get("events") or ""))
    return additions, conflicts, majors, matched, checked


def write_report(additions, conflicts, majors, matched, checked, wrote):
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    n_add = sum(len(v) for v in additions.values())
    L = ["# Event calendar vs visible list — mismatches", "",
         "Generated by `python3 scripts/reconcile_events.py`. No score was changed.", "",
         f"- Months with evtTier >= 2 checked: {checked}",
         f"- Already matched by a visible entry in that month: {matched}",
         f"- Missing events {'added' if wrote else 'to add (run with --write)'}: {n_add} entries "
         f"covering {sum(len(e['months']) for v in additions.values() for e in v)} months",
         f"- Month conflicts left for review: {len(conflicts)}",
         f"- Visible \"major\" entries in months scored below tier 3: {len(majors)}", ""]
    L += ["## Month conflicts (scored month vs listed month)", "",
          "The scored month names an event the sheet lists in a different month. One of the two is",
          "wrong. Fix the visible months in data/city-content.json, or the month's evtTier/events in",
          "data/travel-data.json (that changes eventScore — rerun rebake_scores.py).", "",
          "| City | Scored month | evtTier | Scored as | Visible list |", "|---|---|---|---|---|"]
    for city, mo, tier, label, note in conflicts:
        L.append(f"| {city} | {MONTHS[mo - 1]} | {tier} | {label} | {note} |")
    L += ["", "## Visible tier-3 \"major\" entries in months scored below tier 3", "",
          "The sheet badges these as major, but the month's Events score does not count them as",
          "major. Either the visible tier is generous or the score calendar misses the event.", "",
          "| City | Visible entry | Month | evtTier | Month scored as |", "|---|---|---|---|---|"]
    for city, name, mo, t, label in majors:
        L.append(f"| {city} | {name} | {MONTHS[mo - 1]} | {t} | {label or '—'} |")
    L += ["", f"## Entries {'added' if wrote else 'proposed'} from the score calendar", "",
          "Name is the month's `events` string verbatim; no description was written.", ""]
    for city, entries in additions.items():
        for e in entries:
            L.append(f"- {city}: {e['name']} — {'/'.join(MONTHS[x - 1] for x in e['months'])}, tier {e['tier']}")
    open(REPORT, "w").write("\n".join(L) + "\n")


def main():
    write = "--write" in sys.argv[1:]
    d = json.load(open(DATA))
    content = json.load(open(CONTENT))
    additions, conflicts, majors, matched, checked = analyse(d, content)
    n_add = sum(len(v) for v in additions.values())

    print(f"checked {checked} months with evtTier >= 2: {matched} matched, "
          f"{n_add} missing events ({sum(len(e['months']) for v in additions.values() for e in v)} months), "
          f"{len(conflicts)} month conflicts, {len(majors)} visible majors scored below tier 3")

    if write and additions:
        for city, entries in additions.items():
            rec = content.setdefault(city, {})
            rec.setdefault("events", []).extend(entries)
        with open(CONTENT, "w") as f:
            f.write(json.dumps(content, indent=1, ensure_ascii=False) + "\n")
        print(f"added {n_add} entries to {os.path.relpath(CONTENT, ROOT)}; rebaking city content")
        subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "build_city_content.py"),
                        "--only", "events"], check=True)

    write_report(additions, conflicts, majors, matched, checked, write)
    print(f"report -> {os.path.relpath(REPORT, ROOT)}")


if __name__ == "__main__":
    main()
