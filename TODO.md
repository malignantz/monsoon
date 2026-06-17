# Monsoon TODO

Last consolidated: 2026-06-15 (sharing + itinerary-naming pass).

## Itinerary Saving And Sharing

- [ ] Redesign first-time shared itinerary landing.
  - If a visitor opens a shared itinerary with no local itinerary yet, treat the shared route as their starting state instead of requiring an immediate "Save a copy" click.
  - Add light intro copy that explains they are viewing someone's shared year and can edit it as their own.
  - Keep a clear distinction between read-only preview for returning users and auto-adopt/onboarding for first-time users.
  - Decide whether the primary action should be "Start with this trip", "Customize this trip", or silent adoption with an undo/dismiss affordance.
- [ ] Add export options for a planned year.
  - Copyable text summary.
  - Print stylesheet for the itinerary board.

## My Year And Planning Flow

- [ ] Build a favorites-based itinerary builder.
  - Let users turn their saved cities into a year plan without starting from a blank board.
  - Use favorites as the candidate pool for automatic route generation, month-by-month ranking, and swap suggestions.
  - Support constraints like region balance, Schengen limits, budget, weather minimums, event preference, and stay length.
  - Show why each favorite belongs in a given month, including score drivers, season, events, cost, and visa pressure.
  - Offer multiple route styles: best quality, best value, festival-heavy, slow/low-travel, and non-Schengen-first.
  - Make it easy to lock favorite stays, fill gaps, and compare generated routes before adopting one.
- [ ] Build an "Add to my year" bridge from browse/city sheet into My year. **(Priority — completeness gap.)**
  - Today browse and plan are two islands: the city sheet has Save + Share but no way to
    add the city to My year, so a user who finds a great city must switch tabs, find the
    month, and re-search for it by hand. This seam is the app's most "prototype, not
    product" moment and should be closed before further feature work.
  - Add the viewed city at the viewed month with a sensible default duration.
  - Reuse My year's existing stay shape: `{ key, start, len }`.
  - On overlap, place what can be placed or route the user to My year to resolve the collision.
- [ ] Improve the automatic itinerary picker.
  - Account for realistic routing and travel burden beyond straight-line distance.
  - Support fixed anchors such as "I must be in Europe in June."
  - Explain why suggested routes win.
  - Add a lock/fill interaction where the planner fills around fixed stays.
- [ ] Make visa/passport constraints actionable in route building.
  - User settings already store `passport`; city sheets already show visa rows.
  - My year should flag or prevent stays beyond passport-specific visa-free windows.
  - Keep Schengen as a special rolling-window rule.

## Browse And Discovery

- [ ] Create first-class gem vs anchor comparison objects.
  - Generate `gem x anchor x month` comparisons such as "Plovdiv beats Barcelona in June."
  - Use them for share cards, SEO pages, and zero-input discovery.
- [ ] Add a compare tray.
  - Let users pick 2-3 cities and compare month strips and key bars side by side.
- [x] Add card-to-sheet continuity polish.
  - Shared-element view transition: the city title morphs card → sheet (and back),
    with the scrim/page crossfading behind it. ←/→ stepping crossfades the title
    between cities. Gated on `startViewTransition` support and reduced-motion.

## Data And Scoring

- [ ] Create a comprehensive visa information plan.
  - Define the user-facing scope before restoring visa details to city views.
  - Cover passport-specific rules, e-visas/arrival cards, extensions, Schengen rolling windows, and source freshness.
  - Decide which visa signals belong in discovery, city detail, and My year validation.
- [ ] Decide whether cost should become part of the headline score or remain a Best Value lens only.
  - Current model keeps Top Pick cost-free and uses Best Value for Top Pick relative to cost.
  - Product positioning leans hard on livability per dollar, so the default ranking may eventually need to become more budget-aware.
- [ ] Research resident-livability dimensions that are not yet scored.
  - Healthcare access/quality.
  - Connectivity and coworking reliability.
  - Longer-stay visa friction.
- [ ] Keep refining swimmable-water data.
  - The app now has month-aware swim data and filters.
  - Future enhancement: show month-strip swim indicators where useful.

## UI Polish

- [ ] Revisit non-blocking coachmarks only if discovery proves weak.
  - Favorites and methodology are currently expected to be discoverable.
  - Any future coaching should be contextual, dismissible, and tied to a relevant action.

## Done Or Consumed

- [x] Mobile native sharing — `shareOrCopy()` uses `navigator.share` when available and falls back to clipboard copy; wired into both the city sheet and My year route share.
- [x] Named saved itineraries — `atlas.route.v1` stores `{ name, stays }` and migrates the legacy bare array as unnamed; inline-editable trip-name field under the My year headline (auto-sizing input, always-on dotted-underline affordance, autofill disabled).
- [x] Itinerary names in shared links — share link carries a decorative `n` param alongside `?i=...`; read-only preview displays the name and "Save a copy" adopts it; route decoding ignores `n` so old links still resolve.
- [x] Compact shareable itinerary links with frozen v1 city IDs.
- [x] Read-only shared-route preview with Save a copy and Dismiss.
- [x] City deep links with `?city=<key>`.
- [x] Month-aware swimmable filtering.
- [x] Major design pass covering P0/P1/P2/P4 and the first two P3 items from `design_updates.MD`.
- [x] Route template chips removed from My year.
- [x] Schengen tracker redesigned visually.
