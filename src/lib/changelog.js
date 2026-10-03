// Methodology changelog, newest first. Real, shipped changes only — each entry
// should point at something a reader could notice. The methodology page shows
// the version, the newest date as "last updated", and these entries.
export const METHOD_VERSION = 'v6';

export const CHANGELOG = [
  {
    date: '2026-10-03',
    title: 'Antalya added; corrections to the newest cities',
    body:
      'Antalya joins the catalog (121 cities). Its PM2.5 comes from the Turkish national network’s ' +
      'urban-background monitor for 2020–2025, as reported to the European Environment Agency, because ' +
      'the model and the single WHO traffic-station figure disagreed too much to use. A review of the ' +
      'nine cities added earlier the same day fixed a few notes and event descriptions (Almaty’s Medeu ' +
      'rink is closed for reconstruction; Izmir’s summer festival is classical music, not jazz). No ' +
      'scores changed.'
  },
  {
    date: '2026-10-03',
    title: 'Event scores now come from the visible event calendar',
    body:
      'The Events score used to read a separate month-by-month list that could disagree with the ' +
      'calendar on each city sheet (Zurich’s Street Parade was scored in July but listed in August). ' +
      'Each month now scores the biggest event the calendar shows for it, so the two cannot drift ' +
      'apart. 16 month mix-ups were checked against official or press sources and fixed, movable ' +
      'feasts such as Tết, Carnival and Easter now count in both months they can fall in, eight ' +
      '“major” labels were lowered and two raised, and season descriptions that were not events ' +
      'were removed. 322 city-months changed event tier.'
  },
  {
    date: '2026-10-03',
    title: 'Climate and air now come from measured and modelled data (methodology v6)',
    body:
      'Day and night temperature, humidity and rain days now come from WMO 1991–2020 weather-station ' +
      'normals where a station is within 35 km and 200 m of the city, and from ERA5 reanalysis elsewhere. ' +
      'PM2.5 follows the CAMS model’s seasonal pattern, scaled to each city’s WHO ground-monitor annual ' +
      'mean, with cited monitor data for Chiang Mai’s burning season and Skopje and Sarajevo winters. ' +
      'Where a new figure could not be verified, the previous estimate is kept and labelled as an ' +
      'editorial estimate: 107 city-metrics (940 of 6,660 city-months). Rankings shifted, mostly through ' +
      'rain days and air quality. Each city sheet names the station or model behind its numbers.'
  },
  {
    date: '2026-10-03',
    title: 'My year counts days per country',
    body:
      'Beside the Schengen meter, My year now adds up real days in each country across your planned ' +
      'year and notes any country at 183 days or more, a common tax-residency mark (rules vary by ' +
      'country). Starter years never cross it. It is a planning signal, not tax advice.'
  },
  {
    date: '2026-10-03',
    title: 'Schengen days are counted as real days',
    body:
      'The 90/180 check used to count every month as 30 days and treated exactly 90 as compliant, ' +
      'so three summer months (92 real days) read as "at the limit". It now counts real month ' +
      'lengths across every rolling 180-day window, and calls 1–2 days over "tight" rather than fine.'
  },
  {
    date: '2026-10-03',
    title: 'Removed claims the site could not back up',
    body:
      'The methodology and city sheet described travel-advisory badges, UK FCDO advisories and hero ' +
      'photography that the site does not show. Those lines are gone, and the Livability lens is ' +
      'now described correctly: it ignores season and events.'
  }
];

export const LAST_UPDATED = CHANGELOG.map((e) => e.date).sort().at(-1) ?? null;
