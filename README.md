# Monsoon.fyi

Monsoon is a seasonal migration planner for slow travelers, digital nomads, and expatFIRE people deciding when to be where. Nomad List tells you where; Monsoon tells you when.

The product scores 111 cities month by month across weather, air quality, safety, seasonality, events, and cost. The core use case is a traveler who can stay somewhere for one to three months and wants a year that is livable, affordable, and compliant with Schengen 90/180 constraints.

## Product Shape

- This month: ranked cards/table answering "Where should I be in this month?"
- City sheet: deep detail for one city and selected month.
- My year: editable itinerary builder with local storage, shareable URLs, and a Schengen meter.
- Explore: dense table for power users.

The month strip is the signature primitive: 12 cells, one per month, colored by Top Pick band. It appears on browse cards, city sheets, and route-picking rows.

## Brand And UI

Monsoon should feel like a modern field atlas: measured, trustworthy, well-traveled, and data-rich without dashboard theater. Use warm paper surfaces, near-black olive ink, restrained terracotta markings, Schengen blue only for Schengen concepts, Fraunces for display, Schibsted Grotesk for body, and Spline Sans Mono for comparable numbers.

Avoid SaaS dashboard cliches, primary map navigation, side-by-side Top Pick and Best Value numbers on cards, and methodology math on browse surfaces. Browse should stay calm: one headline number, the strip, one plain finding.

## Scoring Snapshot

Top Pick is computed from stored component scores using the current default lens:

```text
Top Pick = SafetyFloor * (0.35 Weather + 0.24 Safety + 0.18 Air + 0.13 Season + 0.10 Events)
```

The app can re-weight client-side with Optimize for lenses:

- Top Pick: default balanced model.
- Livability: weather, safety, and air only, with a small peak-season deduction.
- High season: events and season get more weight while preserving guardrails.

Best Value is a unitless Top Pick-versus-cost index:

```text
Best Value = Top Pick / (monthly couple cost / 1000) ^ value_cost_exponent
```

Cost is itemized from `data/cost-evidence/*.json`, party-scaled from a solo nomad anchor, and seasonally adjusted on rent only.

Safety is a custom v3 index: homicide-anchored violent safety, hand-set property safety, and a visitor-risk modifier. Advisory levels are badges, not score ceilings. Women's safety is displayed separately and can be blended into safety through user settings.

## Data And Build Notes

- Svelte + Vite SPA, no backend.
- `data/travel-data.json` is split into generated runtime files under `src/generated/`.
- Route state persists in `localStorage` as `atlas.route.v1`.
- Shared routes emit compact `?i=<base64url>` URLs using frozen city IDs in `src/lib/cityIds.v1.js`.
- Run `npm run check:ids` when cities are added.

## Active Work

See `TODO.md` for the consolidated live backlog.
