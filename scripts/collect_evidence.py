#!/usr/bin/env python3
"""Snapshot a page at collection time, so a number enters the evidence store only
with proof that the page said it on that date.

  scripts/collect_evidence.py snapshot --url URL --quote "..." [--quote "..."]
        --city SLUG --component rent [--browser] [--wayback] [--archive-dir DIR]

It fetches the page (plain HTTP, or headless Chrome with --browser for pages that
need JavaScript), and REFUSES with exit code 1 unless every --quote is found by the
strict matcher of scripts/verify_evidence.py (exact match after normalising case,
accents, curly quotes and number formats; quotes shorter than 25 letters are
refused as too easy to match by luck). On success it writes:

  - the raw page body, gzipped, OUTSIDE git:  <archive-dir>/<sha256>.html.gz
    (default ~/monsoon-evidence-archive, or $MONSOON_EVIDENCE_ARCHIVE)
  - a small JSON record IN the repo:
    data/evidence-snapshots/<city>/<component>-<sha256[:12]>.json
    with url, fetchedAt (UTC), httpStatus, sha256 of the body, and for each quote
    the matched excerpt with ~400 characters of context each side.

Snapshotting the same page body again with new quotes adds them to the record.
Reference the record from an evidence row as "snapshot": "<city>/<file>.json".

--wayback (off by default; use sparingly, never in bulk) asks the Internet
Archive's availability API for a capture within 7 days and, if none exists,
requests one through Save Page Now (at most one request per 10 s, enforced
across runs). The resulting archiveUrl is stored in the record.

  scripts/collect_evidence.py check   # every record's excerpts still contain their quotes
"""
import argparse, datetime as dt, gzip, hashlib, json, os, re, subprocess, sys, time
import unicodedata, urllib.error, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verify_evidence as ve  # noqa: E402  (fetch, text extraction, normalisation, matcher)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNAP_DIR = os.path.join(ROOT, "data", "evidence-snapshots")
DEFAULT_ARCHIVE = os.environ.get("MONSOON_EVIDENCE_ARCHIVE",
                                 os.path.expanduser("~/monsoon-evidence-archive"))
CONTEXT = 400
SPN_GAP = 10.0
COMPONENTS = {"rent", "utilities", "groceries", "diningOut", "transit",
              "coworking", "simData", "misc"}


# ------------------------------------------------------------ text + excerpt
def squash_map(text):
    """Squashed normalised text (as verify_evidence's squash(norm(..))) plus, for
    each squashed character, the index of the original character it came from."""
    out, idx = [], []
    for i, c in enumerate(text):
        c = unicodedata.normalize("NFKC", c)
        c = "".join(ve.QUOTES.get(x, x) for x in c)
        c = unicodedata.normalize("NFKD", c.lower())
        for x in c:
            if unicodedata.combining(x) or not re.match(r"\w", x) or x == "_":
                continue
            out.append(x); idx.append(i)
    return "".join(out), idx


def find_excerpt(quote, text):
    """Return the excerpt of `text` (whitespace collapsed) holding every fragment of
    `quote` in order, with CONTEXT characters each side, or None."""
    text = re.sub(r"\s+", " ", text).strip()
    sq, idx = squash_map(text)
    frs = ve.fragments(quote)
    pos, start, end = 0, None, None
    for f in frs:
        j = sq.find(f, pos)
        if j < 0:
            return None
        if start is None:
            start = idx[j]
        end = idx[j + len(f) - 1] + 1
        pos = j + len(f)
    excerpt = text[max(0, start - CONTEXT): min(len(text), end + CONTEXT)]
    return excerpt if quote_in(quote, excerpt) else None


def quote_in(quote, excerpt):
    return ve.exact_match(quote, ve.squash(ve.norm(excerpt)))


# -------------------------------------------------------------------- fetch
def fetch_http(url):
    r = ve.http_get(url)
    return {"httpStatus": r["http"], "body": r["body"] or b"", "contentType": r["ctype"],
            "finalUrl": r["final"], "error": r["error"], "mode": "http"}


def fetch_browser(url, wait_ms, scrolls):
    ve.LIMITER.wait(ve.dom_key(url))
    cmd = ["node", os.path.join(ROOT, "scripts", "render_page.mjs"), url,
           "--wait", str(wait_ms), "--scroll", str(scrolls)]
    try:
        p = subprocess.run(cmd, capture_output=True, timeout=180)
    except subprocess.TimeoutExpired:
        return {"httpStatus": None, "body": b"", "contentType": "", "finalUrl": url,
                "error": "browser timeout", "mode": "browser"}
    if p.returncode != 0:
        return {"httpStatus": None, "body": b"", "contentType": "", "finalUrl": url,
                "error": "browser: " + p.stderr.decode("utf-8", "replace")[-300:], "mode": "browser"}
    j = json.loads(p.stdout)
    return {"httpStatus": j["status"], "body": j["html"].encode("utf-8"),
            "contentType": "text/html; charset=utf-8", "finalUrl": j["finalUrl"],
            "error": None, "mode": "browser"}


# ------------------------------------------------------------------ wayback
def _spn_wait(archive_dir):
    stamp = os.path.join(archive_dir, ".last-save-page-now")
    try:
        last = float(open(stamp).read().strip())
    except Exception:
        last = 0.0
    gap = time.time() - last
    if gap < SPN_GAP:
        time.sleep(SPN_GAP - gap)
    os.makedirs(archive_dir, exist_ok=True)
    open(stamp, "w").write(str(time.time()))


def wayback_copy(url, archive_dir):
    """-> (archiveUrl or None, note). Availability lookup first, Save Page Now only
    if there is no capture within 7 days."""
    now = dt.datetime.now(dt.timezone.utc)
    api = ("https://archive.org/wayback/available?url=" + urllib.parse.quote(url, safe="")
           + "&timestamp=" + now.strftime("%Y%m%d%H%M%S"))
    try:
        with urllib.request.urlopen(urllib.request.Request(api, headers={"User-Agent": ve.UA}), timeout=30) as r:
            snap = json.loads(r.read()).get("archived_snapshots", {}).get("closest")
    except Exception as e:
        snap = None
    if snap and snap.get("available"):
        ts = dt.datetime.strptime(snap["timestamp"], "%Y%m%d%H%M%S").replace(tzinfo=dt.timezone.utc)
        if abs((now - ts).days) <= 7:
            return snap["url"].replace("http://", "https://", 1), "existing capture within 7 days"
    _spn_wait(archive_dir)
    req = urllib.request.Request("https://web.archive.org/save/" + url, headers={"User-Agent": ve.UA})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            loc = r.headers.get("Content-Location") or ""
            final = r.geturl()
    except urllib.error.HTTPError as e:
        return None, f"Save Page Now HTTP {e.code}"
    except Exception as e:
        return None, f"Save Page Now failed: {type(e).__name__}"
    m = re.search(r"/web/\d{14}/", loc or final)
    if m:
        return ("https://web.archive.org" + loc) if loc.startswith("/web/") else final, "saved via Save Page Now"
    return None, "Save Page Now answered without a capture URL"


# ---------------------------------------------------------------- snapshot
def snapshot(args):
    if args.component not in COMPONENTS:
        sys.exit(f"--component must be one of {sorted(COMPONENTS)}")
    if not re.fullmatch(r"[a-z0-9-]+", args.city):
        sys.exit("--city must be a slug like 'lisbon'")
    for q in args.quote:
        if ve.is_short(q):
            sys.exit(f"REFUSED: quote too short to prove anything (under {ve.SHORT} letters): {q!r}. "
                     "Quote more of the surrounding text.")
    r = fetch_browser(args.url, args.wait, args.scroll) if args.browser else fetch_http(args.url)
    if r["httpStatus"] is None or r["httpStatus"] >= 400:
        sys.exit(f"REFUSED: could not fetch {args.url}: HTTP {r['httpStatus']} {r['error'] or ''}".strip())
    vis, js, _ = ve.extract(r["body"], r["contentType"])
    matches, missing = [], []
    for q in args.quote:
        ex, where = find_excerpt(q, vis), "visible-text"
        if ex is None and js:
            ex, where = find_excerpt(q, js), "embedded-json"
        if ex is None:
            missing.append(q)
        else:
            matches.append({"quote": q, "matchedIn": where, "excerpt": ex})
    if missing:
        hint = "" if args.browser else " If the page needs JavaScript, retry with --browser."
        for q in missing:
            print(f"REFUSED: quote not found on {r['finalUrl']}: {q!r}", file=sys.stderr)
        sys.exit("REFUSED: nothing written." + hint)

    sha = hashlib.sha256(r["body"]).hexdigest()
    os.makedirs(args.archive_dir, exist_ok=True)
    body_path = os.path.join(args.archive_dir, sha + ".html.gz")
    if not os.path.exists(body_path):
        with gzip.open(body_path, "wb") as f:
            f.write(r["body"])
    out_dir = os.path.join(SNAP_DIR, args.city)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{args.component}-{sha[:12]}.json")
    fetched = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    if os.path.exists(out_path):
        rec = json.load(open(out_path))
        have = {m["quote"] for m in rec["matches"]}
        rec["matches"] += [m for m in matches if m["quote"] not in have]
    else:
        rec = {"_doc": "Snapshot record written by scripts/collect_evidence.py. The raw body is "
                       "kept outside git as <archive>/<sha256>.html.gz.",
               "url": args.url, "finalUrl": r["finalUrl"], "fetchedAt": fetched,
               "httpStatus": r["httpStatus"], "fetchMode": r["mode"],
               "contentType": r["contentType"], "sha256": sha, "bytes": len(r["body"]),
               "city": args.city, "component": args.component,
               "archiveUrl": None, "matches": matches}
    if args.wayback and not rec.get("archiveUrl"):
        aurl, note = wayback_copy(args.url, args.archive_dir)
        rec["archiveUrl"], rec["archiveNote"] = aurl, note
    json.dump(rec, open(out_path, "w"), indent=1, ensure_ascii=False)
    open(out_path, "a").write("\n")
    rel = os.path.relpath(out_path, SNAP_DIR)
    print(json.dumps({"snapshot": rel, "sha256": sha, "httpStatus": r["httpStatus"],
                      "archiveUrl": rec.get("archiveUrl"), "matched": len(matches)}))


# ------------------------------------------------------------------- checks
def load_record(ref):
    """ref is '<city>/<file>.json' relative to data/evidence-snapshots."""
    p = os.path.normpath(os.path.join(SNAP_DIR, ref))
    if not p.startswith(SNAP_DIR + os.sep) or not os.path.exists(p):
        return None
    return json.load(open(p))


def record_problems(rec):
    errs = []
    for k in ("url", "fetchedAt", "httpStatus", "sha256", "matches"):
        if k not in rec:
            errs.append(f"missing {k}")
    if not re.fullmatch(r"[0-9a-f]{64}", rec.get("sha256", "")):
        errs.append("sha256 is not a 64-hex digest")
    for m in rec.get("matches", []):
        if not quote_in(m.get("quote", ""), m.get("excerpt", "")):
            errs.append(f"excerpt does not contain quote {m.get('quote', '')[:60]!r}")
    return errs


def snapshot_supports(ref, quote):
    """True if the record exists, is well formed, and one of its excerpts holds `quote`."""
    rec = load_record(ref) if ref else None
    if not rec or record_problems(rec):
        return False
    return any(quote_in(quote, m["excerpt"]) for m in rec["matches"])


def check(_args=None):
    bad = 0
    n = 0
    for city in sorted(os.listdir(SNAP_DIR)) if os.path.isdir(SNAP_DIR) else []:
        d = os.path.join(SNAP_DIR, city)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if not f.endswith(".json"):
                continue
            n += 1
            for e in record_problems(json.load(open(os.path.join(d, f)))):
                print(f"  {city}/{f}: {e}"); bad += 1
    print(f"evidence snapshots: {n} records, {bad} problems")
    return bad == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("snapshot", help="fetch, match, archive, record")
    s.add_argument("--url", required=True)
    s.add_argument("--quote", required=True, action="append", help="repeatable; every one must match")
    s.add_argument("--city", required=True)
    s.add_argument("--component", default="rent")
    s.add_argument("--browser", action="store_true", help="render with headless Chrome (JS pages)")
    s.add_argument("--wait", type=int, default=4000, help="browser: ms to wait after load")
    s.add_argument("--scroll", type=int, default=2, help="browser: scroll steps (lazy-loaded lists)")
    s.add_argument("--wayback", action="store_true", help="ensure an Internet Archive copy (sparingly)")
    s.add_argument("--archive-dir", default=DEFAULT_ARCHIVE)
    sub.add_parser("check", help="validate every snapshot record")
    a = ap.parse_args()
    if a.cmd == "snapshot":
        snapshot(a)
    else:
        sys.exit(0 if check(a) else 1)


if __name__ == "__main__":
    main()
