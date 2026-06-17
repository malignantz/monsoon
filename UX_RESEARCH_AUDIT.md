# Monsoon — UX, Retention & SEO Research Audit

_Prepared 2026-06-17. Scope: usability, intuitiveness, user retention, SEO, and user
satisfaction for Monsoon as a data-focused web app. Grounded in a live walkthrough of
the running app (This month, City sheet, My year — desktop + mobile) and a read of the
component code, cross-referenced against current UX/SEO research (NN/g, Baymard, Google
Search Central, SvelteKit docs, Nomad List teardowns). Sources are listed at the end._

---

## 0. TL;DR

Monsoon is **already in the top decile of craft** for an indie data tool. The visual
system, the city sheet, the month-strip primitive, and the copy are genuinely
excellent — do not rip these up. Your two stated worries are real but **narrow and
fixable**, and they are not the same problem:

- **"Overwhelming/confusing"** is a *first-15-seconds* problem, concentrated in (a) the
  density of the control bar before any data appears (especially mobile), and (b) the
  lack of a single "here's the one answer" anchor. It is a tuning problem, not a
  redesign.
- **"My year is boring"** is a *blank-canvas* problem. The planner opens to **12
  identical empty "Add a city" slots** with `—` for every stat. There is no seed, no
  payoff preview, no sense of progress, and no reason the result feels like _yours_.
  This is the single highest-value UX fix in the app.

Separately — and bigger than either worry for **growth** — Monsoon is a pure
client-rendered SPA with **one crawlable URL, a bare robots.txt, and no sitemap**. You
have 111 cities × 12 months of differentiated, computed data that is **completely
invisible to Google, AI crawlers, and social link previews.** That is the largest
untapped lever in the entire product.

Priority order (detail in §7):
1. **P0 — Seed & enliven My year** (kills "boring," directly drives retention).
2. **P0 — Prerender + programmatic SEO landing pages** (unlocks the only scalable
   acquisition channel you have).
3. **P1 — Lower first-contact density / add one headline anchor** (kills "overwhelming").
4. **P1 — Tasteful return-loops** (email-me-my-year, share cards, seasonal hooks).
5. **P2 — Trust/freshness signals, compare tray, mobile polish.**

---

## 1. What's already working (protect these)

A candid audit has to start here, because several of these are doing exactly what the
research says to do, and the temptation when "fixing overwhelm" is to sand them off.

- **The month strip is a perfect preattentive primitive.** Research (NN/g, _Dashboards:
  Making Charts Easier to Understand_) says the eye decodes **bar/length and color**
  before conscious attention. Your 12-cell colored strip lets a user grok a city's whole
  year in <1s. Keep it everywhere it is.
- **One headline number per card** (`94 SCORE`) follows the "anchor, don't dump" rule.
- **The City sheet is a model trust object.** "The draw" narrative, _Split in June_
  metric bars, **Safety, two ways** with the explicit `local 93 → ×1 visitor lens →
  93` derivation, year-at-a-glance — this is "show your work" done right (§4).
- **Copy is value-led, not feature-led.** "follow the good months," the _How it works_
  framing of Best Value as where "hidden gems surface" — this is the aha articulated well.
- **Calm visual language.** Warm paper, restrained terracotta, no dashboard theater.
  This is the antidote to overwhelm, not a cause of it.
- **Real accessibility care** — tap-target floors, `aria-pressed`, reduced-motion gates,
  focus-visible outlines, `role="dialog"`. Most indie tools skip all of this.
- **Share-by-URL with no backend** (`?i=` compact route) is exactly the
  retention/growth loop the research prescribes (§5) — you just haven't pushed it hard.

The implication: your problems are **not** "the design is bad." They are "two specific
moments under-deliver, and the content has no front door for search."

---

## 2. Usability & intuitiveness — the "overwhelming" worry

### 2.1 Time-to-first-data is too long, especially on mobile
**Observation (live):** On mobile, the entire first screen-and-a-half is chrome:
logo → nav → "WHERE SHOULD I BE IN / Jun" → 12-cell month selector → italic dek →
"111 cities" → Highest/Best Value → Cards/Table → Favorites/Regions/Refine →
legend paragraph → SCORE BY MONTH legend → icon legend. The **first actual city card
(Split, 94) doesn't appear until you scroll past all of it.** On desktop it's better but
the same stack sits between the headline and the ranking.

**Why it matters:** NN/g's dashboard definition is _at-a-glance information consumable
with minimum interaction_. The "aha" here is "oh, _Split_ is the answer for June" — and
right now the user has to wade through six controls to reach it. Every control above the
first result is a micro-anxiety (UXmatters, _Designing Calm_) and a chance to bounce.

**Fixes (cheap → bigger):**
- **Collapse the two legend blocks** (`Each colored strip is…` + `SCORE BY MONTH` +
  the icon legend) into a single, one-line, dismissible "what the colors mean" affordance,
  or move it _below_ the first row of cards. First-time users need it once; returning
  users never need it again. Persist dismissal in the existing `atlas.prefs.v1`.
- **Show the #1 result inline in/near the headline.** Consider a one-line "answer"
  under the dek: _"Top for June: **Split**, Croatia — 94."_ This is the "lead with one
  headline answer" principle (NN/g) and it gives the eye a destination before the grid.
- **On mobile, lift the first card above the fold** by demoting the
  Highest/Best-Value + Cards/Table + filter row into a single sticky "Sort & filter"
  control that the existing `stickbar` could host. You already built `stickbar` — let it
  carry the controls so the static header can shrink.

### 2.2 Two ranking axes + three lenses + filters = hidden complexity
You have **Highest Score vs Best Value** (sort), **Balanced / Livability / High season**
(lens, in Settings), **valueModel adjusted/raw**, plus region + refine filters. That's a
lot of orthogonal knobs. The research caution (Hick's Law; progressive disclosure's "two
levels max") is that re-weighting controls _build_ trust (§4) but _only if discoverable
and legible_. Right now the lens lives behind the gear, disconnected from the numbers it
changes.

**Fixes:**
- When a non-default lens is active, **say so on the surface** — a small inline pill near
  the result count: _"Ranked for: Livability ▾"_ that opens the lens picker. This both
  advertises the feature (information scent) and prevents the "why did the order change?"
  confusion.
- Keep the gear for party-size/women's-safety, but **promote the lens** to a first-class
  control because it changes the entire ranking. A hidden control that reorders everything
  is a classic trust-eroder.

### 2.3 "Best Value" is your differentiator but it's a cold toggle
Your own _How it works_ copy says Best Value is "where the hidden gems surface" — that's
the Monsoon thesis (cheap + great + seasonal). But on the surface it's just the second
half of a segmented control with no payoff shown until you click it.

**Fix:** When Best Value is active, **label the win**: a row badge like _"gem · 38%
cheaper than Split for the same score"_ (you already compute value index and cost). This
is the "do the work for the consumer" rule (NN/g comparison tables) and it makes the
differentiator legible instead of latent.

---

## 3. "My year is boring" — the blank-canvas problem (highest-value fix)

This is the most important section. The diagnosis is unambiguous from the live mobile
empty state: **12 identical dashed rows, each "Jan OPEN — + Add a city," every stat `—`.**
On desktop it's an empty 12-column board with the hint "Click any month above to mark a
starting point."

The research on why this fails is blunt:

- **Blank-canvas paralysis** (DEV / template research): an empty grid imposes maximum
  upfront cognitive load — _decide structure, populate from zero, organize_ — and users
  abandon **before** the aha. Templates/seeds account for ~75% of the onboarding journey.
- **"Never ship a true blank screen"** (Chameleon, Carbon, Pencil&Paper empty-state
  guidance): pre-populate with realistic example/seed data so the user sees the product
  _in action_, then make it theirs.
- **Goal-gradient effect** (LogRocket / UX Bulletin): motivation rises as a visible goal
  nears. With no progress indicator and no seed, there's no goal to gradient toward — the
  year just sits there, 0/12.

### 3.1 Seed the year (the core fix)
Offer a **one-tap starter** so the first complete state is nearly free:

- **"Build me a year" / "Auto-fill my year"** — generate a 6-leg, Schengen-legal,
  season-following route from the current data. You already have every primitive needed:
  `qolFor`, `valueFor`, `schengenCheck`, `monthOccupancy`, `freeRun`, `stayMonths`. This
  is the single most impactful thing you can build. The TODO already lists "Improve the
  automatic itinerary picker" — promote it from improvement to **the empty-state hero.**
- Make the empty state a **choice of seeds**, not a blank board:
  - _Best quality year_ (max avg score)
  - _Best value year_ (max livability-per-dollar — your differentiator)
  - _Festival year_ / _Non-Schengen year_ (these route styles are already in the TODO)
  - _Start from my favorites_ (you already store `favorites`)
  - _Start blank_ (keep the current path for power users)
- The generated route is **editable immediately** — drag/resize/remove as today. The seed
  removes the cold start; it doesn't remove control. This is "seed, then make it theirs."

### 3.2 Make progress feel like progress
- **Add a progress indicator**: "_5 of 12 months planned_" + a filling bar. Goal-gradient
  says this alone increases completion. You already compute `occ`/`emptyMonths`.
- **Celebrate milestones**: a small success state when the year is full, when a festival
  lands in a stay, or when a Schengen-legal full year is achieved ("✓ A legal, livable
  year — avg 89, $1,540/mo"). The stats block is there; give it a "you did it" moment.
- **"Because you…" payoff** (Netflix/Amazon pattern; The Decision Lab on the
  personalization paradox): the planner already ranks candidates for the open window. Lean
  into _why_: the picker rows could say _"fills Mar–Apr · São João festival · €420 cheaper
  than your Feb stay."_ You compute all of this; surface the reason so the saved state
  _gives back_.

### 3.3 The empty stats are a wasted first impression
`AVG SCORE —`, `/MO —` is the first thing a new planner sees, and `—` reads as "broken /
nothing here." Replace the empty state's stats with an **invitation that previews the
payoff**: e.g. a ghosted "A typical Monsoon year: ~89 avg · ~$1,500/mo · 4 festivals —
build yours." This turns dead zeros into a value promise.

### 3.4 Critical nuance — warm the board, don't replace it with an explainer
The instinct when fixing a blank state is often "swap in a colorful explanation panel."
The research points the other way, and this is the most important refinement to §3.1:
**keep the 12-month board visible and warm it up in place.** The board _is_ the clearest
possible explanation of "this app plans your travel year" — replacing it with a marketing
panel creates a **double step** (read the panel → now go find the real thing → start
over), which is exactly the friction empty-state guidance warns against (NN/g first-use
empty states; Pencil&Paper; Appcues/Maze empty-state studies). A first-use empty state
should (1) explain the value in one line, (2) show what "full" looks like so the void
reads as _potential_, not absence, (3) offer **one** obvious next action, and (4) lower
the intimidation of a 12-slot commitment — all _around_ the real UI, not instead of it.

**The dominant product patterns**, and what to borrow:
- **Seeded / "ghost" content** — Notion template prompts, Linear/Height faint example
  rows, Trello sample cards, and crucially **Wanderlog/TripIt seeded sample itineraries**.
  Pre-fill the structure with a faint, dismissible _example_ so the empty container shows
  its filled shape. This is the highest-leverage single change and it's the concrete form
  of §3.1's "seed": render a suggested 3–4-city route at low opacity with a
  "✨ Example — clear it and start your own" affordance, so dashed boxes read as
  "almost there" instead of "nothing here."
- **Illustration + headline + single CTA** — Airbnb Trips/Wishlists, Asana, Slack,
  Duolingo. Reserve this for containers that are _meaningless empty_. A 12-month travel
  board is **not** meaningless on its own, which is why you should lean **seeded-first**
  and use only a slim intro strip rather than a full illustrated takeover.

**Concrete hybrid for My year (keep board + warm it up):**
1. A short **intro strip above the board** (1 headline + 1 sub-line) in your existing band
   palette so it reads native, e.g. _"Build your year, month by month — pick where you'll
   be and we'll score each stay for weather, cost, and visa rules."_ This is the "colorful
   explanation," sitting _with_ the calendar, not replacing it.
2. **Seed a faint ghost example** route (per above) — the single biggest mover.
3. **One primary CTA** ("Start planning" / "Use this example") to anchor the eye, while
   keeping the dispersed `+` buttons for users who want to dive straight in.
4. **Color, not chrome** — the current empties are gray dashed boxes (`--ink-3`,
   `--line`). Even faintly tinting empty months with band colors makes the board read as
   inviting rather than unfinished. Your existing copy ("Click any month above…") is fine;
   the problem is purely that it floats under a field of gray dashes with nothing to
   anchor the eye.

This reconciles with §3.1's "Build me a year": the **ghost example** is the zero-effort
default warmth; **"Build me a year" + seed choices** is the one-tap upgrade for users who
want a real, editable route rather than a faint sample. Ship the ghost example first (low
effort, high impact), then the generator.

### 3.5 First-time shared-itinerary landing (already in your TODO)
Your own TODO flags this: a shared link currently demands a "Save a copy" click before a
first-timer can touch it. Per the empty-state research, a first-time visitor with **no**
saved year should have the shared route **auto-adopted as their starting state** (with a
clear undo), because for them it _is_ the seed. Keep the read-only preview only for
returning users who already have a year worth protecting. This is the same "seed the
canvas" principle applied to the share entry point — and it's a high-intent entry (someone
sent them a link).

---

## 4. Trust, credibility & data freshness

A scoring/index product lives or dies on whether users believe the numbers. You're
**most of the way there** — the city sheet already does "explainable trust evaluation"
better than most commercial tools (the visible `local → ×visitor lens → score`
derivation is exemplary). The gaps are about _reachability_ and _freshness_:

- **Methodology is reachable only from the footer.** Trust research (Userpilot; Design
  Group Italia) says make methodology reachable **from the score**, not buried. The
  city-sheet `ScoreInfo` "i" popovers do this locally — extend the pattern so the
  headline `SCORE` on a card/sheet has a one-tap "how is this computed?" path.
- **No data-freshness signal anywhere.** Freshness is a core rated dimension of dataset
  trust (InfoWorld data-trust framework), and a visible **"data updated [month] 2026"** /
  "_last refreshed_" label measurably raises confidence (Luke Beacon). Your methodology
  footer says "2026" but the _data surfaces_ (cards, sheets) carry no freshness cue. Add a
  quiet "scored from 2026 data" line on the sheet and a dated methodology stamp.
- **Surface sources where you have them.** You have `worldbank-homicide.json`,
  `fcdo-advice.json`, `wps-community-safety.json`, `cost-evidence/*`. Even a single
  "_sources: World Bank, FCDO, …_" line on the methodology page converts "trust my black
  box" into "here's the receipts."
- **The re-weight lens IS a trust tool** — exposing it (§2.2) is also a credibility play:
  letting users tune weights converts a black box into something they can sanity-check
  against their own priors.

---

## 5. Retention & re-engagement (no-login)

Monsoon has **no accounts**, so the entire retention model rests on **stored value
(localStorage) + share/return loops + the inherent periodicity of travel.** The research
("saved state = return reason," trigger→action→reward→investment) maps almost perfectly
onto what you've half-built.

### 5.1 Make saved value visible on return
On return, the user lands on This month (a blank-feeling ranking), not on their
investment. **Greet returning users with their stuff**: if a route or favorites exist,
This month should surface a quiet "_Your year: 5 stays · avg 89 · resume ▸_" banner.
Visible accumulated value raises switching cost (the whole point of the localStorage moat).

### 5.2 Tasteful, value-framed email capture (the one durable identity)
You cannot re-engage anonymous localStorage users — the address is the only re-acquisition
hook. Frame capture as **a feature, not a gate** (Bento/Descope magic-link guidance):
- _"Email me my year"_ (deliver the itinerary as the payload — the email is the delivery
  mechanism, so it feels like a utility).
- _"Email me November's rankings"_ / _"Tell me when [saved city] data updates."_
- Passwordless by default; no wall, ever. Backend-free path: Cloudflare Worker + KV +
  a transactional service (Postmark/SendGrid/Bento). This is the single biggest lever to
  convert one-time visitors into returnable ones.

### 5.3 Lean into periodicity — your strongest external trigger
Travel is naturally periodic; exploit it:
- A **"Where to be in [next month]"** refresh is simultaneously a re-engagement send _and_
  a pSEO page (§6). Two birds.
- Win-back cadence research points at **~9–10 months after last activity** (rebooking
  pattern), not a flat year — re-surface a user's saved cities then.
- **Data-update triggers** ("cost-of-living refreshed; a city you watch dropped") feel
  like service, not spam — uniquely available to a data tool.

### 5.4 Push every share surface harder
The `?i=` share loop is built but quiet. Per-page/per-result **share cards** (§6.5) turn
every comparison and every planned year into a re-acquisition loop. The share button
exists; the _shareable artifact_ (a beautiful OG image of "My Monsoon Year") does not yet.

---

## 6. SEO & discoverability (largest growth lever — currently ~zero)

**Current state (verified):** pure client-side-rendered Svelte SPA; **one URL**
(`/`, plus `?city=` / `?i=` query params on the same document); `robots.txt` is two
lines with **no sitemap reference**; **no sitemap.xml**; **no per-city or per-month
pages**; metadata is a single static `index.html` head. OG tags exist and are good — but
they're identical for every "page" because there are no pages.

**Why this is the biggest miss:** You've built 111 cities × 12 months of _differentiated,
computed_ data — exactly the raw material that powers programmatic SEO (pSEO) for
Nomad List (~2k indexed pages, ~43–47k monthly organic visits from this exact pattern).
Right now **none of it is indexable**, and AI crawlers (ClaudeBot, GPTBot, PerplexityBot)
and social crawlers **don't run JS at all**, so they see an empty shell. You are invisible
to the only scalable, free acquisition channel a tool like this has.

### 6.1 Move off CSR-only — prerender (the unlock)
The highest-leverage technical move: **migrate to SvelteKit `adapter-static` and
prerender**, or add a build-time prerender step. This gives you ~all SSR SEO benefits
with **no backend**, deploys as static files straight to Cloudflare Pages, and keeps your
interactive tool as a hydrated client island. Every crawler — Google, AI, social — then
gets real HTML. (SvelteKit gotcha: `ssr` must stay `true` for a route to prerender.)

### 6.2 Build the programmatic page matrix from your dataset
One template × your data = thousands of indexable, internally-linked pages. Map directly
onto filter states you already compute:
- **City pages** — `/city/lisbon`: the city sheet content, prerendered. (111 pages.)
- **"Where to be in [month]"** — `/best/where-to-go-in-november`: an `ItemList` of your
  ranking. (12 pages, pure long-tail intent, doubles as a monthly re-engagement hook.)
- **"Best [attribute] in [region]"** — `/best/cheapest-cities-in-europe`,
  `/best/safest-cities-in-asia`, `/best/warm-in-january`. (Dozens of high-intent pages.)
- **Comparison pages** — `/compare/lisbon-vs-porto`: high-intent "X vs Y" queries; cap to
  _relevant_ pairs (same region / adjacent rank) to avoid index bloat.

### 6.3 Guard quality at scale (this is where pSEO sites get penalized)
- Each page needs **genuinely differentiated computed content** — you have this natively
  ("Lisbon is 32% cheaper than Porto for a 4-pt-lower score"), so use it.
- `noindex` the thin combinatorial long-tail (obscure city-vs-city pairs nobody searches).
- **Split sitemaps by template** (cities / months / comparisons) to monitor indexation.
- **Hub-and-spoke internal linking**: every city links to its region hub and 2–3 related
  cities; "best of" hubs link to all members. An HTML directory of all cities passes link
  equity that an XML sitemap cannot.

### 6.4 Structured data (JSON-LD, baked into prerendered HTML)
- **`ItemList`** on every ranked "best places" / "where to be in" page (carousel-eligible).
- **`Place`** (or `City`/`TouristDestination`) on city pages.
- **`Dataset`** on the methodology page — makes your index discoverable in Google Dataset
  Search and signals authority to AI systems. Genuinely apt for a _data_ tool.
- **`BreadcrumbList`** for the hub-and-spoke structure. Skip generic `FAQPage` (Google no
  longer shows FAQ rich results as a minor add-on).
- Inject JSON-LD at **build time**, not runtime — runtime-only JSON-LD is invisible to
  non-JS crawlers.

### 6.5 Per-page dynamic share images (viral + retention)
Generate an OG image per city / comparison / planned-year at build time (or via a
Cloudflare Worker rendering SVG→PNG): _"Lisbon · $1,420/mo · 92 in May"_ or _"My Monsoon
Year — avg 89, 6 stays."_ Right now every share shows the same `og.png`. Per-result cards
are inherently shareable for ranking content and feed §5.4.

### 6.6 Technical hygiene
- Per-route `<title>` + meta description + self-referencing canonical, baked in via
  `<svelte:head>`.
- Real `sitemap.xml` (generated at build) + add `Sitemap:` to `robots.txt`.
- Core Web Vitals: you're light, but watch **INP** on the re-ranking interactions
  (debounce/worker-ize heavy sorts if needed); reserve space for async content to protect
  CLS. Prerendering improves LCP for free.
- Consider an `llms.txt` so AI consumers can map your structure (SvelteKit documents this).

---

## 7. Mobile-specific notes
You've clearly invested here (the recent commits + `MOBILE_DESIGN_PLAN.md` show it), and
the vertical month list + bottom-sheet picker is the right pattern. Remaining items:
- **First card below the fold** (§2.1) is most acute on mobile — the single biggest
  mobile usability win.
- **Empty My year is at its worst on mobile** (§3): 12 full-height identical "Add a city"
  rows is a wall of sameness. The seed (§3.1) fixes this directly.
- **Table view on mobile**: confirm columns→tabs or priority-columns + sticky city-name
  (NN/g mobile-tables) rather than horizontal pan, which loses comparison context.
- Faceted filter tray: open the highest-value facet (region or month) by default for
  information scent.

---

## 8. Prioritized roadmap

| # | Item | Worry it fixes | Impact | Effort | Notes |
|---|------|----------------|--------|--------|-------|
| **P0** | Seed "My year" — "Build me a year" + seed choices, editable result (§3.1) | _Boring_ | ★★★★★ | M–L | You have every primitive; promote the TODO auto-picker to the empty-state hero |
| **P0** | Progress indicator + milestone payoff in planner (§3.2–3.3) | _Boring_ | ★★★★ | S | Goal-gradient; reuse `occ`/stats |
| **P0** | Prerender (SvelteKit `adapter-static`) + city/month/best-of pages + sitemap (§6.1–6.3) | Growth | ★★★★★ | L | The only scalable acquisition channel; no backend needed |
| **P1** | Cut first-contact density / add #1-answer anchor, lift first card on mobile (§2.1) | _Overwhelming_ | ★★★★ | S–M | Collapse legends; reuse `stickbar` |
| **P1** | Ghost/seeded example board + warm intro strip (§3.4) | _Boring_ | ★★★★★ | S | Lowest-effort, highest-impact warmth; ship before the generator |
| **P1** | Auto-adopt shared route for first-timers (§3.5) | _Boring_ + growth | ★★★ | S | Already in your TODO |
| **P1** | JSON-LD + per-page OG share images (§6.4–6.5) | Growth/retention | ★★★★ | M | Build-time injection |
| **P1** | Email-me-my-year / monthly-rankings capture (§5.2) | Retention | ★★★★ | M | Worker + KV + transactional email |
| **P1** | Surface the active lens on-surface; label Best-Value wins (§2.2–2.3) | _Overwhelming_ + trust | ★★★ | S | Makes the differentiator legible |
| **P2** | Data-freshness stamp + methodology-from-score path + sources (§4) | Trust | ★★★ | S | Quiet "2026 data" + source line |
| **P2** | Returning-user "resume your year" greeting (§5.1) | Retention | ★★★ | S | Visible saved value |
| **P2** | Compare tray (2–3 cities, sticky names, highlight deltas) (§2, TODO) | Satisfaction | ★★★ | M | Already in TODO; follow NN/g compare rules |
| **P2** | Seasonal / 9-month / data-update re-engagement triggers (§5.3) | Retention | ★★★ | M | Depends on email capture |

**If you do only three things:** (1) seed My year, (2) prerender + programmatic pages,
(3) cut first-contact density. The first two are by far the biggest movers; the third is
cheap and kills the overwhelm worry.

---

## 9. Sources

**Data-app UX / usability / planners / comparison / mobile**
- NN/g — Progressive Disclosure: https://www.nngroup.com/videos/progressive-disclosure/
- NN/g — Managing Visual Complexity: https://www.nngroup.com/videos/managing-visual-complexity/
- NN/g — Dashboards: Making Charts Easier to Understand: https://www.nngroup.com/articles/dashboards-preattentive/
- NN/g — Comparison Tables: https://www.nngroup.com/articles/comparison-tables/
- NN/g — Data Tables: Four Major User Tasks: https://www.nngroup.com/articles/data-tables/
- NN/g — Mobile Tables: https://www.nngroup.com/articles/mobile-tables/
- NN/g — Mobile Faceted Search with a Tray: https://www.nngroup.com/articles/mobile-faceted-search/
- Baymard — Always Provide Comparison Features: https://baymard.com/blog/provide-comparison-features
- UXmatters — Designing Calm: https://www.uxmatters.com/mt/archives/2025/05/designing-calm-ux-principles-for-reducing-users-anxiety.php
- Chameleon — Aha Moment & Onboarding: https://www.chameleon.io/blog/successful-user-onboarding
- Chameleon — Empty States for Onboarding: https://www.chameleon.io/blog/how-to-use-empty-states-for-better-onboarding
- Carbon Design System — Empty States: https://carbondesignsystem.com/patterns/empty-states-pattern/
- Pencil & Paper — Empty States: https://www.pencilandpaper.io/articles/empty-states
- DEV — Curing Blank Canvas Paralysis with Templates: https://dev.to/rocketsquirreldev/curing-blank-canvas-paralysis-with-1-click-templates-deskflow-update-3pbc
- LogRocket — Goal Gradient Effect: https://blog.logrocket.com/ux-design/goal-gradient-effect/
- The Decision Lab — Personalization Paradox: https://thedecisionlab.com/insights/technology/the-personalization-paradox-balancing-convenience-and-privacy

**Trust / data freshness**
- Userpilot — Building User Trust: https://userpilot.com/blog/user-trust/
- Design Group Italia — Building User Trust in Data: https://medium.com/design-group-italia/building-user-trust-in-data-d6b943e2c00f
- InfoWorld — Data Trust Scoring Framework: https://www.infoworld.com/article/4150077/a-data-trust-scoring-framework-for-reliable-and-responsible-ai-systems.html
- Luke Beacon — Data Freshness Labels: https://lukebeacon.com.au/data-freshness-labels-how-to-enhance-trust-in-your-dashboards/

**SEO for SPAs / programmatic SEO / structured data**
- SvelteKit — adapter-static: https://svelte.dev/docs/kit/adapter-static
- SvelteKit — llms.txt: https://svelte.dev/docs/kit/project-types/llms.txt
- Passionfruit — JS Rendering & AI Crawlers: https://www.getpassionfruit.com/blog/javascript-rendering-and-ai-crawlers-can-llms-read-your-spa
- Search Engine Land — No-JavaScript Fallbacks: https://searchengineland.com/no-javascript-fallbacks-474605
- Practical Programmatic — Nomad List teardown: https://practicalprogrammatic.com/examples/nomadlist
- upGrowth — How Nomad List pSEO delivers 43.2k visits: https://upgrowth.in/how-nomadlist-programmatic-seo-delivers-43-2k-monthly-organic-traffic/
- Backlinko — Programmatic SEO: https://backlinko.com/programmatic-seo
- Google — Carousel (ItemList) structured data: https://developers.google.com/search/docs/appearance/structured-data/carousel
- SEMrush/SEOmatic — pSEO internal linking: https://seomatic.ai/blog/programmatic-seo-internal-linking
- Generating Sitemaps for SvelteKit on Cloudflare Pages: https://dev.to/mellenio/generating-sitemaps-for-sveltekit-apps-on-cloudflare-pages-1216
- Prerender — Open Graph for SPAs: https://prerender.io/blog/benefits-of-using-open-graph/

**Retention / re-engagement**
- User Intuition — Habit Loops & Retention: https://www.userintuition.ai/reference-guides/habit-loops-and-retention-what-to-study-what-to-ship/
- Dualoop — Habit Loops & Retention: https://dualoop.com/blog/the-power-of-habit-how-understanding-habits-loops-can-improve-user-retention
- Bento — Magic Links Guide: https://bentonow.com/posts/magic-links-guide
- ActiveCampaign — Travel Re-engagement: https://www.activecampaign.com/recipes/travel-re-engagement
- Bloomreach — Travel Email Marketing Guide: https://www.bloomreach.com/en/blog/travel-email-marketing-guide
- MDN — Re-engageable Notifications / Push: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/js13kGames/Re-engageable_Notifications_Push

_Method note: research synthesized via web search across the sources above; URLs are
primary. App findings are from a live walkthrough of the running dev build (This month,
City sheet, My year, desktop + mobile) and a read of `src/App.svelte`,
`src/lib/MyYear.svelte`, `src/lib/ThisMonth.svelte`, `src/lib/HowTo.svelte`, `index.html`,
and `public/robots.txt`._
