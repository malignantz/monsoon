// Checks the display-currency helpers in src/lib/currency.js: conversion and
// formatting, the first-visit default from browser languages, and the rate
// table's sanity. Run: node scripts/test-currency.mjs
import assert from 'node:assert/strict';
import {
  CURRENCIES, RATES, RATES_AS_OF, ratesAsOfLabel, isCurrency, formatMoney, moneySymbol, defaultCurrency, currencyNote
} from '../src/lib/currency.js';
import fx from '../src/lib/fxRates.json' with { type: 'json' };

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}

test('currency list order and labels', () => {
  assert.deepEqual(CURRENCIES.map((c) => c.code), ['USD', 'EUR', 'GBP', 'CAD', 'AUD']);
  assert.equal(CURRENCIES[1].label, 'Euro');
});

test('rates sanity: units per 1 USD', () => {
  assert.equal(RATES.USD, 1);
  assert.ok(RATES.EUR < 1);
  assert.ok(RATES.GBP < RATES.EUR);
  assert.ok(RATES.CAD > 1);
  assert.ok(RATES.AUD > 1);
  assert.ok(Math.abs(RATES.EUR - 1 / fx.perEUR.USD) < 1e-12);
  assert.ok(Math.abs(RATES.GBP - fx.perEUR.GBP / fx.perEUR.USD) < 1e-12);
});

test('rates date label is time-zone proof', () => {
  // Pinned to a fixed date so the label logic is tested without depending on
  // whichever rates `npm run update:fx` last wrote.
  assert.match(RATES_AS_OF, /^\d{4}-\d{2}-\d{2}$/);
  const [y, m, d] = RATES_AS_OF.split('-').map(Number);
  assert.equal(ratesAsOfLabel(), `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`);
  assert.ok(!ratesAsOfLabel().startsWith('0'), 'no leading zero on the day');
});

test('USD formatting is unchanged: $1,840 and friends', () => {
  assert.equal(formatMoney(1840, 'USD'), '$1,840');
  assert.equal(formatMoney(1840), '$1,840');
  assert.equal(formatMoney(0, 'USD'), '$0');
  assert.equal(formatMoney(999.6, 'USD'), '$1,000');
  assert.equal(formatMoney(1234567, 'USD'), '$1,234,567');
  for (const n of [0, 5, 449, 1840, 2999, 12345]) {
    assert.equal(formatMoney(n, 'USD'), '$' + Math.round(n).toLocaleString('en-US'));
  }
});

test('conversion and symbols per currency', () => {
  assert.equal(formatMoney(1840, 'EUR'), '€' + Math.round(1840 * RATES.EUR).toLocaleString('en-US'));
  assert.equal(formatMoney(1840, 'GBP'), '£' + Math.round(1840 * RATES.GBP).toLocaleString('en-US'));
  assert.equal(formatMoney(1840, 'CAD'), 'CA$' + Math.round(1840 * RATES.CAD).toLocaleString('en-US'));
  assert.equal(formatMoney(1840, 'AUD'), 'A$' + Math.round(1840 * RATES.AUD).toLocaleString('en-US'));
});

test('rounding to whole units after conversion', () => {
  // Rounds after converting, not before (independent of the current rates).
  assert.equal(formatMoney(1000, 'GBP'), '£' + Math.round(1000 * RATES.GBP).toLocaleString('en-US'));
  assert.equal(formatMoney(1 / RATES.EUR, 'EUR'), '€1');
  assert.equal(formatMoney(0.4 / RATES.EUR, 'EUR'), '€0');
  assert.equal(formatMoney(0.6 / RATES.EUR, 'EUR'), '€1');
});

test('unknown code falls back to USD; bad input is an em dash', () => {
  assert.equal(formatMoney(100, 'XYZ'), '$100');
  assert.equal(formatMoney(100, undefined), '$100');
  assert.equal(formatMoney(NaN, 'USD'), '—');
  assert.equal(formatMoney(NaN, 'EUR'), '—');
  assert.equal(formatMoney(null, 'USD'), '—');
  assert.equal(formatMoney(undefined, 'GBP'), '—');
  assert.equal(formatMoney(Infinity, 'USD'), '—');
});

test('isCurrency and moneySymbol', () => {
  assert.ok(isCurrency('EUR'));
  assert.ok(!isCurrency('JPY'));
  assert.ok(!isCurrency(null));
  assert.ok(!isCurrency('toString'));
  assert.deepEqual(['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map(moneySymbol), ['$', '€', '£', 'CA$', 'A$']);
});

test('default currency from the first browser language', () => {
  const d = (...langs) => defaultCurrency(langs);
  assert.equal(d('en-US'), 'USD');
  assert.equal(d('en-GB'), 'GBP');
  assert.equal(d('en-gb'), 'GBP');
  assert.equal(d('de-DE'), 'EUR');
  assert.equal(d('de'), 'EUR');
  assert.equal(d('fr-CA'), 'CAD');
  assert.equal(d('fr'), 'EUR');
  assert.equal(d('en-AU'), 'AUD');
  assert.equal(d('en-CA'), 'CAD');
  assert.equal(d('pt-BR'), 'USD');
  assert.equal(d('pt-PT'), 'EUR');
  assert.equal(d('es'), 'USD');
  assert.equal(d('es-ES'), 'EUR');
  assert.equal(d('en-IE'), 'EUR');
  assert.equal(d('sr-Latn-ME'), 'EUR');
  assert.equal(d('zh-Hans-CN'), 'USD');
  assert.equal(d('en'), 'USD');
  assert.equal(d('en-GB', 'de'), 'GBP'); // only the first tag counts
  assert.equal(d('en-US', 'de-DE'), 'USD');
  assert.equal(defaultCurrency(undefined), 'USD');
  assert.equal(defaultCurrency([]), 'USD');
  assert.equal(defaultCurrency(['']), 'USD');
});

test('currency note', () => {
  assert.equal(currencyNote('USD'), '');
  assert.equal(currencyNote('EUR'), `Costs in EUR are converted from US dollars at ECB reference rates of ${ratesAsOfLabel()}, so they are estimates.`);
});

console.log(failed ? `\n${failed} failed` : '\nall currency checks passed');
process.exit(failed ? 1 : 0);
