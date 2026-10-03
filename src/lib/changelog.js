// Methodology changelog, newest first. Real, shipped changes only — each entry
// should point at something a reader could notice. The methodology page shows
// the version, the newest date as "last updated", and these entries.
export const METHOD_VERSION = 'v5';

export const CHANGELOG = [
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
