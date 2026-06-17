<script>
  import ScoreInfo from './ScoreInfo.svelte';
  import Legend from './Legend.svelte';
  import { qolFor, valueFor, fmtMoney, swimNow, MONTHS, settings, cityCost, partyWord } from './data.svelte.js';

  // Dense view of the same ranking the cards show. The parent (This month) owns
  // all filtering and hands us an already-filtered list; we only sort columns.
  let { cities, month, preset, valueModel, onmodel, onopen } = $props();

  let sortKey = $state('qol');
  let sortDir = $state(-1);

  const COLS = $derived([
    { k: 'name',  label: 'City',      num: false },
    { k: 'qol',   label: 'Score',      num: true, tip: 'Best month money aside: weather, safety, air quality, seasonality & events · 0-100' },
    { k: 'value', label: 'Best Value', num: true, tip: 'Score relative to cost (cost is damped so "best value" = cheap-and-nice, not merely cheap) · unitless index, compare cities only' },
    { k: 'weather', label: 'Weather', num: true, tip: 'Temperature & sunshine comfort · 0–100' },
    { k: 'air',   label: 'Air',       num: true, tip: 'Air quality (PM2.5) · 100 = cleanest in dataset' },
    { k: 'safety', label: 'Safety',   num: true, tip: 'Crime & personal safety index · 100 = safest' },
    { k: 'cost',  label: `${partyWord() === 'solo' ? 'Solo' : 'Couple'} /mo`, num: true, tip: `Estimated monthly cost of living, ${partyWord()} (USD)` }
  ]);

  function setSort(k) {
    if (sortKey === k) sortDir = -sortDir;
    else {
      sortKey = k;
      sortDir = k === 'name' ? 1 : -1;
    }
  }

  const rows = $derived.by(() => {
    const list = cities.map((c) => {
      const m = c.months[month];
      return {
        c,
        name: c.name,
        region: c.region,
        qol: qolFor(c, month, preset),
        value: valueFor(c, month, preset, valueModel),
        weather: m.weather,
        air: m.air,
        safety: c.safety?.score ?? 0,
        cost: cityCost(m),
        risk: m.risk,
        riskNote: m.riskNote,
        schengen: c.schengen,
        swim: swimNow(c, month)
      };
    });
    return list.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const primary = (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * sortDir;
      // Best Value tiebreaker (within 1pt): cheaper first.
      if (sortKey === 'value' && Math.abs(va - vb) < 1.0) return a.cost - b.cost;
      return primary;
    });
  });

  function shade(v) {
    if (v >= 85) return 'g1';
    if (v >= 75) return 'g2';
    if (v >= 65) return 'g3';
    return 'g4';
  }

  function sortLabel(k) {
    return COLS.find((col) => col.k === k)?.label ?? k;
  }
</script>

<div class="tablecap">
  <Legend />
  <ScoreInfo title="Best Value index" align="right">
    <p>Score divided by cost — but cost is damped
      (cost<sup>{settings.value_cost_exponent ?? 0.55}</sup>) so "best value" rewards
      cheap-<em>and</em>-nice, not merely cheap.</p>
    <p>Tick "classic Best Value" for plain Score ÷ cost per $1k, where cheapness dominates.</p>
    <label class="cb pop-toggle">
      <input
        type="checkbox"
        checked={valueModel === 'classic'}
        onchange={(e) => onmodel(e.currentTarget.checked ? 'classic' : 'adjusted')}
      />
      classic Best Value
    </label>
    <p class="src">A unitless index — compare cities, don't read it as $ per anything.</p>
  </ScoreInfo>
</div>

<div class="tableouter">
  <div class="tablewrap">
    <table>
      <thead>
        <tr>
          {#each COLS as col}
            <th
              class:numh={col.num}
              class:sorted={sortKey === col.k}
              aria-sort={sortKey === col.k ? (sortDir < 0 ? 'descending' : 'ascending') : undefined}
            >
              <button type="button" class="thbtn" title={col.tip} onclick={() => setSort(col.k)}>
                {col.label}{#if col.num}<span class="sort-arrow">{sortKey === col.k ? (sortDir < 0 ? '↓' : '↑') : '⇅'}</span>{/if}
              </button>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.c.key)}
          <tr onclick={() => onopen(r.c.key)}>
            <td class="city">
              {r.name}
              <em>{r.region}{r.schengen ? ' ◆' : ''}{r.swim ? ' ≋' : ''}{#if r.risk >= 1}
                  <span class="hz" title={r.riskNote}>⚠</span>{/if}</em>
            </td>
            <td class="num {shade(r.qol)}">{Math.round(r.qol)}</td>
            <td class="num">{r.value.toFixed(1)}</td>
            <td class="num {shade(r.weather)}">{Math.round(r.weather)}</td>
            <td class="num {shade(r.air)}">{Math.round(r.air)}</td>
            <td class="num {shade(r.safety)}">{Math.round(r.safety)}</td>
            <td class="num">{fmtMoney(r.cost)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
<p class="count">{rows.length} of {cities.length} cities · sorted by {sortLabel(sortKey)}</p>

<style>
  .tablecap {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 2px 10px;
  }

  .tablecap :global(.wrap) { margin-bottom: 0; }

  .cb {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    color: var(--ink-2);
  }

  .pop-toggle { margin: 2px 0 7px; }

  .tableouter { position: relative; }

  th:first-child,
  td.city {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--card);
  }

  tbody tr:hover td.city { background: var(--paper-2); }

  @media (max-width: 700px) {
    .tableouter::after {
      content: '';
      position: absolute;
      top: 1px;
      bottom: 1px;
      right: 1px;
      width: 26px;
      border-radius: 0 14px 14px 0;
      background: linear-gradient(90deg, transparent, rgba(33, 36, 30, 0.08));
      pointer-events: none;
    }
  }

  .tablewrap {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 14px;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  th {
    text-align: right;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
    padding: 12px 14px 8px;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }

  th:first-child { text-align: left; }
  th:hover { color: var(--ink); }

  .thbtn {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    white-space: inherit;
  }

  .hz { cursor: help; }

  .sort-arrow {
    margin-left: 3px;
    font-size: 9px;
    opacity: 0;
    transition: opacity 0.12s;
  }

  th:hover .sort-arrow { opacity: 0.45; }
  th.sorted .sort-arrow { opacity: 1; }

  td {
    padding: 8px 14px;
    border-top: 1px solid var(--line-soft);
    text-align: right;
    white-space: nowrap;
  }

  tbody tr { cursor: pointer; }
  tbody tr:hover { background: var(--paper-2); }

  .city {
    text-align: left;
    font-weight: 600;
  }

  .city em {
    display: block;
    font-style: normal;
    font-weight: 400;
    font-size: 11px;
    color: var(--ink-3);
  }

  .g1 { color: var(--teal); font-weight: 600; }
  .g2 { color: #5a7a2e; }
  .g3 { color: #a06a14; }
  .g4 { color: var(--band-bad); }

  .count {
    font-size: 12px;
    color: var(--ink-3);
    margin: 10px 2px 60px;
  }
</style>
