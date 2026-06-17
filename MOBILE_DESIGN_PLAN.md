# Monsoon Mobile Design Plan

Last updated: 2026-06-17

> This is the master mobile plan. It supersedes and absorbs `MOBILE_READY_PLAN.md`
> (kept for history). Where that doc was a product spec, this one is an
> implementation plan: it names the actual files, lines, and CSS that need to
> change, proposes a concrete rebuilt "My year," and sets a measurable bar.

## Implementation status (branch `mobile_ready`)

**Shipped & verified in-browser at 320 / 375 px (build green, no page overflow):**

- ✅ **Phase 0 — Foundations.** Mobile tokens (`--tap`, `--pad-x`, `--sheet-max-h`,
  safe-area vars) in `app.css`; `viewport-fit=cover`; `src/lib/mobile.svelte.js`
  (`screen.mobile` matchMedia store); `src/lib/sheet.js` (`lockScroll`). Shell
  gutter now uses `--pad-x` + top safe-area.
- ✅ **Phase 1 (partial) — Stop the bleeding.** City sheet is a true bottom sheet
  on phones (grab handle, safe-area padding, wrapped header actions, 44px-ish
  targets); event rows stack (overflow bug fixed); favorite heart is visible on
  touch. My-year overflow was solved by the Phase 3 rebuild rather than patched.
- ✅ **Phase 3 — My Year mobile rebuild.** `MyYear.svelte` now branches on
  `screen.mobile`: a vertical month list (empty months → full-width Add; filled
  stays render once across their range with a resize stepper + Remove), a
  read-only year-overview strip, compact route-stat pills, a Schengen pill, and
  a **bottom-sheet city picker** that reuses the pick logic via a shared snippet
  and **auto-advances** to the next open month after each add. Desktop board
  untouched. City sheet raised to z70 so cities opened from a picker row layer
  on top. Verified: build empty → filled with zero horizontal panning.

**Not yet done (follow-ups, in priority order):**

- ⏳ **Phase 2 — "Add to my year" bridge** (§5). Deliberately deferred: needs the
  route store lifted out of `MyYear` into a shared module so the city sheet/cards
  can write to it. Clean standalone task.
- ⏳ **Phase 1 remainder** — bump This-month segmented controls to 44px on touch
  (currently 32px; meets WCAG AA but below the 44px target).
- ⏳ **Phase 5** — fold Settings/About/Methodology/HowTo into one shared `Sheet`
  primitive (the city-sheet bottom-sheet CSS is the template).
- ⏳ **Phase 6** — header slimming / nav. (Decided **against** a bottom tab bar —
  see judgment notes below.)
- ⏳ **Phase 3.5** — "Auto-fill gaps" one-tap route suggestion (§4.6 #2).
- ⏳ **Phase 0 harness** (§3.5) — wire the overflow/tap-target asserts into CI.

**Judgment calls made during build (reasoned, not preference):**

- Single `MyYear.svelte` with template-level mobile/desktop branches instead of a
  `MyYearMobile`/`MyYearDesktop` file split — keeps one reactive core, avoids
  ~20 bindable props. The picker markup is shared between both via a `{#snippet}`.
- Kept header nav, no bottom tab bar — only two surfaces, and an app-y tab bar
  fights the editorial brand; primary *actions* already live in thumb-reach
  bottom sheets.
- Dropped the `MonthStrip` "interactive" prop from the plan — its cells are
  already `disabled` buttons when non-selectable, so they were never stray tap
  targets. (Don't fix non-problems.)
- Defaults locked: stay length **2**, picker **auto-advances**, table stays
  **demoted** (cards default on mobile).

---

## 0. TL;DR

Monsoon is a beautiful desktop app that has been *made to fit* on phones, not
*designed for* them. The data model and visual language (the month strip, warm
paper, the field-atlas tone) are already mobile-grade. What is not mobile-grade
is the **layout system**, the **touch ergonomics**, and above all the **"My year"
editor**, which preserves a desktop 12-month grid by trapping it in a horizontal
scroller — the single worst mobile moment in the product.

The fix is three things, in order:

1. **Stop the bleeding** — kill horizontal page overflow, raise every primary
   tap target to 44px, fix the city-sheet header and event rows.
2. **Rebuild "My year" mobile-first** — replace the horizontal timeline grid
   with a **vertical month list** plus a guided **fill-the-gap** flow and a
   bottom-sheet city picker. The desktop board stays for wide screens.
3. **Close the browse↔plan seam** — add "Add to my year" from the city sheet and
   cards so discovery actually flows into the itinerary.

Everything else (nav, modals, density, polish) hangs off those three.

---

## 1. Mobile Philosophy

These are the principles every mobile decision in this repo should be checked
against. They are deliberately opinionated.

### 1.1 The phone is the primary device, not the fallback

Slow travelers plan *while traveling* — on a phone, on a train, in a café. Treat
the ≤700px experience as a first-class design target with its own mechanics, not
a media-query afterthought that reflows the desktop DOM. It is fine for mobile
and desktop to render **different component trees** for the same data (Svelte
makes this cheap). "My year" should do exactly that.

### 1.2 One thumb, one column, one decision at a time

The dominant mobile posture is one-handed, thumb-on-the-bottom-third. So:

- **One primary column.** Multi-column grids (`.cols`, `.events`, `.bar-row`,
  `.rows li`) collapse to a single stacked column below 720px.
- **One decision per screen.** The desktop "My year" asks the user to choose a
  month *and* a duration *and* a city *and* read Schengen status all at once.
  On mobile, sequence those: pick the gap → pick the city → confirm.
- **Primary actions live in thumb reach** — the bottom third of the viewport.
  This is why the city picker and the "Add to year" confirm belong in a
  **bottom sheet**, not a top-of-page control bar.

### 1.3 Never scroll the page sideways

Horizontal scrolling of the *page* is the cardinal sin and it currently happens
on "My year" (a 560px timeline + a 432px control row push the document to
~458px at 360px wide). Horizontal scroll is allowed only when it is **contained,
intentional, and signposted** (e.g. a region chip rail with an edge fade). The
document itself must satisfy `scrollWidth <= innerWidth` at every breakpoint.

### 1.4 Touch targets: 44px is the floor for anything primary

Per Apple HIG (44×44pt) and Material (48×48dp); WCAG 2.5.8 AA is only 24px but
that is a legal minimum, not a usability target. Rule for this codebase:

- **Primary/standalone targets: ≥ 44×44 CSS px.** Add to year, month gap, sheet
  close, nav, segmented controls, the favorite heart when it is the only way to
  save.
- **Secondary visual cells may be smaller** *only when they are not the sole way
  to perform an action.* The 14px-tall month strip is fine as a **read-only data
  viz**; it is not fine as a set of tap controls. (Today `MonthStrip` cells are
  `<button>`s — on mobile they should be non-interactive in browse contexts.)
- Expand hit area with padding / `min-height` / a `::before` overlay, **not** by
  inflating the visible glyph. Keep the field-atlas density; grow the *target*.

### 1.5 Keep the planning context pinned

While the user scrolls a list of candidate cities, they must not lose: which
month/gap they're filling, the chosen stay length, and their Schengen budget.
On desktop these sit above the fold; on mobile they belong in a **persistent
header inside the picker sheet**, not scrolled away with the page.

### 1.6 Respect the system

- Use `100dvh` / `svh` / `dvh` and `env(safe-area-inset-*)` so sheets and any
  bottom nav clear the notch and the iOS home indicator.
- Honor `prefers-reduced-motion` (already done globally in `app.css:309`) for
  every new sheet/drag animation.
- Use native affordances: `navigator.share` already powers `shareOrCopy()`;
  keep leaning on it. Use `inputmode`/`type` correctly on inputs.
- Lock background scroll when a sheet is open (the city sheet already does this
  via `document.body.style.overflow` at `CitySheet.svelte:42`); standardize that
  into one helper so every sheet behaves identically.

### 1.7 Calm by default, density on demand

The brand is "data-rich without dashboard theater." On a phone, lead with the
one headline number + the strip + one finding (browse already does this well).
Hide power-user surfaces (the `CityTable`) behind an explicit opt-in on mobile;
don't make a horizontally-scrolling spreadsheet a default browse path.

---

## 2. Current-State Audit (grounded in the code)

Observed at 320 / 360 / 390 / 430 px. File references are real.

### 2.1 Global / shell

| Issue | Where | Note |
|---|---|---|
| Two-row wrapped header is cramped | `App.svelte:206` `.bar` (`flex-wrap`) | brand + 2 nav + "How it works" + gear all compete on one wrapped row |
| Gear target is ~38px | `App.svelte:384` `.util` (`padding:9px` around 20px icon) | below 44px |
| No bottom nav | — | the two primary surfaces (This month / My year) are top-of-page text buttons |
| Viewport meta OK | `index.html:5` | present; no `viewport-fit=cover` yet (needed for safe-area) |

### 2.2 My year — the priority problem

| Issue | Where | Severity |
|---|---|---|
| **Global horizontal overflow** | `MyYear.svelte` board + `.pickctl` | **P0** |
| Timeline forced to `min-width:560px` and put in an `overflow-x:auto` scroller | `MyYear.svelte:824-834` | desktop grid trapped on mobile |
| Search input fixed `width:200px` | `MyYear.svelte:1158` `.pickctl input` | overflows the row |
| Stay-length stepper + search don't stack | `.pickhead`/`.pickctl` | 432px row |
| Tiny editing controls inside `.stay`: `−`/`+` duration, `×` remove | `MyYear.svelte:925-968` | 30px only under `@media (hover:none)`, and visually cramped inside a ~46px cell |
| Month "gap" buttons are the only way to choose a start month and live inside the scroller | `MyYear.svelte:416-424` | must pan to reach later months |
| Candidate rows: name+score header + full-width strip + Add | `MyYear.svelte:625-662` | Add is 32px; strip is decorative but rendered as buttons |

The core defect is conceptual: **the mobile board is the desktop board, panned.**
The primary mobile task ("fill my open months with good cities") requires
horizontal panning before the user can even *see* the year. This view must be
rebuilt, not patched. See §4.

### 2.3 This month

| Issue | Where | Severity |
|---|---|---|
| Month picker becomes full-width 38px row (good) | `ThisMonth.svelte:466-469` | OK — keep |
| Filter chips horizontally scroll with edge fade (acceptable) | `ThisMonth.svelte:471-484` | OK as a rail, but no "Filters" sheet when many are active |
| Card grid `minmax(290px,1fr)` | `ThisMonth.svelte:628` | at 320px this is fine (1 col) but check 290 floor doesn't overflow at 312px content width |
| Sort/density segmented controls ~32px tall | `.seg` `ThisMonth.svelte:405-415` | below 44px |
| Favorite heart 30px and `opacity:0` until hover | `CityCard.svelte:65-91` | hover doesn't exist on touch → heart is invisible/unreachable on mobile |
| Strip cells are `<button>` even in cards | `MonthStrip.svelte`/`CityCard.svelte:45` | accidental tap targets, no action |

### 2.4 City sheet

| Issue | Where | Severity |
|---|---|---|
| Header action cluster (Save/Share/‹/›/×) ~29px tall, 6px gap, absolutely positioned top-right | `CitySheet.svelte:349-369` | **P1** cramped, sub-44px |
| Event rows use 4-col grid `70px 200px 1fr auto` | `CitySheet.svelte:541` | the 200px name col + blurb overflow the right edge on phones |
| `.bar-row` 3-col grid `104px 1fr 34px` | `CitySheet.svelte:471` | tight but tolerable; label col can be reduced |
| `.cols` already collapses at 720px | `CitySheet.svelte:464` | OK |
| Sheet is centered card with `4vh 16px` scrim padding | `CitySheet.svelte:318-347` | should become a full-height bottom/﻿full sheet on mobile with safe-area padding |
| **No "Add to my year"** | — | the browse↔plan seam (also in `TODO.md`) |
| `ScoreInfo` popovers as the only way to read cost/safety math | `CitySheet.svelte` inline `<ScoreInfo>` | tiny `i` triggers; verify they re-anchor on narrow screens |

### 2.5 Modals (Settings / About / Methodology / HowTo / RegionMenu)

Each implements its own overlay. `RegionMenu` uses the native `popover` API and
manually positions under the trigger (`RegionMenu.svelte:11-18`) — good, but
every other modal should share one mobile sheet behavior (full-height,
safe-area, scroll-lock, 44px close). They currently don't.

---

## 3. Foundations (do these first — they unblock everything)

### 3.1 A mobile token & utility layer in `app.css`

Add, near `:root`:

```css
:root {
  /* Touch ergonomics */
  --tap: 44px;              /* primary target floor */
  --tap-lg: 48px;           /* comfortable */
  --gap-tap: 8px;           /* min spacing between targets */

  /* Mobile rhythm */
  --pad-x: clamp(16px, 4vw, 26px);  /* page gutter, replaces fixed 26px */

  /* Sheets */
  --sheet-max-h: 92dvh;
  --safe-b: env(safe-area-inset-bottom, 0px);
  --safe-t: env(safe-area-inset-top, 0px);
}

/* Standard breakpoints — name them so every file uses the same lines */
/*  mobile:  <= 600px   (phones)              */
/*  compact: <= 720px   (large phones, split→stack)  */
/*  tablet:  <= 980px                              */
```

Add a shared touch rule so we stop re-declaring `min-height:30px` per component:

```css
@media (hover: none) and (pointer: coarse) {
  .tap,
  button.chip,
  .seg button,
  .segbtn,
  .navbtn { min-height: var(--tap); }
}
```

### 3.2 `viewport-fit=cover` for safe areas

`index.html:5` →
`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />`

### 3.3 One scroll-lock + sheet primitive

Extract the body-scroll-lock from `CitySheet.svelte:42-49` into a tiny shared
action so Settings/About/Methodology/HowTo and the new pickers all share it:

```js
// src/lib/sheet.js
export function lockScroll() {
  const prev = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => (document.body.style.overflow = prev);
}
```

Then a `<Sheet>` wrapper component (see §6) that all overlays adopt.

### 3.4 Make `MonthStrip` non-interactive in browse contexts

Add a prop `interactive = false`. When false (cards, candidate rows), render the
cells as `<div role="img" aria-label="…">` instead of `<button>`. Keep
`onselect` (the city-sheet "click a month") as the only interactive use. This
removes ~12 stray sub-44px tap targets per card.

### 3.5 Mobile audit harness (Phase 0 — keep from old plan)

A small Playwright/Vitest script that loads each surface at 320/360/390/430/768
and asserts:

- `document.documentElement.scrollWidth <= window.innerWidth` (no page overflow)
- every element matching a `[data-primary]` selector is ≥44×44
- open sheets pin background scroll and fit within `100dvh`
- no element's right edge exceeds the viewport

States to cover: This-month cards, This-month table, city sheet, My-year empty,
My-year with 2–3 stays, picker sheet open, refine open, region menu open,
settings, how-to. Run it in CI so layout regressions can't merge.

---

## 4. The "My year" Rebuild (the centerpiece)

### 4.1 Why rebuild, not patch

The desktop board encodes the year as **12 columns across**. That is a great
*overview* and a terrible *editor* on a 360px screen. The mobile mental model
should be **the year as a vertical scroll of months** — the same direction the
thumb already moves, no panning, each month a comfortable card.

Keep the desktop board for ≥700px. Below that, render a different tree.

### 4.2 New mobile information architecture

```
My year  (mobile, < 700px)
├── Sticky mini-header
│     ├── trip name (inline editable)        [single line, ellipsis]
│     ├── year overview strip (12 cells, READ-ONLY, tap → scroll to month)
│     └── route stat pills: avg score · avg $/mo · Schengen budget
│           (Schengen pill turns red/amber when at/over limit → taps to detail)
├── Month list  (12 vertical cards, Jan…Dec)
│     ├── EMPTY month card
│     │     "January — open"   [+ Add a city]   (full-width 48px primary)
│     ├── FILLED stay card (spans its month range, rendered ONCE)
│     │     ┌─────────────────────────────────────────┐
│     │     │ Lisbon ◆            score 84   ⋯ menu    │
│     │     │ Jan–Mar · 3 months · ~$2,400/mo          │
│     │     │ [read-only mini strip framed to Jan–Mar] │
│     │     └─────────────────────────────────────────┘
│     │     ⋯ menu → Resize · Change city · Open details · Remove
│     └── …
└── Bottom action bar (sticky, safe-area):  [ Auto-fill gaps ]  [ Share ]
```

Tapping **+ Add a city** on a month opens the **City Picker bottom sheet**
(§4.4) pre-scoped to that month and the default stay length. That is the whole
loop: see a gap → tap it → pick → it's filled → next gap.

### 4.3 The month list (component: `MyYearMobile.svelte`)

Render from the existing derived `occ` (`monthOccupancy`) so logic is shared.

- **Empty month** → a 56px card with the month name, a one-word season hint if
  cheap to compute, and a full-width `+ Add a city` button (`min-height:48px`).
- **Filled stay** → render the stay **once**, on its starting month, as a card
  that visually spans its range (show "Jan–Mar · 3 months"). Do **not** render a
  cell per month (the current `segments()` per-cell rendering is a board concept;
  drop it on mobile).
- Multi-month and Dec→Jan wrap: show as one card labeled with the range; the
  read-only mini-strip uses the existing `frameFrom/frameLen` framing.
- **Editing moves into a `⋯` menu / long-press**, not always-visible micro
  steppers. Menu actions: **Resize** (opens a stepper sheet or inline 1–6
  segmented control at 44px), **Change city** (reopens picker for that window),
  **Open details** (`onopen(key,{month})`), **Remove**.
- Reordering is *not* needed — months are fixed; the stay's position is its
  start month. This removes all drag complexity. (Resize is the only "drag-like"
  action, and it's a stepper, satisfying the single-pointer rule.)

### 4.4 The City Picker bottom sheet (component: `CityPickerSheet.svelte`)

This replaces the bottom half of today's `MyYear` (`controls` + `picker`,
`MyYear.svelte:508-663`) **on mobile**. It opens from a month's `+ Add` and is a
true bottom sheet with detents.

**Persistent sheet header (never scrolls):**
- Context line: **"Fill January"** or **"Fill Jan–Mar"** (reuse `windowLabel`).
- Stay length: segmented `1 2 3 4 5 6` (reuse `dur`), each cell ≥44px.
- Sort: `Highest score` / `Best value` (reuse `sortMode`).
- Schengen budget read-out when relevant (reuse `schLeft`/`sch`).
- A `Filters` button → opens the **Refine sub-sheet** (reuse the existing
  `filters`/`RegionMenu`/refine fields, but in sheet form, not an inline panel).
- Search input, **full-width** (`width:100%`, kill the `200px`).

**Scrollable candidate list:** reuse `pickerList` exactly. Each row:
- Whole row is the **details** affordance OR make the row primary = Add and a
  small "details" chevron — pick one (recommendation: **row body = open details,
  trailing 44px `+ Add` button = add**, matching desktop semantics so behavior
  is consistent). Tapping Add fills the month, closes the sheet (or advances to
  the next gap — see §4.6), and flashes the just-filled month card.
- Mini-strip is **read-only** here.
- One concise reason line under the name: score/value · cost · badges
  (Schengen ◆, swim ≋, festival ★, hazard ⚠). Reuse `whyNow`/`stripCells`.
- Schengen breach: keep the warn state (`breach`) — show an amber "◆ over
  90/180" inline and make the Add button the warn variant, exactly as today.

**Detents (snap points):** open at ~60% height (`half`), draggable up to ~92dvh
(`full`), drag-down-to-dismiss. **Provide a button alternative to the drag** (a
header grabber that cycles detents, or an explicit ✕) so the sheet is operable
without dragging (accessibility requirement). Lock background scroll.

### 4.5 The year overview strip (orientation, not editing)

Keep a **non-interactive** 12-cell strip pinned in the mini-header so the user
always sees the shape of their year (which months are filled, their bands).
Tapping a cell **scrolls the month list to that month** (cheap, no panning, no
editing). This preserves the signature primitive's *overview* value while moving
*editing* into the list. Frame the currently-targeted gap with the existing
`winmark`.

### 4.6 Guided "fill the gaps" flow

Two entry points, same engine:

1. **Manual:** tap a gap → picker → Add → on add, if `Auto-advance` is on, the
   sheet stays open and re-scopes to the *next* open month (today's `addStay`
   already computes `selStart` for the next gap at `MyYear.svelte:268-269` — reuse
   it). The user fills the year in a rhythm without closing the sheet.
2. **Auto-fill gaps** (bottom action bar): a one-tap suggestion that fills every
   open month with the top-ranked passing city for that window, respecting stay
   length, filters, and Schengen. This is the mobile expression of the
   `TODO.md` "automatic itinerary picker." Show it as a **preview** the user can
   accept/▼adjust, never a silent overwrite. (v1 can be greedy: walk gaps left→
   right, place the highest-`pickerList` city that doesn't breach Schengen.)

### 4.7 Schengen on mobile

The desktop `schline` (`MyYear.svelte:465-486`) is a wrap-prone horizontal row.
On mobile, collapse it to a single **stat pill** in the mini-header:
`◆ 62/90 days` colored amber/red at limit/over. Tapping it opens a small detail
sheet explaining the worst window and what to change (reuse `flagNonSchengen`'s
intent: deep-link into the non-Schengen filter inside the Refine sub-sheet).

### 4.8 What stays shared between mobile and desktop

To avoid two diverging logics, keep **all derivations in `MyYear` / `data.svelte.js`**
(`occ`, `stats`, `sch`, `pickerList`, `addStay`, `resizeStay`, `removeStay`,
`prospect`, `windowLabel`, `filteredCities`). The mobile components are **pure
presentation** that call those. Concretely:

- `MyYear.svelte` becomes a thin container that branches on a `matchMedia`
  store: `{#if mobile}<MyYearMobile …/>{:else}<MyYearDesktop …/>{/if}` (move the
  current board markup into `MyYearDesktop.svelte` unchanged).
- New: `MyYearMobile.svelte`, `CityPickerSheet.svelte`, `RefineSheet.svelte`,
  `Sheet.svelte` (primitive).

### 4.9 Acceptance for My year (mobile)

- No horizontal page scroll at 320–430px in empty / partial / full / shared /
  Schengen-over states.
- Build empty → 6 months filled with **zero horizontal panning**.
- Add a city from the picker in **one tap** once the sheet is open.
- Every edit control (Add, gap, resize stepper, ⋯ menu items, close) ≥44px.
- Overview strip taps scroll to month; never required for editing.
- Shared-route preview and "Save a copy" work in the mobile layout.

---

## 5. Browse↔Plan bridge ("Add to my year")

This is the highest-leverage *product* fix and it's independent of layout, so it
can land early. (Also the top `TODO.md` priority.)

- **City sheet:** add a primary **"Add to my year"** button in the action area.
  Adds `{ key, start: month, len: defaultLen }` to the route using the existing
  stay shape and `addStay` placement logic. On overlap, route to My year's
  conflict state rather than failing silently.
- **Card (when planning):** expose an add affordance on cards only when it's
  contextually useful (active route, or a "plan mode" toggle) so browse stays
  calm by default.
- Wire it through `App.svelte` so the route store (`atlas.route.v1`) is updated
  from either surface; show a small confirming toast ("Added Lisbon to Jan") with
  an Undo and a "View year" link.
- Default stay length decision: **2 months** (matches `dur` default) unless the
  user has a saved preference. (Open decision — see §9.)

---

## 6. Sheets & modals — standardize (`Sheet.svelte`)

One primitive, adopted by City sheet, Settings, About, Methodology, HowTo,
CityPicker, Refine:

- Mobile (≤700px): full-width **bottom sheet** anchored to the bottom edge, max
  height `var(--sheet-max-h)` (`92dvh`), padding-bottom `calc(16px + var(--safe-b))`,
  rounded top corners, a grab handle, and a 44px ✕.
- Desktop: keep the current centered-card / scrim presentation.
- Always: focus-trap, `Escape` to close, scroll-lock via §3.3, `aria-modal`,
  return focus to the trigger on close (City sheet already does most of this —
  generalize it).
- City sheet specifics:
  - Header: top row = `← Monsoon` (back) + ✕; a **sticky bottom action row** for
    Save / Share / **Add to year** (full-width, 44px); move ‹ › prev/next to
    larger buttons or a swipe gesture (with button fallback).
  - Event rows (`CitySheet.svelte:539-547`): below 720px switch the 4-col grid to
    a stacked two-line row — line 1: month chip + name + `major` badge; line 2:
    blurb. No fixed `200px` column.
  - `.bar-row` label column: reduce from 104px or wrap on very narrow screens.

---

## 7. Navigation & shell

- **Bottom tab bar on mobile** for the two primary surfaces (This month / My
  year), with safe-area padding. Move brand + gear + "How it works" into a
  slimmer top bar (brand left, gear right; "How it works" into an overflow or
  the settings sheet). This de-clutters the wrapped two-row header
  (`App.svelte:206`) and puts navigation in thumb reach.
- Keep the brand strip wordmark (`.brandstrip`) — it's signature and small.
- Route status chip: when a route exists, show a tiny "year in progress" chip on
  This month that jumps to the next open month's picker (ties browse to plan).
- `--pad-x` replaces the fixed `18px 26px` shell padding (`App.svelte:276`) so
  gutters shrink gracefully to 16px on small phones.

---

## 8. Phased build order

Each phase is independently shippable and leaves the app better than before.

**Phase 0 — Harness & foundations** (§3)
Audit script in CI; mobile tokens; `viewport-fit=cover`; scroll-lock + `Sheet`
primitive; `MonthStrip` `interactive` prop. *No visible change; unblocks rest.*

**Phase 1 — Stop the bleeding** (P0/P1)
- Kill My-year page overflow: contain the board scroller, stack `.pickhead`/
  `.pickctl`, search `width:100%`.
- Raise all primary targets to 44px via the §3.1 rule.
- City-sheet header + event-row mobile layout.
- Favorite heart visible on touch (drop `opacity:0` under `hover:none`).
*After this, the app is usable on phones even before the My-year rebuild.*

**Phase 2 — Add to my year bridge** (§5)
City sheet + card → route. Toast + undo. Closes the prototype seam.

**Phase 3 — My year mobile rebuild** (§4)
Split into `MyYearMobile` / `MyYearDesktop`; build month list + `CityPickerSheet`
+ overview strip + Schengen pill. Keep desktop board untouched.

**Phase 4 — Guided fill + auto-fill** (§4.6)
Auto-advance in the picker; one-tap Auto-fill with preview/accept.

**Phase 5 — Sheets/modals standardization** (§6)
Migrate Settings/About/Methodology/HowTo to `Sheet`. Mobile city sheet → bottom
sheet. Refine becomes a sub-sheet on mobile.

**Phase 6 — Navigation** (§7)
Bottom tab bar, slim top bar, route status chip.

**Phase 7 — Polish & QA** (§10)
Typography, clipping, table-as-advanced, full viewport sweep, Lighthouse.

---

## 9. Open decisions

1. **Default mobile stay length** when adding from browse / a gap: 1, 2, or 3
   months? (Recommendation: 2, matching `dur`.)
2. **Auto-advance** the picker after each Add, or close it? (Recommendation:
   on, with a visible toggle.)
3. **Table view on mobile**: hide below 600px, or keep as an explicit "advanced"
   toggle with contained scroll + sticky first column? (Recommendation: keep but
   demote — cards default, table opt-in.)
4. **Bottom nav vs. header nav** on mobile. (Recommendation: bottom nav.)
5. **Add-from-card** always visible, or only in a "plan mode" / when a route
   exists? (Recommendation: only when a route exists, to keep browse calm.)
6. **Picker as bottom sheet vs. full-screen route** on small phones. (Sheet with
   a full detent is recommended; full-screen if focus-trapping a sheet proves
   fiddly.)

---

## 10. Acceptance criteria (the bar for "mobile-ready")

True at 320, 360, 390, and 430 px:

- [ ] No global horizontal scrolling on any primary state.
- [ ] Every primary control ≥ 44×44 CSS px with ≥8px spacing.
- [ ] No text overlap/clipping in cards, rows, sheets, filters, modals.
- [ ] Build empty → ≥6 months filled with **no** horizontal panning.
- [ ] A browse-found city → My year in **≤2 taps** from the city sheet.
- [ ] Empty / partial / full / shared / Schengen-over routes all read well.
- [ ] Filters openable, changeable, resettable without hidden tiny controls.
- [ ] City details readable & closable one-handed; safe-area respected.
- [ ] Native share/copy works from city sheet and route share.
- [ ] All sheets lock background scroll, fit `100dvh`, have a 44px close, and
      are operable without a drag gesture.
- [ ] Lighthouse mobile: no critical tap-target/viewport/contrast flags.
- [ ] CI audit harness (§3.5) green at all five widths.

---

## 11. File-by-file change map (quick reference)

| File | Change |
|---|---|
| `index.html` | `viewport-fit=cover` |
| `src/app.css` | mobile tokens (§3.1), touch-target rule, `--pad-x` |
| `src/lib/sheet.js` *(new)* | `lockScroll`; detent helpers |
| `src/lib/Sheet.svelte` *(new)* | shared bottom-sheet primitive (§6) |
| `src/lib/MonthStrip.svelte` | `interactive` prop → render non-button cells in browse |
| `src/lib/MyYear.svelte` | become container: branch mobile/desktop, keep all derivations |
| `src/lib/MyYearDesktop.svelte` *(new)* | current board markup, unchanged |
| `src/lib/MyYearMobile.svelte` *(new)* | vertical month list + overview strip + Schengen pill (§4) |
| `src/lib/CityPickerSheet.svelte` *(new)* | bottom-sheet candidate picker (§4.4) |
| `src/lib/RefineSheet.svelte` *(new)* | filters as a mobile sub-sheet |
| `src/lib/CitySheet.svelte` | bottom-sheet on mobile, sticky action row, "Add to year", stacked event rows |
| `src/lib/CityCard.svelte` | heart visible on touch; optional add affordance; non-interactive strip |
| `src/lib/ThisMonth.svelte` | 44px segmented controls; "Filters" sheet when many active; route status chip |
| `src/lib/App.svelte` | bottom tab nav, slim top bar, `--pad-x`, route→add wiring |
| `src/lib/Settings/About/Methodology/HowTo.svelte` | adopt `Sheet` primitive |
| `tests/mobile-audit.*` *(new)* | the §3.5 harness |

---

## Sources / references for the standards cited

- Touch targets — Apple HIG 44×44pt, Material 48×48dp, WCAG 2.5.8 (AA, 24px) /
  2.5.5 (AAA, 44px): [WCAG 2.5.8 guide (TestParty)](https://testparty.ai/blog/wcag-2-5-8-target-size-minimum-2025-guide),
  [Target Size glossary (WebAbility)](https://www.webability.io/glossary/target-size)
- Bottom sheets — detents, drag handle + single-pointer alternative, focus on
  open, 44px targets + 8px spacing: [Material 3 bottom sheets accessibility](https://m3.material.io/components/bottom-sheets/accessibility),
  [Bottom Sheet UI best practices (Mobbin)](https://mobbin.com/glossary/bottom-sheet),
  [Designing bottom sheets (LogRocket)](https://blog.logrocket.com/ux-design/bottom-sheets-optimized-ux/)
