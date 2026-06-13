<script>
  import ScoreInfo from './ScoreInfo.svelte';
  import { cities, regions, qolFor, valueFor, fmtMoney, swimNow, MONTHS, settings } from './data.svelte.js';

  let { month, preset, mode, valueModel, onmodel, onopen } = $props();

  let region = $state('all');
  let maxCost = $state('');
  let minQol = $state('');
  let nonSchengen = $state(false);
  let swimOnly = $state(false);
  let sortKey = $state('qol');
  let sortDir = $state(-1);

  const COLS = [
    { k: 'name',  label: 'City',      num: false },
    { k: 'qol',   label: 'Quality',   num: true, tip: 'Composite score: weather, safety, air quality, seasonality & events · 0–100' },
    { k: 'value', label: 'Value',     num: true, tip: 'Quality relative to cost (cost is damped so "best value" = cheap-and-nice, not merely cheap) · unitless index, compare cities only' },
    { k: 'weather', label: 'Weather', num: true, tip: 'Temperature & sunshine comfort · 0–100' },
    { k: 'air',   label: 'Air',       num: true, tip: 'Air quality (PM2.5) · 100 = cleanest in dataset' },
    { k: 'safety', label: 'Safety',   num: true, tip: 'Crime & personal safety index · 100 = safest' },
    { k: 'cost1', label: 'Solo /mo',  num: true, tip: 'Estimated monthly cost of living, one person (USD)' },
    { k: 'cost2', label: 'Couple /mo', num: true, tip: 'Estimated monthly cost of living, two people (USD)' }
  ];

  function setSort(k) {
    if (sortKey === k) sortDir = -sortDir;
    else {
      sortKey = k;
      sortDir = k === 'name' ? 1 : -1;
    }
  }

  const rows = $derived.by(() => {
    let list = cities.map((c) => {
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
        cost1: m.cost1,
        cost2: m.cost2,
        risk: m.risk,
        schengen: c.schengen,
        swim: swimNow(c, month)
      };
    });
    if (region !== 'all') list = list.filter((r) => r.region === region);
    if (nonSchengen) list = list.filter((r) => !r.schengen);
    if (swimOnly) list = list.filter((r) => r.swim);
    const mc = parseFloat(maxCost);
    if (!isNaN(mc)) list = list.filter((r) => r.cost2 <= mc);
    const mq = parseFloat(minQol);
    if (!isNaN(mq)) list = list.filter((r) => r.qol >= mq);
    return list.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * sortDir;
    });
  });

  function shade(v) {
    if (v >= 85) return 'g1';
    if (v >= 75) return 'g2';
    if (v >= 65) return 'g3';
    return 'g4';
  }
</script>

<section>
  <header class="head">
    <div>
      <p class="kicker">The full dataset · {MONTHS[month]}</p>
      <h1>Explore<span class="dot">.</span></h1>
    </div>
    <div class="filters">
      <select bind:value={region}>
        <option value="all">All regions</option>
        {#each regions as r}<option value={r}>{r}</option>{/each}
      </select>
      <input type="number" placeholder="Max couple $/mo" bind:value={maxCost} />
      <input type="number" placeholder="Min quality" bind:value={minQol} />
      <label class="cb"><input type="checkbox" bind:checked={nonSchengen} /> non-Schengen</label>
      <label class="cb"><input type="checkbox" bind:checked={swimOnly} /> ≋ swimmable in {MONTHS[month]}</label>
      <label class="cb">
        <input
          type="checkbox"
          checked={valueModel === 'classic'}
          onchange={(e) => onmodel(e.currentTarget.checked ? 'classic' : 'adjusted')}
        />
        classic value
      </label>
      <ScoreInfo title="Value index" align="right">
        <p>Quality divided by cost — but cost is damped
          (cost<sup>{settings.value_cost_exponent ?? 0.55}</sup>) so "best value" rewards
          cheap-<em>and</em>-nice, not merely cheap.</p>
        <p>Tick "classic value" for plain quality ÷ cost per $1k, where cheapness dominates.</p>
        <p class="src">A unitless index — compare cities, don't read it as $ per anything.</p>
      </ScoreInfo>
    </div>
  </header>

  <div class="tablewrap">
    <table>
      <thead>
        <tr>
          {#each COLS as col}
            <th class:numh={col.num} class:sorted={sortKey === col.k} title={col.tip} onclick={() => setSort(col.k)}>
              {col.label}{#if col.num}<span class="sort-arrow">{sortKey === col.k ? (sortDir < 0 ? '↓' : '↑') : '⇅'}</span>{/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.c.key)}
          <tr onclick={() => onopen(r.c.key)}>
            <td class="city">
              {r.name}
              <em>{r.region}{r.schengen ? ' ◆' : ''}{r.swim ? ' ≋' : ''}{r.risk >= 1 ? ' ⚠' : ''}</em>
            </td>
            <td class="num {shade(r.qol)}">{Math.round(r.qol)}</td>
            <td class="num">{r.value.toFixed(1)}</td>
            <td class="num {shade(r.weather)}">{Math.round(r.weather)}</td>
            <td class="num {shade(r.air)}">{Math.round(r.air)}</td>
            <td class="num {shade(r.safety)}">{Math.round(r.safety)}</td>
            <td class="num">{fmtMoney(r.cost1)}</td>
            <td class="num">{fmtMoney(r.cost2)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="count">{rows.length} of {cities.length} cities · sorted by {sortKey}</p>
</section>

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 14px;
    margin: 28px 0 18px;
  }

  h1 { font-size: 56px; font-weight: 600; }
  .dot { color: var(--terra); }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .filters input[type='number'] { width: 130px; }

  .cb {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    color: var(--ink-2);
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
