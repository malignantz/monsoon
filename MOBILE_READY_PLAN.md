# Mobile-Ready Plan

Last updated: 2026-06-17

## Goal

Make Monsoon feel intentionally designed for phones, especially during itinerary planning. The mobile app should not be a squeezed desktop surface. It should support one-handed scanning, clear month/stay selection, comfortable tap targets, no accidental horizontal page scrolling, and a planning flow that connects discovery to "My year" without forcing users to jump between views.

## Current Mobile Findings

Observed at 390x844 and 360x740 browser viewports.

- `My year` currently creates global horizontal overflow on narrow screens. At 360px wide, the document expands to about 458px. The main causes are the 560px itinerary timeline and a 432px picker control row containing stay length plus search.
- The itinerary board preserves the desktop 12-month grid by putting it in a horizontal scroller. That keeps the desktop model intact, but it makes the primary mobile task harder: users must pan the board before they can understand or edit the full year.
- Several real controls are below comfortable mobile target size: settings gear width, filter chips, month buttons, stay-length buttons, plus month cells, favorite buttons, sheet navigation buttons, and route add controls.
- The city sheet has mobile-specific overflow in the events section. Event rows still use a desktop multi-column grid, so blurbs and the "major" badge can spill past the right edge.
- City sheet header actions are clustered into a dense desktop toolbar. Save, share, previous, next, and close sit around 29px tall with little spacing.
- Browse cards fit the viewport better than `My year`, but card internals rely on tiny month-strip buttons and a 30px favorite target. Those may be acceptable as secondary/tiny data visuals only if the full card remains the primary action and month-strip taps are not required.
- Filters are horizontally scrollable on mobile. This prevents wrapping explosions, but important controls can be hidden off-screen without a stronger affordance or a simpler mobile filter pattern.
- Table density exists on mobile, but it is inherently desktop-like. A horizontally scrolling table should be treated as an advanced/secondary view, not a default mobile browsing path.
- The existing TODO already identifies a major mobile product gap: browse and plan are separate islands. The city sheet has save/share but no "Add to my year", so mobile users must switch views, re-find the month, and search again.

## Product Principles

- Mobile planning should be stepwise, not grid-first. The phone flow should ask "what month or gap are you filling?" and then show the best candidates for that slot.
- Every primary tap target should be at least 44x44 CSS pixels. Secondary visual cells can be smaller only when they are not the only way to perform an action.
- Horizontal scrolling should be contained and intentional. The page itself must never overflow horizontally.
- The selected planning context should stay visible: current month/gap, stay length, route progress, and active filters should not disappear while users scroll through candidates.
- The mobile city sheet should behave like a focused task surface: inspect, save, share, add to year, change month, then close.
- Browse and plan should share data and actions. A city found in browse should be addable to the itinerary from the card or sheet without re-searching.

## Phase 0: Mobile Audit Harness

Build a repeatable way to catch regressions before changing layouts.

- Add responsive checks for widths: 320, 360, 390, 430, 768.
- Check these states: `This month` cards, `This month` table, city sheet, `My year` empty route, `My year` with 2-3 stays, refine panel open, region menu open, settings, how-to/about/methodology modals.
- Add automated assertions for:
  - `document.documentElement.scrollWidth <= window.innerWidth`
  - no visible element unintentionally crossing the viewport edge
  - primary actions meet 44x44 target size
  - sticky/fixed bars do not cover interactive content
  - modals lock background scroll and fit within viewport
- Keep a short manual QA checklist for overlapping text, clipped labels, and awkward horizontal scroll affordances.

## Phase 1: Stop The Bleeding

These are the fixes that make the app usable on phones quickly.

- Remove global horizontal overflow on `My year`.
  - Ensure `.boardscroll` contains the 560px timeline instead of allowing the page to widen.
  - Make `.pickhead` and `.pickctl` stack on mobile.
  - Make search input width `100%` inside the picker rather than fixed `200px`.
- Increase minimum touch targets.
  - Set a shared mobile target rule for chips, segmented controls, icon buttons, sheet buttons, add buttons, and month picker buttons.
  - Preserve compact visual styling by expanding hit area with padding/min-size, not just larger text.
- Fix city sheet mobile overflow.
  - Convert event rows to a one-column or two-line layout below 720px.
  - Put month, event name, badge, and blurb into a stacked mobile row.
- Rework city sheet header actions on mobile.
  - Use a top row with Back/Close.
  - Move Save/Share/Add to year into a sticky or full-width action row.
  - Move Previous/Next to larger icon buttons or swipe/secondary controls.
- Make filters readable on phones.
  - Keep top-level chips scrollable if needed, but give them 44px height.
  - Consider replacing horizontal filter chips with a single `Filters` bottom sheet when more than 3 controls are active.

## Phase 2: Mobile-First Itinerary Builder

This is the core product work. The itinerary selection flow should be rebuilt around phone behavior.

- Add an "Add to my year" bridge from browse and city sheet.
  - From city sheet: add the city for the currently viewed month with default stay length.
  - From browse card: expose a clear add action only when the user is planning, favoriting, or has an active route.
  - On conflict, route to a mobile conflict resolver rather than silently failing.
- Replace the mobile 12-month editing grid with a vertical itinerary list.
  - Show months as stacked cards: `Jan`, `Feb`, etc.
  - Empty month card: primary action `Add city`.
  - Filled stay card: city, duration, score/cost, remove, resize.
  - Multi-month stays should render as one stay card with a month range, not many tiny cells.
- Keep a compact year overview above the list.
  - Use a non-interactive 12-cell strip for orientation.
  - Tapping a month scrolls to that month card.
  - Avoid requiring horizontal panning for core edits.
- Create a guided "fill gap" flow.
  - Step 1: choose month/gap.
  - Step 2: choose duration.
  - Step 3: choose city from filtered recommendations.
  - Step 4: confirm/add, then advance to the next open month.
- Make candidate rows mobile-native.
  - Row primary action should be the whole row or a 44px `Add` button.
  - Month strip in candidate rows should be a visual summary, not a set of tiny controls.
  - Show one concise reason line: score/value, cost, Schengen, swim/festival/hazard badges.

## Phase 3: Navigation And Information Architecture

- Consider mobile bottom navigation for `This month` and `My year`.
  - Header can keep brand/settings/help, while the bottom nav owns the two primary surfaces.
  - This reduces the crowded two-row header currently seen on phones.
- Make route state persistent and obvious.
  - If the user has a route, surface a small route status chip in browse: months filled, next empty month, average score.
  - Let that chip jump directly to the next planning action.
- Treat table view as desktop-first.
  - Keep it available on mobile if useful, but default to cards/list.
  - Add a warning-free mobile table state with contained horizontal scroll and sticky first column only.

## Phase 4: Mobile Sheets And Modals

- Standardize all modal/sheet behavior.
  - Use `100dvh` or safe-area-aware max height.
  - Use full-width bottom sheet or full-screen sheet under small breakpoints.
  - Provide a consistent close target of at least 44x44.
  - Prevent background content from appearing in accessibility/tap target audits while a modal is open.
- Convert settings, how-to, about, and methodology to the same mobile modal pattern.
- Make popovers mobile-safe.
  - `ScoreInfo` popovers should become inline disclosure or centered sheet content on narrow screens.
  - Avoid tiny `i` buttons as the only way to read critical explanation.

## Phase 5: Visual Polish And Content Density

- Tighten mobile typography.
  - Keep hero-size type only for true page headings.
  - Make card and sheet headings wrap gracefully at long city names.
- Audit text clipping.
  - Long city names: `Las Palmas (Gran Canaria)`, `Funchal (Madeira)`.
  - Long event blurbs.
  - Long country/region labels and Schengen warnings.
- Reduce competing controls above the fold.
  - On `This month`, consider collapsing density switcher and secondary filter controls behind one compact control row.
  - On `My year`, prioritize board/list, stay length, and search over route stats.
- Recheck color and badge legibility under small sizes.

## Phase 6: Acceptance Criteria

Mobile-ready means all of the following are true at 320px, 360px, 390px, and 430px widths:

- No global horizontal scrolling on any primary state.
- Primary controls are at least 44x44 CSS pixels.
- Text does not overlap or clip in cards, rows, sheets, filters, or modals.
- The itinerary can be built from empty route to at least six months filled without needing desktop-style horizontal panning.
- A city found in browse can be added to `My year` in two taps or fewer from the city sheet.
- Empty, partial, full, shared, and Schengen-over-limit routes all have readable mobile states.
- Filters can be opened, changed, understood, and reset on a phone without hidden tiny controls.
- City details can be read and closed comfortably with one hand.
- Native share/copy still works from city sheet and route sharing.
- Lighthouse/mobile accessibility checks do not flag critical tap target or viewport issues.

## Suggested Build Order

1. Add audit harness and document current failures.
2. Fix global overflow and obvious sub-44px primary controls.
3. Fix city sheet mobile header and event overflow.
4. Build the mobile vertical itinerary list while keeping the existing desktop board.
5. Add `Add to my year` from city sheet and browse.
6. Replace mobile candidate rows with task-focused add rows.
7. Standardize modal/sheet behavior across the app.
8. Run full viewport QA and polish copy/layout edge cases.

## Open Decisions

- Should mobile use a bottom nav for `This month` and `My year`, or keep the current header navigation?
- Should the mobile itinerary list replace the board entirely below 700px, or should users be able to switch between list and timeline?
- What is the default mobile stay length: 1 month, 2 months, or user preference?
- When a user taps `Add to my year` from a city sheet, should the app add immediately or open a month/duration confirmation sheet?
- Should table view be hidden below a certain width, or retained as an advanced mode?
