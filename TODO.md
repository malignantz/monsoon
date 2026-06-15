# Monsoon TODO

Last consolidated: 2026-06-15.

## Itinerary Saving And Sharing

- [ ] Add names to saved itineraries in local storage.
  - Store a route name alongside `atlas.route.v1`, with migration from the current bare stays array.
  - Show an editable trip-name field in My year.
  - Use a sensible default like "My Monsoon year" until named.
- [ ] Add itinerary names to shared links.
  - Emit a decorative `n` query param alongside `?i=...`.
  - Decode and display the shared name in read-only preview.
  - Keep route decoding independent of the name so old links still work.
- [ ] Add mobile native sharing.
  - Use `navigator.share({ title, text, url })` when available and fall back to clipboard copy.
  - Reuse current city and itinerary URL builders.
- [ ] Add export options for a planned year.
  - Copyable text summary.
  - Print stylesheet for the itinerary board.

## My Year And Planning Flow

- [ ] Build an "Add to my year" bridge from browse/city sheet into My year.
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
- [ ] Add card-to-sheet continuity polish.
  - Try a progressive `view-transition-name` treatment for city names or hero elements.

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

- [x] Compact shareable itinerary links with frozen v1 city IDs.
- [x] Read-only shared-route preview with Save a copy and Dismiss.
- [x] City deep links with `?city=<key>`.
- [x] Month-aware swimmable filtering.
- [x] Major design pass covering P0/P1/P2/P4 and the first two P3 items from `design_updates.MD`.
- [x] Route template chips removed from My year.
- [x] Schengen tracker redesigned visually.
