// Prints a summary of first-party events from Analytics Engine (dataset
// monsoon_events), for host monsoon.fyi only. Writes no files.
//
//   CF_ACCOUNT_ID=… CF_API_TOKEN=… npm run report:events [days=7]
//
// The token needs "Account Analytics: Read". Data points: blob1 event, blob2 city,
// blob3 month, blob4 from, blob5 surface, blob6 style, blob7 host, blob8 path.
// Counts use SUM(_sample_interval) so sampled data stays honest.
const { CF_ACCOUNT_ID, CF_API_TOKEN } = process.env;
if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  console.error('Set CF_ACCOUNT_ID and CF_API_TOKEN (Account Analytics Read) in your shell first.');
  process.exit(1);
}
const days = Math.max(1, Math.min(90, Math.floor(Number(process.argv[2] ?? 7)) || 7));
const HOST = process.env.REPORT_HOST ?? 'monsoon.fyi';
const WHERE = `blob7 = '${HOST.replace(/[^a-z0-9.-]/gi, '')}' AND timestamp > NOW() - INTERVAL '${days}' DAY`;

async function sql(query) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/analytics_engine/sql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
    body: query
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Analytics Engine SQL ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).data ?? [];
}

const table = (title, rows, cols) => {
  console.log(`\n${title}`);
  if (!rows.length) return console.log('  (none)');
  const w = cols.map(([k, h]) => Math.max(h.length, ...rows.map((r) => String(r[k]).length)));
  console.log('  ' + cols.map(([, h], i) => h.padEnd(w[i])).join('  '));
  for (const r of rows) console.log('  ' + cols.map(([k], i) => String(r[k]).padEnd(w[i])).join('  '));
};

console.log(`Monsoon events, host ${HOST}, last ${days} days`);

const byEvent = await sql(`SELECT blob1 AS event, SUM(_sample_interval) AS n FROM monsoon_events WHERE ${WHERE} GROUP BY event ORDER BY n DESC`);
table('Events', byEvent, [['event', 'event'], ['n', 'count']]);

const entries = await sql(`SELECT blob4 AS from_page, SUM(_sample_interval) AS n FROM monsoon_events WHERE ${WHERE} AND blob1 = 'entry' GROUP BY from_page ORDER BY n DESC`);
table('Entries from static pages, by from', entries, [['from_page', 'from'], ['n', 'count']]);

const cities = await sql(`SELECT blob2 AS city, SUM(_sample_interval) AS n FROM monsoon_events WHERE ${WHERE} AND blob1 = 'add_to_year' AND blob2 != '' GROUP BY city ORDER BY n DESC LIMIT 10`);
table('Top 10 cities for add_to_year', cities, [['city', 'city'], ['n', 'count']]);

// Funnel in event counts (no identifiers, so these are not per-visitor).
const n = (e) => Number(byEvent.find((r) => r.event === e)?.n ?? 0);
const step = (label, v, base) => ({ step: label, n: v, pct: base ? `${((100 * v) / base).toFixed(1)}%` : '-' });
const e0 = n('entry');
const adds = n('add_to_year') + n('year_fill');
table('Funnel (event counts)', [
  step('entry', e0, e0),
  step('city_sheet_open', n('city_sheet_open'), e0),
  step('add_to_year + year_fill', adds, e0)
], [['step', 'step'], ['n', 'count'], ['pct', 'of entry']]);
