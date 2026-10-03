// Plain-language summary of a city's 12-month strip, for screen readers (the
// strip itself is colour-only). "Best months: Apr–Jun, Sep–Oct".
import { MONTHS } from './data.svelte.js';

// Cyclic runs of true flags → [[start, len], …], ordered by start month.
function runs(flags) {
  if (flags.every(Boolean)) return [[0, 12]];
  const out = [];
  for (let i = 0; i < 12; i++) {
    if (!flags[i] || flags[(i + 11) % 12]) continue;
    let len = 1;
    while (len < 12 && flags[(i + len) % 12]) len++;
    out.push([i, len]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

const fmtRun = ([s, len]) => (len === 1 ? MONTHS[s] : `${MONTHS[s]}–${MONTHS[(s + len - 1) % 12]}`);

export function stripSummary(cells) {
  for (const [band, word] of [['great', 'Best months'], ['good', 'Good months']]) {
    const flags = cells.map((c) => c.band === band || (band === 'good' && c.band === 'great'));
    if (!flags.some(Boolean)) continue;
    const r = runs(flags);
    if (r.length === 1 && r[0][1] === 12) return band === 'great' ? 'Great all year.' : 'Good all year.';
    return `${word}: ${r.map(fmtRun).join(', ')}.`;
  }
  let best = 0;
  cells.forEach((c, i) => {
    if (c.q > cells[best].q) best = i;
  });
  return `No standout months; best is ${MONTHS[best]}.`;
}
