<script>
  import MonthStrip from './MonthStrip.svelte';
  import ScoreInfo from './ScoreInfo.svelte';
  import Legend from './Legend.svelte';
  import {
    cities,
    cityByKey,
    regions,
    stripCells,
    qolFor,
    fmtMoney,
    MONTHS,
    MONTH_LETTERS,
    TEMPLATES,
    monthOccupancy,
    routeStats,
    stayMonths
  } from './data.svelte.js';
  import { defaultFilters, filtersActive, cityPasses, stayPasses, proposeRoutes, routeTravelKm } from './planner.js';

  let { preset, onopen } = $props();

  const STORE = 'atlas.route.v1';
  const STORE_F = 'atlas.route.filters.v1';

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      if (Array.isArray(s) && s.every((x) => cityByKey.has(x.key))) return s;
    } catch {}
    return TEMPLATES[0].stays.map((s) => ({ ...s }));
  }

  function loadFilters() {
    const base = defaultFilters();
    try {
      const f = JSON.parse(localStorage.getItem(STORE_F));
      if (f && typeof f === 'object') {
        for (const k of Object.keys(base)) if (k in f) base[k] = f[k];
        // Sanitize regions into canonical order; empty also resets to all
        // (the pre-all-selected format used [] to mean "all").
        const saved = new Set(Array.isArray(base.regions) ? base.regions : []);
        base.regions = regions.filter((r) => saved.has(r));
        if (!base.regions.length) base.regions = [...regions];
      }
    } catch {}
    return base;
  }

  let stays = $state(load());
  let selStart = $state(-1);
  let dur = $state(2);
  let query = $state('');
  let hoverTemplate = $state(null);

  // A template chip is "on" only while the route still matches it exactly.
  const activeTemplate = $derived(
    TEMPLATES.find(
      (t) =>
        t.stays.length === stays.length &&
        t.stays.every((s, i) => s.key === stays[i].key && s.start === stays[i].start && s.len === stays[i].len)
    )?.id ?? ''
  );

  const visibleBlurb = $derived.by(() => {
    const id = hoverTemplate ?? activeTemplate ?? null;
    return id ? (TEMPLATES.find((x) => x.id === id)?.blurb ?? null) : null;
  });

  let filters = $state(loadFilters());
  let planMin = $state(2);
  let planMax = $state(4);
  let planObjective = $state('qol');
  let planTravel = $state('some');

  // Proposals are only shown while the planner inputs still match what they
  // were proposed under — staleness is derived, never a clearing side effect.
  const planSig = $derived(JSON.stringify([filters, planObjective, planTravel, planMin, planMax, preset]));
  let plan = $state({ sig: '', proposals: [], msg: '' });
  const proposals = $derived(plan.sig === planSig ? plan.proposals : []);
  const planMsg = $derived(plan.sig === planSig ? plan.msg : '');

  $effect(() => {
    localStorage.setItem(STORE, JSON.stringify(stays));
  });

  $effect(() => {
    localStorage.setItem(STORE_F, JSON.stringify(filters));
  });

  function resetFilters() {
    filters = defaultFilters();
  }

  // Keep the selection in canonical `regions` order so equal selections
  // always serialize identically (the proposal-staleness signature relies on it).
  function toggleRegion(r) {
    const on = new Set(filters.regions);
    on.has(r) ? on.delete(r) : on.add(r);
    filters.regions = regions.filter((x) => on.has(x));
  }

  function runPlanner() {
    const { routes, reason } = proposeRoutes(filters, {
      preset,
      objective: planObjective,
      minLen: planMin,
      maxLen: planMax,
      travel: planTravel
    });
    plan = { sig: planSig, proposals: routes, msg: reason };
  }

  function useProposal(p) {
    stays = p.stays.map((s) => ({ ...s }));
    selStart = -1;
  }

  // Great-circle hop totals are a rough proxy, so show them rough: "8k km".
  const fmtKm = (km) => (km < 950 ? `${Math.round(km / 100) * 100}` : `${Math.round(km / 1000)}k`);

  const occ = $derived(monthOccupancy(stays));
  const stats = $derived(routeStats(stays, preset));

  function loadTemplate(t) {
    stays = t.stays.map((s) => ({ ...s }));
    selStart = -1;
    // On touch there's no mouseenter — show the tapped template's blurb right away.
    hoverTemplate = t.id;
  }

  function clearRoute() {
    stays = [];
    selStart = -1;
  }

  function resizeStay(stay, newLen) {
    if (newLen < 1) return;
    if (newLen > stay.len) {
      const maxExtend = stay.len + freeRun((stay.start + stay.len) % 12);
      newLen = Math.min(newLen, maxExtend, 12);
    }
    if (newLen === stay.len) return;
    stays = stays.map((s) => (s === stay ? { ...s, len: newLen } : s));
  }

  function removeStay(stay) {
    stays = stays.filter((s) => s !== stay);
  }

  function freeRun(from) {
    let n = 0;
    while (n < 12 && occ[(from + n) % 12] === null) n++;
    return n;
  }

  function addStay(key) {
    let start = selStart;
    if (start < 0 || occ[start] !== null) start = occ.findIndex((x) => x === null);
    if (start < 0) return;
    const len = Math.max(1, Math.min(dur, freeRun(start)));
    stays = [...stays, { key, start, len }];
    const next = (start + len) % 12;
    selStart = occ[next] === null && freeRun(next) > 0 ? next : -1;
  }

  // Split a stay into render segments (handles Dec→Jan wrap).
  function segments(stay) {
    const first = Math.min(stay.len, 12 - stay.start);
    const segs = [{ from: stay.start, len: first, head: true }];
    if (stay.len > first) segs.push({ from: 0, len: stay.len - first, head: false });
    return segs;
  }

  function stayAvg(stay) {
    const c = cityByKey.get(stay.key);
    const ms = stayMonths(stay);
    return ms.reduce((a, m) => a + qolFor(c, m, preset), 0) / ms.length;
  }

  function stayHazard(stay) {
    const c = cityByKey.get(stay.key);
    return stayMonths(stay).some((m) => c.months[m].risk >= 1);
  }

  const emptyMonths = $derived(occ.map((x, i) => (x === null ? i : -1)).filter((i) => i >= 0));

  // Filtered candidates: static criteria always; month-dependent criteria are
  // checked against the months the prospective stay (as addStay would place
  // it) will actually occupy.
  const filteredCities = $derived.by(() => {
    let list = cities.filter((c) => cityPasses(c, filters));
    const start = selStart >= 0 && occ[selStart] === null ? selStart : occ.findIndex((x) => x === null);
    if (start >= 0) {
      const len = Math.max(1, Math.min(dur, freeRun(start)));
      list = list.filter((c) => stayPasses(c, start, len, filters));
    }
    return list;
  });

  const pickerList = $derived.by(() => {
    const q = query.trim().toLowerCase();
    let list = filteredCities;
    if (q) list = list.filter((c) => (c.name + ' ' + c.country + ' ' + c.region).toLowerCase().includes(q));
    const target = selStart >= 0 ? [selStart] : emptyMonths.length ? emptyMonths : [...Array(12).keys()];
    return list
      .map((c) => ({ c, s: target.reduce((a, m) => a + qolFor(c, m, preset), 0) / target.length }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 30);
  });
</script>

<section class="wrap">
  <header class="view-head">
    <div>
      <p class="kicker">Build the year</p>
      <h1>My year<span class="dot">.</span></h1>
    </div>
    <div class="head-right">
      <div class="templates">
        {#each TEMPLATES as t}
          <button
            type="button"
            class="chip"
            class:on={activeTemplate === t.id}
            onmouseenter={() => (hoverTemplate = t.id)}
            onmouseleave={() => (hoverTemplate = null)}
            onclick={() => loadTemplate(t)}
          >
            {t.name}
          </button>
        {/each}
        <button type="button" class="chip clear" onclick={clearRoute}>Clear</button>
      </div>
    </div>
    {#if visibleBlurb}
      <p class="tblurb">{visibleBlurb}</p>
    {/if}
  </header>

  <div class="board">
    <div class="boardscroll">
    <div class="months num">
      {#each MONTH_LETTERS as l, i}
        <span class:sel={i === selStart}>{l}</span>
      {/each}
    </div>

    <div class="timeline">
      {#each occ as o, i}
        {#if o === null}
          <button
            type="button"
            class="gap"
            class:sel={i === selStart}
            style="grid-column: {i + 1} / span 1"
            onclick={() => (selStart = selStart === i ? -1 : i)}
            title="Plan {MONTHS[i]}"
          >+</button>
        {/if}
      {/each}
      {#each stays as stay (stay)}
        {@const c = cityByKey.get(stay.key)}
        {#each segments(stay) as seg}
          <div
            class="stay"
            class:schengen={c.schengen}
            class:hazard={stayHazard(stay)}
            style="grid-column: {seg.from + 1} / span {seg.len}"
          >
            {#if seg.head}
              <button type="button" class="stayname" onclick={() => onopen(c.key)}>{c.name}</button>
              <span class="stayq num">{Math.round(stayAvg(stay))}</span>
              <button type="button" class="x" aria-label="Remove stay" onclick={() => removeStay(stay)}>×</button>
              <div class="dur-ctl">
                <button type="button" class="dur-btn" aria-label="Shorter" onclick={() => resizeStay(stay, stay.len - 1)} disabled={stay.len <= 1}>−</button>
                <span class="dur-val num">{stay.len}mo</span>
                <button type="button" class="dur-btn" aria-label="Longer" onclick={() => resizeStay(stay, stay.len + 1)}>+</button>
              </div>
            {:else}
              <span class="cont">↪ {c.name}</span>
            {/if}
          </div>
        {/each}
      {/each}
    </div>
    </div>

    {#if stays.length === 0}
      <p class="board-hint">Click any month above to mark a starting point, then choose a city from the list below — or pick a template.</p>
    {/if}

    <div class="meter" class:bad={!stats.schengen.ok} class:tight={stats.schengen.tight}>
      <span class="mlabel">◆ Schengen 90/180</span>
      <ScoreInfo title="Schengen 90/180 rule">
        <p>EU short-stay visa: max 90 days in any rolling 180-day window.</p>
        <p>◆ marks Schengen-area countries. Exceeding 90 days requires a visa or a non-Schengen break.</p>
      </ScoreInfo>
      {#if stats.schengen.anySchengen}
        <div class="track">
          <div class="used" style="width: {Math.min(100, (stats.schengen.worst / 90) * 100)}%"></div>
          <div class="limit"></div>
        </div>
      {/if}
      <span class="mread num">
        {#if !stats.schengen.anySchengen}
          no Schengen stays
        {:else if stats.schengen.ok}
          {stats.schengen.worst} of 90 days · worst window {stats.schengen.window}
        {:else}
          {stats.schengen.worst} days in {stats.schengen.window} — over the 90-day limit
        {/if}
      </span>
    </div>

    <div class="totals">
      <div class="tot">
        <span class="num tv">{Math.round(stats.avgQol) || '—'}</span>
        <span class="tk">avg quality</span>
      </div>
      <div class="tot">
        <span class="num tv">{stats.months ? fmtMoney(stats.avgCost) : '—'}</span>
        <span class="tk">avg /mo couple</span>
      </div>
      <div class="tot">
        <span class="num tv">{stats.months ? fmtMoney(stats.totalCost) : '—'}</span>
        <span class="tk">{stats.months}-month total</span>
      </div>
      <div class="tot">
        <span class="num tv">{stats.festivals}</span>
        <span class="tk">major festivals</span>
      </div>
      <div class="tot" class:warn={stats.hazardMonths > 0}>
        <span class="num tv">{stats.hazardMonths}</span>
        <span class="tk">hazard months</span>
      </div>
    </div>
  </div>

  <div class="plan">
    <div class="planrow">
      <span class="plabel">Regions</span>
      <div class="fctl">
        {#each regions as r}
          <button type="button" class="chip" class:on={filters.regions.includes(r)} onclick={() => toggleRegion(r)}>
            {r}
          </button>
        {/each}
      </div>
    </div>
    <div class="planrow">
      <span class="plabel">Filter cities</span>
      <div class="fctl">
        <input type="number" placeholder="Max couple $/mo" bind:value={filters.maxCost} />
        <input type="number" placeholder="Min safety" bind:value={filters.minSafety} />
        <input type="number" placeholder="Min air" bind:value={filters.minAir} />
        <select bind:value={filters.maxRain} aria-label="Rain tolerance">
          <option value="">Any rain</option>
          <option value={15}>Avoid heavy rain (&gt;15 d/mo)</option>
          <option value={6}>Avoid moderate rain (&gt;6 d/mo)</option>
        </select>
        <select bind:value={filters.english} aria-label="English level">
          <option value={0}>Any English</option>
          <option value={2}>English: decent +</option>
          <option value={3}>English: high</option>
        </select>
        <label class="cb"><input type="checkbox" bind:checked={filters.nonSchengen} /> non-Schengen</label>
        <label class="cb"><input type="checkbox" bind:checked={filters.swimOnly} /> ≋ swimmable</label>
        {#if filtersActive(filters)}
          <button type="button" class="chip clear" onclick={resetFilters}>Reset</button>
        {/if}
      </div>
    </div>
    <div class="planrow">
      <span class="plabel">Auto-plan</span>
      <div class="fctl">
        <span class="cb">Stays of
          <select bind:value={planMin} aria-label="Shortest stay, months" onchange={() => (planMax = Math.max(planMax, planMin))}>
            {#each [1, 2, 3, 4, 5, 6] as n}<option value={n}>{n}</option>{/each}
          </select>
          to
          <select bind:value={planMax} aria-label="Longest stay, months" onchange={() => (planMin = Math.min(planMin, planMax))}>
            {#each [1, 2, 3, 4, 5, 6] as n}<option value={n}>{n}</option>{/each}
          </select>
          mo
        </span>
        <select bind:value={planObjective} aria-label="Objective">
          <option value="qol">Best quality</option>
          <option value="value">Best value</option>
        </select>
        <select bind:value={planTravel} aria-label="Travel preference">
          <option value="off">Any travel</option>
          <option value="some">Fewer long hops</option>
          <option value="strict">Minimize travel</option>
        </select>
        <button type="button" class="go" onclick={runPlanner}>Propose my year</button>
        <span class="fcount num">{filteredCities.length} of {cities.length} cities pass</span>
      </div>
    </div>
    {#if planMsg}<p class="planmsg">{planMsg}</p>{/if}
    {#if proposals.length}
      <ul class="props">
        {#each proposals as p, i}
          {@const st = routeStats(p.stays, preset)}
          <li>
            <span class="ptitle">Route {String.fromCharCode(65 + i)}</span>
            <span class="pcities">
              {p.stays.map((s) => `${cityByKey.get(s.key).name} · ${s.len}mo`).join('  →  ')}
            </span>
            <span class="pstat"><b class="num">{Math.round(st.avgQol)}</b> quality</span>
            <span class="pstat"><b class="num">{fmtMoney(st.avgCost)}</b> /mo</span>
            <span class="pstat"><b class="num">{fmtKm(routeTravelKm(p.stays))}</b> km</span>
            <span class="pstat">
              <b class="num">{st.schengen.anySchengen ? st.schengen.worst + 'd' : '—'}</b> ◆ 90/180
            </span>
            <button type="button" class="use" onclick={() => useProposal(p)}>Use</button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="picker">
    <div class="pickhead">
      <h2>
        {#if selStart >= 0}Fill {MONTHS[selStart]}{:else if emptyMonths.length}Best for your open months{:else}Year is full — remove a stay to swap{/if}
      </h2>
      <div class="pickctl">
        <label>Stay
          <select bind:value={dur}>
            {#each [1, 2, 3, 4, 5, 6] as n}<option value={n}>{n} mo</option>{/each}
          </select>
        </label>
        <input type="search" placeholder="Search 111 cities…" bind:value={query} />
      </div>
    </div>
    <div class="legendrow"><Legend /></div>
    {#if pickerList.length === 0}
      <p class="picker-empty">
        {query.trim()
          ? 'No cities match your search and filters.'
          : `${filteredCities.length} of ${cities.length} cities pass your filters — loosen one to see options here.`}
        {#if filtersActive(filters)}
          <button type="button" class="chip clear" onclick={resetFilters}>Reset filters</button>
        {/if}
      </p>
    {/if}
    <ul class="rows">
      {#each pickerList as { c, s } (c.key)}
        <li>
          <button type="button" class="rowname" onclick={() => onopen(c.key)}>
            {c.name}<em>{c.country}{c.schengen ? ' ◆' : ''}</em>
          </button>
          <div class="rowstrip"><MonthStrip cells={stripCells(c, preset)} selected={selStart} /></div>
          <span class="num rowq">{Math.round(s)}</span>
          <button type="button" class="add" onclick={() => addStay(c.key)} disabled={!emptyMonths.length}>
            Add
          </button>
        </li>
      {/each}
    </ul>
  </div>
</section>

<style>
  .wrap { padding-bottom: 70px; }

  .head-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
  }

  .templates { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
  .chip.clear { color: var(--terra-deep); }

  .tblurb {
    margin: 6px 0 0;
    text-align: right;
    font-family: var(--display);
    font-style: italic;
    font-size: 13px;
    color: var(--ink-3);
  }

  .board {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 18px 20px 16px;
  }

  @media (max-width: 600px) {
    .boardscroll {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .boardscroll .months,
    .boardscroll .timeline {
      min-width: 560px;
    }
  }

  .months {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 4px;
    font-size: 11px;
    color: var(--ink-3);
    text-align: center;
    margin-bottom: 6px;
  }

  .months .sel { color: var(--terra); font-weight: 600; }

  .timeline {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    grid-auto-flow: dense;
    gap: 4px;
    min-height: 58px;
  }

  .gap {
    border: 1.5px dashed var(--line);
    background: transparent;
    border-radius: 9px;
    color: var(--ink-3);
    font-size: 16px;
    min-height: 54px;
    transition: all 0.13s ease;
  }

  .gap:hover, .gap.sel { border-color: var(--terra); color: var(--terra); background: rgba(193, 79, 43, 0.06); }

  .stay {
    position: relative;
    background: #dcebe2;
    border: 1px solid var(--teal);
    border-radius: 9px;
    min-height: 54px;
    padding: 7px 9px;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    overflow: hidden;
  }

  .stay.schengen { background: var(--schengen-soft); border-color: var(--schengen); }
  .stay.hazard { box-shadow: inset 0 0 0 2px rgba(193, 79, 43, 0.5); }

  .stayname {
    background: none;
    border: none;
    padding: 0 14px 0 0;
    font-family: var(--sans);
    font-weight: 650;
    font-size: 12px;
    color: var(--ink);
    text-align: left;
    line-height: 1.2;
    text-decoration: underline transparent;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .stayname:hover { text-decoration-color: var(--ink-2); }

  .stayq {
    position: absolute;
    bottom: 5px;
    left: 9px;
    font-size: 11px;
    color: var(--ink-2);
  }

  .x {
    position: absolute;
    top: 3px;
    right: 5px;
    background: none;
    border: none;
    color: var(--ink-3);
    font-size: 15px;
    line-height: 1;
    padding: 2px;
  }

  .x:hover { color: var(--terra-deep); }

  .dur-ctl {
    position: absolute;
    bottom: 5px;
    right: 5px;
    display: flex;
    align-items: center;
    gap: 1px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .stay:hover .dur-ctl { opacity: 1; }

  @media (hover: none) {
    .dur-ctl { opacity: 1; }
  }

  .dur-val {
    font-size: 9.5px;
    color: var(--ink-2);
    padding: 0 1px;
  }

  .dur-btn {
    border: none;
    background: none;
    padding: 1px 4px;
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-2);
    line-height: 1;
    border-radius: 3px;
  }

  .dur-btn:hover:not(:disabled) { background: rgba(33, 36, 30, 0.1); color: var(--ink); }
  .dur-btn:disabled { opacity: 0.25; cursor: default; }

  .cont { font-size: 11px; color: var(--ink-2); white-space: nowrap; }

  .meter {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--line-soft);
  }

  .mlabel { font-size: 12px; font-weight: 600; color: var(--schengen); white-space: nowrap; }

  .track {
    position: relative;
    height: 8px;
    background: var(--paper-2);
    border-radius: 4px;
  }

  .used {
    height: 100%;
    border-radius: 4px;
    background: var(--schengen);
    transition: width 0.25s ease;
  }

  .meter.tight .used { background: var(--band-ok); }
  .meter.bad .used { background: var(--band-bad); }
  .meter.bad .mlabel { color: var(--band-bad); }

  .limit {
    position: absolute;
    right: 0;
    top: -3px;
    width: 2px;
    height: 14px;
    background: var(--ink-3);
  }

  .mread { font-size: 11.5px; color: var(--ink-2); white-space: nowrap; }

  .board-hint {
    margin: 4px 0 10px;
    text-align: center;
    font-family: var(--display);
    font-style: italic;
    font-size: 13px;
    color: var(--ink-3);
  }

  .totals {
    display: flex;
    flex-wrap: wrap;
    gap: 26px;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--line-soft);
  }

  .tot { display: flex; flex-direction: column; }
  .tv { font-size: 19px; font-weight: 600; }
  .tk { font-size: 10.5px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink-3); }
  .tot.warn .tv { color: var(--terra-deep); }

  .plan {
    margin-top: 16px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 14px 20px;
  }

  .planrow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
  }

  .planrow + .planrow { border-top: 1px solid var(--line-soft); }

  .plabel {
    width: 90px;
    flex-shrink: 0;
    font-size: 10.5px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .fctl {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    flex: 1;
  }

  .fctl input[type='number'] { width: 130px; }

  .cb {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    color: var(--ink-2);
  }

  .go, .use, .add {
    border: 1px solid var(--ink);
    background: var(--ink);
    color: var(--paper);
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }

  .go { padding: 5px 14px; }
  .use { padding: 4px 16px; }
  .add { padding: 4px 0; }

  .go:hover,
  .use:hover,
  .add:hover:not(:disabled) { background: var(--terra); border-color: var(--terra); }

  .add:disabled { opacity: 0.35; cursor: default; }

  .fcount { font-size: 11.5px; color: var(--ink-3); margin-left: auto; }

  .planmsg {
    margin: 8px 0 2px;
    padding-top: 8px;
    border-top: 1px solid var(--line-soft);
    font-size: 12.5px;
    color: var(--terra-deep);
  }

  .props { list-style: none; margin: 8px 0 0; padding: 0; }

  .props li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    padding: 8px 0;
    border-top: 1px solid var(--line-soft);
  }

  .ptitle { font-size: 12px; font-weight: 650; white-space: nowrap; }

  .pcities {
    flex: 1 1 260px;
    font-size: 12px;
    color: var(--ink-2);
    line-height: 1.5;
  }

  .pstat { font-size: 11px; color: var(--ink-3); white-space: nowrap; }
  .pstat b { font-size: 13px; font-weight: 600; color: var(--ink); }

  .picker { margin-top: 26px; }

  .pickhead {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }

  h2 { font-size: var(--h2); font-weight: 580; }

  .legendrow { margin-bottom: 8px; }

  .pickctl { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--ink-2); }
  .pickctl input { width: 200px; }

  .picker-empty {
    margin: 14px 0;
    padding: 22px 0;
    text-align: center;
    border-top: 1px solid var(--line-soft);
    font-family: var(--display);
    font-style: italic;
    font-size: 13.5px;
    color: var(--ink-2);
  }

  .rows { list-style: none; margin: 0; padding: 0; }

  .rows li {
    display: grid;
    grid-template-columns: 200px 1fr 40px 64px;
    align-items: center;
    gap: 14px;
    padding: 7px 0;
    border-top: 1px solid var(--line-soft);
  }

  .rowname {
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    font-family: var(--sans);
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink);
  }

  .rowname em {
    display: block;
    font-style: normal;
    font-weight: 400;
    font-size: 11px;
    color: var(--ink-3);
  }

  .rowname:hover { color: var(--terra-deep); }
  .rowq { font-size: 13px; text-align: right; color: var(--ink-2); }

  @media (max-width: 760px) {
    .rows li { grid-template-columns: 130px 1fr 56px; }
    .rowq { display: none; }
  }
</style>
