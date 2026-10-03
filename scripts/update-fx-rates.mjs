// Refreshes src/lib/fxRates.json from the ECB's daily euro reference rates.
// Hand-run only (npm run update:fx); builds never fetch. Review the diff and
// commit the file like any other data change.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FEED = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const PAGE = 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html';
const CODES = ['USD', 'GBP', 'CAD', 'AUD'];
const OUT = fileURLToPath(new URL('../src/lib/fxRates.json', import.meta.url));

const res = await fetch(FEED);
if (!res.ok) throw new Error(`ECB feed returned HTTP ${res.status}`);
const xml = await res.text();

const asOf = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
if (!asOf) throw new Error('ECB feed: no time="YYYY-MM-DD" attribute found');

const perEUR = {};
for (const code of CODES) {
  const m = xml.match(new RegExp(`currency=['"]${code}['"]\\s+rate=['"]([0-9.]+)['"]`));
  const rate = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`ECB feed: missing or invalid ${code} rate`);
  perEUR[code] = rate;
}

const rates = CODES.map((c) => `${JSON.stringify(c)}: ${perEUR[c]}`).join(', ');
const out = `{
  "source": "European Central Bank euro foreign exchange reference rates",
  "url": ${JSON.stringify(PAGE)},
  "asOf": ${JSON.stringify(asOf)},
  "perEUR": { ${rates} }
}
`;
JSON.parse(out); // never write a file the app can't import
writeFileSync(OUT, out);
console.log(`Wrote ${OUT} (ECB reference rates of ${asOf})`);
