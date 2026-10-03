// Display currency. Every cost in the data is researched and stored in US
// dollars; this module only converts for display, at ECB reference rates from
// the checked-in table (src/lib/fxRates.json, refreshed by hand with
// `npm run update:fx`; builds never fetch). Pure: no Svelte runes, importable
// from Node scripts and tests.
import fx from './fxRates.json' with { type: 'json' };

export const CURRENCIES = [
  { code: 'USD', label: 'US dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British pound' },
  { code: 'CAD', label: 'Canadian dollar' },
  { code: 'AUD', label: 'Australian dollar' }
];

// Units of each currency per 1 USD. The ECB quotes everything per 1 EUR, so
// cross rates go through the euro.
export const RATES = {
  USD: 1,
  EUR: 1 / fx.perEUR.USD,
  GBP: fx.perEUR.GBP / fx.perEUR.USD,
  CAD: fx.perEUR.CAD / fx.perEUR.USD,
  AUD: fx.perEUR.AUD / fx.perEUR.USD
};

export const RATES_AS_OF = fx.asOf;
export const RATES_SOURCE = fx.source;

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2026-10-02' → '2 Oct 2026', formatted by hand so it can't shift with the
// runtime time zone.
export function ratesAsOfLabel() {
  const [y, m, d] = RATES_AS_OF.split('-').map(Number);
  return `${d} ${MON[m - 1]} ${y}`;
}

export const isCurrency = (code) => typeof code === 'string' && Object.hasOwn(RATES, code);

const formatters = {};
function formatterFor(code) {
  return (formatters[code] ??= new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }));
}

// usd is a US-dollar amount; the result is a whole-unit string in `code`
// ('$1,840', '€1,640', 'CA$2,550'). en-US symbols keep the dollar variants
// unambiguous. Unknown code → USD; a non-number → '—'.
export function formatMoney(usd, code = 'USD') {
  if (usd == null || usd === '' || typeof usd === 'boolean') return '—';
  const n = Number(usd);
  if (!Number.isFinite(n)) return '—';
  const c = isCurrency(code) ? code : 'USD';
  return formatterFor(c).format(Math.round(n * RATES[c]));
}

export function moneySymbol(code = 'USD') {
  const c = isCurrency(code) ? code : 'USD';
  return formatterFor(c).formatToParts(0).find((p) => p.type === 'currency')?.value ?? '$';
}

// First-visit default from the browser's preferred languages. USD is the data's
// native currency, so anything ambiguous stays unconverted. Only the first tag
// counts (same precedent as °C/°F): a region subtag decides when there is one,
// otherwise a language that is (almost) only spoken in the eurozone does.
const EURO_REGIONS = new Set([
  'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK',
  'AD', 'MC', 'SM', 'VA', 'ME', 'XK' // not members, but they use the euro
]);
const GBP_REGIONS = new Set(['GB', 'UK', 'GG', 'JE', 'IM']);
const EURO_LANGS = new Set(['de', 'fr', 'it', 'nl', 'fi', 'el', 'et', 'lv', 'lt', 'sk', 'sl', 'mt', 'ga', 'hr']);

export function defaultCurrency(langs) {
  const tag = Array.isArray(langs) ? langs[0] : langs;
  if (typeof tag !== 'string' || !tag) return 'USD';
  const parts = tag.trim().split(/[-_]/);
  const lang = parts[0].toLowerCase();
  // Region = first 2-letter alpha or 3-digit subtag after the language (skips
  // a 4-letter script such as 'Latn').
  const region = parts.slice(1).find((p) => /^[A-Za-z]{2}$|^\d{3}$/.test(p))?.toUpperCase();
  if (region) {
    if (GBP_REGIONS.has(region)) return 'GBP';
    if (region === 'CA') return 'CAD';
    if (region === 'AU') return 'AUD';
    if (EURO_REGIONS.has(region)) return 'EUR';
    return 'USD'; // US and every other region
  }
  return EURO_LANGS.has(lang) ? 'EUR' : 'USD';
}

export function currencyNote(code) {
  if (!isCurrency(code) || code === 'USD') return '';
  return `Costs in ${code} are converted from US dollars at ECB reference rates of ${ratesAsOfLabel()}, so they are estimates.`;
}
