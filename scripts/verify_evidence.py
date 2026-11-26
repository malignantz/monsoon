#!/usr/bin/env python3
"""Check that each cost-evidence quote is actually on the page it cites.

For every evidence row in data/cost-evidence/<slug>.json this fetches the cited
URL (politely, cached outside the repo), looks for the quote in the visible text,
and falls back to the closest Internet Archive snapshot when the live page does
not confirm it. Results go to data/cost-evidence-verification.json.

A "verified" quote proves the page says it, NOT that the price is right.

Statuses (final `status`):
  verified          exact normalised match on the live page
  verified-archive  not confirmed live, but exact match in a Wayback snapshot
  partial           numbers + most distinctive words found close together
  quote-missing     page fetched, quote not found
  blocked           401/403/429/captcha/bot wall/JS-only shell, nothing usable
  dead              404/410/DNS failure/timeout/5xx
  api               JSON/API source (e.g. FX rates); quote matching skipped
  unchecked         --offline and nothing in the cache

Usage:
  scripts/verify_evidence.py                 # everything, writes the JSON file
  scripts/verify_evidence.py --city agadir --limit 3
  scripts/verify_evidence.py --offline       # re-classify from cache only
  scripts/verify_evidence.py --report        # print markdown summary of the JSON
Stdlib only. Read-only toward the Wayback Machine (never Save Page Now).
"""
import argparse, collections, concurrent.futures as cf, datetime as dt, glob, gzip
import hashlib, html.parser, json, os, re, shutil, subprocess, sys, threading, time
import unicodedata, urllib.error, urllib.parse, urllib.request, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVID_DIR = os.path.join(ROOT, "data", "cost-evidence")
OUT = os.path.join(ROOT, "data", "cost-evidence-verification.json")
DEFAULT_CACHE = "/tmp/claude-1000/-home-garrett-code/9adf7a4e-b5b0-5f6b-8741-e38e94748f10/scratchpad/evidence-cache"
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36 monsoon.fyi-evidence-check")
MIN_GAP = 2.0          # seconds between requests to one domain
TIMEOUT = 15
MAX_BYTES = 3_000_000
API_HOSTS = {"open.er-api.com"}
GOOD = ("verified", "verified-archive")

# ---------------------------------------------------------------- rate limit
class Limiter:
    """At most one request per MIN_GAP seconds per domain (thread safe)."""
    def __init__(self):
        self.lock = threading.Lock(); self.next = {}
    def wait(self, key):
        with self.lock:
            now = time.monotonic(); t = max(now, self.next.get(key, 0))
            self.next[key] = t + MIN_GAP
        if t > now: time.sleep(t - now)
LIMITER = Limiter()

def dom_key(url):
    h = urllib.parse.urlparse(url).netloc.lower().split(":")[0]
    if h.endswith("archive.org"): return "archive.org"
    return h[4:] if h.startswith("www.") else h

# --------------------------------------------------------------------- fetch
def http_get(url, accept="text/html,application/xhtml+xml,*/*;q=0.8"):
    """One GET with a single retry. Returns dict(http, body, ctype, final, error)."""
    last = None
    for attempt in (0, 1):
        LIMITER.wait(dom_key(url))
        req = urllib.request.Request(url, headers={
            "User-Agent": UA, "Accept": accept, "Accept-Language": "en-US,en;q=0.8",
            "Accept-Encoding": "gzip, deflate"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                raw = r.read(MAX_BYTES + 1)[:MAX_BYTES]
                return pack(r.status, raw, r.headers, r.geturl())
        except urllib.error.HTTPError as e:
            try: raw = e.read(MAX_BYTES)
            except Exception: raw = b""
            last = pack(e.code, raw, e.headers, url)
            if e.code in (404, 410, 401, 403, 451): return last   # retry won't help
        except Exception as e:  # DNS, timeout, reset, TLS
            last = {"http": None, "body": b"", "ctype": "", "final": url,
                    "error": f"{type(e).__name__}: {e}"[:160]}
        time.sleep(1.0)
    return last

def pack(code, raw, headers, final):
    enc = (headers.get("Content-Encoding") or "").lower()
    try:
        if enc == "gzip": raw = gzip.decompress(raw)
        elif enc == "deflate": raw = zlib.decompress(raw)
    except Exception: pass
    return {"http": code, "body": raw, "ctype": (headers.get("Content-Type") or ""),
            "final": final, "error": None}

def cache_paths(cache, url):
    h = hashlib.sha1(url.encode()).hexdigest()
    return os.path.join(cache, h + ".json"), os.path.join(cache, h + ".body")

def cached_get(cache, url, offline, refresh):
    meta_p, body_p = cache_paths(cache, url)
    if os.path.exists(meta_p) and not refresh:
        m = json.load(open(meta_p))
        m["body"] = open(body_p, "rb").read() if os.path.exists(body_p) else b""
        return m
    if offline: return None
    r = http_get(url)
    if r["http"] is None and dom_key(url) == "archive.org":
        return r | {"fetchedAt": None}        # Wayback hiccup: don't cache, retry next run
    meta = {k: r[k] for k in ("http", "ctype", "final", "error")}
    meta["url"] = url; meta["fetchedAt"] = dt.datetime.now(dt.timezone.utc).date().isoformat()
    os.makedirs(cache, exist_ok=True)
    open(body_p, "wb").write(r["body"]); json.dump(meta, open(meta_p, "w"))
    meta["body"] = r["body"]
    return meta

# ----------------------------------------------------------------- text/match
class TextExtractor(html.parser.HTMLParser):
    SKIP = {"script", "style", "noscript", "template", "svg", "head"}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.json_parts, self.depth, self.in_json, self.scripts = [], [], 0, False, 0
        self.skip_stack = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "script":
            self.scripts += 1
            self.in_json = "json" in (a.get("type") or "")
        if tag in self.SKIP and tag != "head": self.skip_stack.append(tag)
        elif tag == "head": self.skip_stack.append(tag)
        if tag in ("br", "p", "div", "li", "tr", "td", "h1", "h2", "h3", "h4"): self.parts.append(" ")
        if tag == "meta" and (a.get("name") in ("description",) or a.get("property") in ("og:description", "og:title")):
            self.parts.append(" " + (a.get("content") or "") + " ")
        if tag == "title": self.parts.append(" ")
    def handle_endtag(self, tag):
        if tag == "script": self.in_json = False
        if tag in self.SKIP and self.skip_stack and tag == self.skip_stack[-1]: self.skip_stack.pop()
    def handle_data(self, data):
        if self.skip_stack and self.skip_stack[-1] == "script" and self.in_json:
            self.json_parts.append(data)
        elif self.skip_stack and self.skip_stack[-1] == "head":
            if self._in_title(): self.parts.append(data)
        elif not self.skip_stack: self.parts.append(data)
    def _in_title(self):
        return self.get_starttag_text() and self.get_starttag_text().lower().startswith("<title")

def decode(body, ctype):
    m = re.search(r"charset=([\w-]+)", ctype or "", re.I) or re.search(rb"<meta[^>]+charset=[\"']?([\w-]+)", body[:4096], re.I)
    enc = (m.group(1).decode() if m and isinstance(m.group(1), bytes) else (m.group(1) if m else "utf-8"))
    try: return body.decode(enc, errors="replace")
    except LookupError: return body.decode("utf-8", errors="replace")

def extract(body, ctype):
    """-> (visible_text, embedded_json_text, n_scripts)"""
    if "pdf" in (ctype or "").lower() or body[:5] == b"%PDF-":
        if shutil.which("pdftotext"):
            try:
                out = subprocess.run(["pdftotext", "-q", "-", "-"], input=body, capture_output=True, timeout=30).stdout
                return out.decode("utf-8", "replace"), "", 0
            except Exception: pass
        return "", "", 0
    text = decode(body, ctype)
    if "json" in (ctype or "").lower() and not text.lstrip().startswith("<"):
        return "", text, 0
    p = TextExtractor()
    try: p.feed(text); p.close()
    except Exception: pass
    return " ".join(p.parts), unjson(" ".join(p.json_parts)), p.scripts

def unjson(t):
    """Embedded JSON (Next.js etc.) often carries HTML as escaped strings; turn it back into plain text."""
    t = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), t)
    t = t.replace("\\n", " ").replace('\\"', '"').replace("\\/", "/")
    return html.unescape(re.sub(r"<[^>]+>", " ", t))

QUOTES = {"‘": "'", "’": "'", "‚": "'", "‛": "'", "“": '"', "”": '"',
          "„": '"', "′": "'", "″": '"', "–": "-", "—": "-", "−": "-",
          " ": " ", " ": " ", " ": " ", "​": ""}
def norm(s):
    s = unicodedata.normalize("NFKC", s)
    s = "".join(QUOTES.get(c, c) for c in s)
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"(?<=\d)[ ,.](?=\d{3}(?!\d))", "", s)      # 5,000 / 5 000 / 5.000 -> 5000
    s = re.sub(r"(?<=\d)\s*(?:k)\b", "k", s)
    return re.sub(r"\s+", " ", s).strip()

def squash(s): return re.sub(r"[\W_]+", "", s)
def tokens(s): return re.findall(r"\w+", s)

STOP = set("the and for with from that this are was were has have not but you your its per out about into over than then more most also can will all any one two".split())

def fragments(quote):
    parts = re.split(r"\.\.\.|…|\[\s*\.\.\.\s*\]|\[…\]", quote)
    frs = [squash(norm(p)) for p in parts]
    return [f for f in frs if len(f) >= 10] or [squash(norm(quote))]

SHORT = 25   # squashed characters; shorter exact hits ("30 EUR/mes") are too easy to match by luck

def exact_match(quote, page_squashed):
    frs = fragments(quote)
    return bool(frs) and all(f and f in page_squashed for f in frs)

def is_short(quote):
    return sum(len(f) for f in fragments(quote)) < SHORT

def numbers_on_page(quote, page_norm):
    """Diagnostic: are all 3+ digit numbers of the quote anywhere on the page? None if the quote has none."""
    nums = [t for t in tokens(norm(quote)) if t.isdigit() and len(t) >= 3]
    if not nums: return None
    pt = set(tokens(page_norm))
    return all(n in pt for n in nums)

def partial_match(quote, page_norm):
    qn = norm(quote)
    qt = tokens(qn)
    nums = {t for t in qt if any(c.isdigit() for c in t)}
    words = {t for t in qt if t not in nums and len(t) >= 4 and t not in STOP}
    if not nums and len(words) < 4: return False
    pt = tokens(page_norm)
    if not pt: return False
    want = nums | words
    pos = collections.defaultdict(list)
    for i, t in enumerate(pt):
        if t in want: pos[t].append(i)
    if any(n not in pos for n in nums): return False          # every number must appear
    present = [t for t in want if t in pos]
    need = 0.6 if nums else 0.8
    if len(present) / max(1, len(want)) < need: return False
    W = max(40, 3 * len(qt))
    anchor = min(present, key=lambda t: len(pos[t]))
    for i in pos[anchor][:300]:
        win = set(pt[max(0, i - W): i + W])
        if all(n in win for n in nums) and sum(1 for w in words if w in win) / max(1, len(words)) >= (0.6 if nums else 0.8):
            return True
    return False

BLOCK_RE = re.compile(r"just a moment|cf-chl|captcha|verify you are (a )?human|access denied|are you a robot|"
                      r"attention required|enable javascript|unusual traffic|bot detection|request blocked|"
                      r"pardon our interruption|checking your browser", re.I)

def classify_page(quote, resp):
    """-> (status, matchedVia). resp is a cached_get dict."""
    code, body, ctype = resp["http"], resp["body"], resp["ctype"]
    if code is None: return "dead", None
    vis, js, nscripts = extract(body, ctype)
    page = norm(vis)
    if code in (404, 410): return "dead", None
    if code >= 500 and code != 503: return "dead", None
    short = is_short(quote)
    if exact_match(quote, squash(page)): return ("partial", "exact-short") if short else ("verified", "exact")
    if js and exact_match(quote, squash(norm(js))): return ("partial", "embedded-json-short") if short else ("verified", "embedded-json")
    ok = code < 400
    if ok and partial_match(quote, page): return "partial", "numbers+words"
    if ok and js and partial_match(quote, norm(js)): return "partial", "embedded-json"
    raw_head = decode(body[:30000], ctype)
    walled = code in (401, 403, 429, 451, 503) or (len(page) < 600 and BLOCK_RE.search(raw_head))
    if walled: return "blocked", None
    if len(page) < 300 and (nscripts >= 3 or len(page) < 80): return "blocked", "js-shell"
    return "quote-missing", None

# ------------------------------------------------------------------- wayback
def wayback(cache, url, date, offline, refresh):
    """-> (archive_url or None, resp or None). Read-only availability lookup + raw fetch."""
    ts = (date or "").replace("-", "")[:6]
    ts = (ts + "15") if len(ts) == 6 else ts
    api = "http://archive.org/wayback/available?url=" + urllib.parse.quote(url, safe="") + (f"&timestamp={ts}" if ts else "")
    r = cached_get(cache, api, offline, refresh)
    if not r or r["http"] != 200: return None, None
    try: snap = json.loads(r["body"]).get("archived_snapshots", {}).get("closest")
    except Exception: return None, None
    if not snap or not snap.get("available"): return None, None
    aurl = snap["url"].replace("http://", "https://", 1)
    raw = re.sub(r"(/web/\d+)/", r"\1id_/", aurl, count=1)       # id_ = original bytes, no toolbar
    resp = cached_get(cache, raw, offline, refresh)
    return aurl, resp

# ----------------------------------------------------------------- per URL
def check_url(cache, url, rows, offline, refresh):
    """rows: list of (key, quote, date). Returns {key: result}. Fetches the URL once."""
    out = {}
    host = urllib.parse.urlparse(url).netloc.lower()
    if host in API_HOSTS:
        for key, q, d in rows:
            out[key] = dict(url=url, status="api", liveStatus="api", checkedAt=None, httpStatus=None, archiveUrl=None, matchedVia="api")
        return out
    resp = cached_get(cache, url, offline, refresh)
    for key, q, d in rows:
        res = dict(url=url, status="unchecked", liveStatus="unchecked", checkedAt=None, httpStatus=None, archiveUrl=None, matchedVia=None)
        if resp is not None:
            st, via = classify_page(q, resp)
            res.update(status=st, liveStatus=st, checkedAt=resp.get("fetchedAt"), httpStatus=resp["http"], matchedVia=via)
            if st != "verified":
                aurl, aresp = wayback(cache, url, d, offline, refresh)
                if aurl: res["archiveUrl"] = aurl
                if aresp and aresp["http"] == 200:
                    ast, avia = classify_page(q, aresp)
                    if ast == "verified":
                        res.update(status="verified-archive", matchedVia="archive-" + (avia or "exact"))
                    elif ast == "partial" and st in ("dead", "blocked", "quote-missing"):
                        res.update(status="partial", matchedVia="archive-" + (avia or "partial"))
        if resp is not None and res["status"] in ("quote-missing", "partial") and resp["http"] and resp["http"] < 400:
            res["numbersFound"] = numbers_on_page(q, norm(extract(resp["body"], resp["ctype"])[0]))
        out[key] = res
    return out

# ---------------------------------------------------------------------- main
def load_rows(city=None):
    rows = []
    for p in sorted(glob.glob(os.path.join(EVID_DIR, "[a-z]*.json"))):
        slug = os.path.basename(p)[:-5]
        if city and slug != city: continue
        for i, e in enumerate(json.load(open(p)).get("evidence", [])):
            if e.get("url"): rows.append((slug, i, e))
    return rows

def run(args):
    rows = load_rows(args.city)
    if args.limit: rows = rows[:args.limit]
    by_url = collections.defaultdict(list)
    for slug, i, e in rows: by_url[e["url"]].append(((slug, i), e.get("quote", ""), e.get("date", "")))
    by_dom = collections.defaultdict(list)
    for u in sorted(by_url): by_dom[dom_key(u)].append(u)
    results, lock, done = {}, threading.Lock(), [0]
    def work(dom):
        for u in by_dom[dom]:
            r = check_url(args.cache, u, by_url[u], args.offline, args.refresh)
            with lock:
                results.update(r); done[0] += 1
                if done[0] % 25 == 0: print(f"  {done[0]}/{len(by_url)} urls", file=sys.stderr)
    with cf.ThreadPoolExecutor(max_workers=args.threads) as ex:
        list(ex.map(work, sorted(by_dom, key=lambda d: -len(by_dom[d]))))
    build_output(rows, results, args)

def build_output(rows, results, args):
    cities = {}
    for slug, i, e in rows:
        r = results[(slug, i)]
        r = {"row": i, "claim": (e.get("claim") or "")[:90], **r}
        cities.setdefault(slug, []).append(r)
    existing = {}
    if (args.city or args.limit) and os.path.exists(OUT):       # partial run: merge into the full file
        existing = json.load(open(OUT)).get("cities", {})
    existing.update(cities); cities = dict(sorted(existing.items()))
    out = {"_doc": "Output of scripts/verify_evidence.py. A verified quote proves the cited page says it, not that the price is right. See docs/research/2026-11-26-evidence-verification.md.",
           "summary": summarize(cities), "cities": cities}
    json.dump(out, open(OUT, "w"), indent=1, ensure_ascii=False); open(OUT, "a").write("\n")
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {out['summary']['total']} rows", file=sys.stderr)

def summarize(cities):
    allrows = [r for rs in cities.values() for r in rs]
    st = collections.Counter(r["status"] for r in allrows)
    dates = [r["checkedAt"] for r in allrows if r["checkedAt"]]
    return {"total": len(allrows), "byStatus": dict(sorted(st.items())),
            "checkedThrough": max(dates) if dates else None}

# -------------------------------------------------------------------- report
def pct(n, d): return f"{100 * n / d:.0f}%" if d else "-"

def report():
    data = json.load(open(OUT)); cities = data["cities"]
    rows = [(c, r) for c, rs in cities.items() for r in rs]
    total = len(rows); st = collections.Counter(r["status"] for _, r in rows)
    L = [f"### Results ({total} evidence rows, checked through {data['summary']['checkedThrough']})", "",
         "| Status | Rows | Share |", "|---|---:|---:|"]
    for s in ("verified", "verified-archive", "partial", "quote-missing", "blocked", "dead", "api", "unchecked"):
        if st.get(s): L.append(f"| {s} | {st[s]} | {pct(st[s], total)} |")
    qm = [r for _, r in rows if r["status"] == "quote-missing"]
    nf = collections.Counter({True: "numbers on page", False: "numbers not on page", None: "no 3-digit number in quote"}[r.get("numbersFound")] for r in qm)
    L += ["", "### Quote-missing rows, split by whether the quote's 3+ digit numbers appear anywhere on the page", "",
          "| Case | Rows |", "|---|---:|"] + [f"| {k} | {v} |" for k, v in sorted(nf.items())]
    L += ["", "### By source domain (top 25 by rows)", "",
          "| Domain | Rows | Verified (live+archive) | Partial | Missing | Blocked | Dead |", "|---|---:|---:|---:|---:|---:|---:|"]
    dm = collections.defaultdict(collections.Counter)
    for _, r in rows: dm[dom_key(r["url"])][r["status"]] += 1
    for d, c in sorted(dm.items(), key=lambda kv: (-sum(kv[1].values()), kv[0]))[:25]:
        n = sum(c.values())
        L.append(f"| {d} | {n} | {c['verified'] + c['verified-archive']} ({pct(c['verified'] + c['verified-archive'], n)}) | {c['partial']} | {c['quote-missing']} | {c['blocked']} | {c['dead']} |")
    cs = []
    for c, rs in cities.items():
        n = sum(1 for r in rs if r["status"] != "api")
        g = sum(1 for r in rs if r["status"] in GOOD)
        cs.append((g / n if n else 0, -n, c, g, n))
    cs.sort()   # lowest share first; ties broken by most rows, then name
    zero = sum(1 for x in cs if x[0] == 0)
    L += ["", f"### 15 cities with the lowest verified share ({zero} of {len(cs)} cities have no verified row; ties broken by most rows)", "",
          "| City | Verified | Rows | Share |", "|---|---:|---:|---:|"]
    for sh, _, c, g, n in cs[:15]: L.append(f"| {c} | {g} | {n} | {pct(g, n)} |")
    dead = [(c, r) for c, r in rows if r["status"] == "dead"]
    L += ["", f"### Dead links ({len(dead)} rows)", ""]
    seen = set()
    for c, r in dead:
        if (c, r["url"]) in seen: continue
        seen.add((c, r["url"])); L.append(f"- {c}: {r['url']} (HTTP {r['httpStatus'] or 'no response'})")
    print("\n".join(L))

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--city", help="slug, e.g. agadir (merges into the existing output)")
    ap.add_argument("--limit", type=int, help="only the first N evidence rows")
    ap.add_argument("--offline", action="store_true", help="use cache only, no network")
    ap.add_argument("--refresh", action="store_true", help="ignore cache and refetch")
    ap.add_argument("--report", action="store_true", help="print markdown summary of the output file and exit")
    ap.add_argument("--cache", default=os.environ.get("EVIDENCE_CACHE", DEFAULT_CACHE))
    ap.add_argument("--threads", type=int, default=24)
    args = ap.parse_args()
    if args.report: return report()
    run(args)

if __name__ == "__main__":
    main()
