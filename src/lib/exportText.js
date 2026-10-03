// "Copy as text" for My year: a plain-text itinerary that pastes cleanly into
// an email, a note or a chat. Pure (callers pass already-formatted pieces), so
// it can be run from Node.
//
//   rows:  [{ range: 'Jan–Mar', len, city, country, schengen, score, cost: '$1,840' }]
//   open:  ['Nov', 'Dec'] (months with no stay)
//   lines: summary lines (totals, Schengen, longest in one country), in order
export function itineraryText({ title, subtitle, rows, open = [], lines = [], url }) {
  const width = Math.max(4, ...rows.map((r) => r.range.length));
  const out = [title, subtitle, ''];
  for (const r of rows) {
    const where = `${r.city}, ${r.country}${r.schengen ? ' ◆' : ''}`;
    out.push(`${r.range.padEnd(width)}  ${where} · ${r.len} mo · score ${r.score} · ${r.cost}/mo`);
  }
  if (open.length) out.push(`${'Open'.padEnd(width)}  ${open.join(', ')}`);
  out.push('', ...lines.filter(Boolean));
  if (url) out.push('', url);
  return out.join('\n');
}

// Words for the route's Schengen verdict (see schengen.js), or '' when the
// route has no Schengen stay.
export function schengenLine(sch) {
  if (!sch?.anySchengen) return '';
  const lead = 'Schengen 90/180 (◆ stays):';
  if (sch.breach) return `${lead} over the limit by ${sch.over} days in ${sch.window}`;
  if (sch.caution) {
    return `${lead} tight, ${sch.worst} of 90 days in ${sch.window}; leave ${sch.over} ${sch.over === 1 ? 'day' : 'days'} early`;
  }
  if (sch.atLimit) return `${lead} at the limit, 90 of 90 days in ${sch.window}`;
  return `${lead} within limits, ${sch.remaining} of 90 days left in the tightest window (${sch.window})`;
}
