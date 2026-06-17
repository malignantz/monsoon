<script>
  import CityCard from './CityCard.svelte';
  import CityTable from './CityTable.svelte';
  import Legend from './Legend.svelte';
  import RegionMenu from './RegionMenu.svelte';
  import { cities, regions, qolFor, valueFor, swimNow, cityCost, partyWord, fmtMoney, MONTHS, MONTH_LETTERS, favorites } from './data.svelte.js';
  import { COST_OPTIONS } from './planner.js';

  let {
    month = $bindable(0),
    preset,
    mode = $bindable('quality'),
    currentMonth,
    valueModel,
    density = $bindable('cards'),
    heroKey = null,
    openKey = null,
    onopen,
    onmodel
  } = $props();

  let activeRegions = $state(new Set());
  let nonSchengenOnly = $state(false);
  let favOnly = $state(false);
  let swimOnly = $state(false);
  let maxCost = $state('');
  let minQol = $state('');
  let showMore = $state(false);
  let showAll = $state(false);

  // Once the hero scrolls away, a compact bar re-exposes month + rank — exactly
  // what the old sticky toolbar carried, nothing more.
  let stuck = $state(false);
  let sentinel = $state();

  $effect(() => {
    if (!sentinel) return;
    const io = new IntersectionObserver(([e]) => (stuck = !e.isIntersecting), {
      rootMargin: '-4px 0px 0px 0px'
    });
    io.observe(sentinel);
    return () => io.disconnect();
  });

  const CAP = 48;

  // Budget caps scale with party size, mirroring My year's Max $/mo dropdown so
  // the two surfaces offer the same choices in the same control.
  const costOptions = $derived(COST_OPTIONS[partyWord()] ?? COST_OPTIONS.solo);

  // Discrete Score floors, styled like My year's Min safety / Min air options.
  const QOL_OPTIONS = [
    { v: 70, label: 'Good (70+)' },
    { v: 80, label: 'Great (80+)' },
    { v: 90, label: 'Excellent (90+)' }
  ];

  function toggleRegion(r) {
    const next = new Set(activeRegions);
    next.has(r) ? next.delete(r) : next.add(r);
    activeRegions = next;
  }

  const moreActive = $derived(maxCost !== '' || minQol !== '' || swimOnly || nonSchengenOnly);

  function resetFilters() {
    activeRegions = new Set();
    nonSchengenOnly = false;
    favOnly = false;
    swimOnly = false;
    maxCost = '';
    minQol = '';
  }

  // One filter pass, shared by both densities. Cards re-rank it by the toolbar's
  // Highest Score/Best Value mode; the table column-sorts it itself.
  const filtered = $derived.by(() => {
    let list = cities;
    if (favOnly) list = list.filter((c) => favorites.has(c.key));
    if (activeRegions.size) list = list.filter((c) => activeRegions.has(c.region));
    if (nonSchengenOnly) list = list.filter((c) => !c.schengen);
    if (swimOnly) list = list.filter((c) => swimNow(c, month));
    const mc = parseFloat(maxCost);
    if (!isNaN(mc)) list = list.filter((c) => cityCost(c.months[month]) <= mc);
    const mq = parseFloat(minQol);
    if (!isNaN(mq)) list = list.filter((c) => qolFor(c, month, preset) >= mq);
    return list;
  });

  const ranked = $derived.by(() =>
    filtered
      .map((c) => ({
        c,
        s: mode === 'value' ? valueFor(c, month, preset, valueModel) : qolFor(c, month, preset),
        cost: c.months[month].cost2
      }))
      .sort((a, b) => {
        const diff = b.s - a.s;
        // Best Value tiebreaker (within 1pt): no budget cap here, so cheaper first.
        if (mode === 'value' && Math.abs(diff) < 1.0) return a.cost - b.cost;
        return diff;
      })
      .map((x) => x.c)
  );
</script>

<section>
  <div class="stickbar" class:show={stuck} aria-hidden={!stuck}>
    <div class="stickbar-inner">
      <span class="stick-now">{MONTHS[month]}</span>
      <div class="monthsel compact" role="group" aria-label="Choose month">
        {#each MONTH_LETTERS as l, i}
          <button
            type="button"
            class="mbtn"
            class:on={i === month}
            class:now={i === currentMonth}
            title={MONTHS[i]}
            aria-label={MONTHS[i]}
            tabindex={stuck ? 0 : -1}
            onclick={() => (month = i)}
          >
            {i === month ? MONTHS[i] : l}
          </button>
        {/each}
      </div>
      {#if density !== 'table'}
        <div class="seg" role="group" aria-label="Sort by">
          <button type="button" class:on={mode === 'quality'} tabindex={stuck ? 0 : -1} onclick={() => (mode = 'quality')}>Highest Score</button>
          <button type="button" class:on={mode === 'value'} tabindex={stuck ? 0 : -1} onclick={() => (mode = 'value')}>Best Value</button>
        </div>
      {/if}
    </div>
  </div>

  <header class="view-head">
    <p class="kicker">Where should I be in</p>
    <div class="title-row">
      <h1>{MONTHS[month]}<span class="dot">.</span></h1>
      <div class="monthsel" role="group" aria-label="Choose month">
        {#each MONTH_LETTERS as l, i}
          <button
            type="button"
            class="mbtn"
            class:on={i === month}
            class:now={i === currentMonth}
            title="{MONTHS[i]}{i === currentMonth ? ' (current month)' : ''}"
            aria-label={MONTHS[i]}
            aria-pressed={i === month}
            onclick={() => (month = i)}
          >
            {i === month ? MONTHS[i] : l}
          </button>
        {/each}
      </div>
    </div>
    <p class="dek">The good months, ranked — clean air, mild weather, no typhoons, festivals on.</p>
  </header>

  <div class="controls">
    <div class="toolbar">
      <div class="toolbar-lead">
        <p class="result-count num">{filtered.length} {filtered.length === 1 ? 'city' : 'cities'}</p>
        {#if density !== 'table'}
          <div class="seg" role="group" aria-label="Sort by">
            <button type="button" class:on={mode === 'quality'} onclick={() => (mode = 'quality')}>Highest Score</button>
            <button type="button" class:on={mode === 'value'} onclick={() => (mode = 'value')}>Best Value</button>
          </div>
        {/if}
      </div>
      <div class="seg density" role="group" aria-label="View as">
          <button type="button" class:on={density === 'cards'} aria-pressed={density === 'cards'} onclick={() => (density = 'cards')}>
            <svg class="vicon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" />
            </svg>
            Cards
          </button>
          <button type="button" class:on={density === 'table'} aria-pressed={density === 'table'} onclick={() => (density = 'table')}>
            <svg class="vicon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
              <line x1="2.5" y1="4" x2="13.5" y2="4" /><line x1="2.5" y1="8" x2="13.5" y2="8" /><line x1="2.5" y1="12" x2="13.5" y2="12" />
            </svg>
            Table
          </button>
      </div>
    </div>

    <div class="filters">
      {#if activeRegions.size > 0 || nonSchengenOnly || favOnly || moreActive}
        <button type="button" class="chip clearchip" onclick={resetFilters}>✕ Clear</button>
      {/if}
      <button
        type="button"
        class="chip fav"
        class:on={favOnly}
        title="Show only saved cities"
        onclick={() => (favOnly = !favOnly)}
      >
        {favOnly ? '♥' : '♡'} Favorites{favorites.size ? ` · ${favorites.size}` : ''}
      </button>
      <RegionMenu {regions} active={activeRegions} ontoggle={toggleRegion} onclear={() => (activeRegions = new Set())} />
      <button
        type="button"
        class="chip more"
        class:on={showMore || moreActive}
        aria-expanded={showMore}
        onclick={() => (showMore = !showMore)}
      >
        Refine{moreActive ? ' ·' : ''}{showMore ? ' ▴' : ' ▾'}
      </button>
    </div>
  </div>

  <div class="stick-sentinel" bind:this={sentinel} aria-hidden="true"></div>

  {#if showMore}
    <div class="refine">
      <div class="refine-fields">
        <label class="refine-field">
          <span class="refine-field-lbl">Max $/mo {partyWord()}</span>
          <div class="refine-select">
            <select bind:value={maxCost} aria-label="Max monthly budget, {partyWord()}">
              <option value="">Any</option>
              {#each costOptions as v}<option value={v}>{fmtMoney(v)}</option>{/each}
            </select>
          </div>
        </label>
        <label class="refine-field">
          <span class="refine-field-lbl">Min score</span>
          <div class="refine-select">
            <select bind:value={minQol} aria-label="Minimum score">
              <option value="">Any</option>
              {#each QOL_OPTIONS as o}<option value={o.v}>{o.label}</option>{/each}
            </select>
          </div>
        </label>
      </div>
      <div class="refine-toggles">
        <label class="refine-toggle">
          <input type="checkbox" bind:checked={swimOnly} />
          <span>≋ Swimmable in {MONTHS[month]}</span>
        </label>
        <label class="refine-toggle">
          <input type="checkbox" bind:checked={nonSchengenOnly} />
          <span>◆ Non-Schengen</span>
        </label>
      </div>
    </div>
  {/if}

  {#if density === 'cards'}
    <div class="strip-key">
      <p class="key-intro">Each colored strip is the city's whole year — green months are great to be there, red months aren't.</p>
      <div class="key-row">
        <span class="key-unit">
          <span class="key-label">Score by month:</span>
          <span class="kswatch kgreat">great</span>
          <span class="kswatch kgood">good</span>
          <span class="kswatch kok">ok</span>
          <span class="kswatch kbad">avoid</span>
        </span>
        <Legend />
      </div>
    </div>
  {/if}

  {#if filtered.length === 0}
    <div class="emptystate">
      {#if favOnly && favorites.size === 0}
        <p>No saved cities yet — tap ♡ on any city to save it here.</p>
        <button type="button" class="chip clearchip" onclick={() => (favOnly = false)}>← Back to all cities</button>
      {:else}
        <p>No cities match — try clearing a filter.</p>
        <button type="button" class="chip clearchip" onclick={resetFilters}>✕ Clear filters</button>
      {/if}
    </div>
  {:else if density === 'table'}
    <CityTable cities={filtered} {month} {preset} {valueModel} {onmodel} {onopen} />
  {:else}
    <div class="grid">
      {#each ranked.slice(0, showAll ? ranked.length : CAP) as city (city.key)}
        <CityCard {city} {month} {preset} {mode} {valueModel} {heroKey} {openKey} {onopen} />
      {/each}
    </div>

    <div class="gridfoot">
      <span class="count num">
        Showing {showAll ? ranked.length : Math.min(CAP, ranked.length)} of {ranked.length} for {MONTHS[month]}
      </span>
      {#if ranked.length > CAP}
        <button type="button" class="chip" onclick={() => (showAll = !showAll)}>
          {showAll ? 'Show top 48' : `Show all ${ranked.length}`}
        </button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .dek {
    margin: 8px 0 0;
    max-width: 32ch;
    font-family: var(--display);
    font-style: italic;
    font-size: 14px;
    color: var(--ink-2);
    line-height: 1.35;
  }

  /* Hero is a vertical lockup; override the shared row layout from app.css. */
  .view-head {
    display: block;
    margin: 26px 0 18px;
  }

  .title-row {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 8px 18px;
    margin-top: 6px;
  }

  /* The month picker sits flush under the headline word — title and control
     read as one object. The big word is the current selection. */
  .monthsel {
    display: flex;
    align-items: center;
    height: 34px;
    border: 1px solid var(--line);
    border-radius: 999px;
    overflow: hidden;
    background: var(--card);
    margin-bottom: 7px;
  }

  .mbtn {
    position: relative;
    border: none;
    background: none;
    width: 27px;
    height: 100%;
    padding: 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-3);
    transition: color 0.15s ease;
  }

  .mbtn:hover { color: var(--ink); }

  .mbtn.now::after {
    content: '';
    position: absolute;
    bottom: 3px;
    left: 50%;
    transform: translateX(-50%);
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--terra);
  }

  .mbtn.on {
    width: auto;
    padding: 0 11px;
    background: var(--terra);
    color: #fdf3ec;
  }

  .mbtn.on.now::after { background: #fdf3ec; }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 18px;
  }

  /* Content toolbar, split by what each control acts on: the data lives on the
     left (count + the Highest Score/Best Value ranking), the presentation on the
     right (the Cards/Table view switcher, sitting just above the grid it draws).
     Opposite ends keep the two pill controls from reading as one group, and the
     count anchors the left even in table view where the sort segment drops away. */
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 16px;
  }

  .result-count {
    margin: 0;
    font-size: 12.5px;
    color: var(--ink-3);
  }

  .toolbar-lead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
  }

  .seg,
  .seg.density {
    display: flex;
    align-items: center;
    height: 32px;
    border: 1px solid var(--line);
    border-radius: 999px;
    overflow: hidden;
    background: var(--card);
    flex-shrink: 0;
  }

  .seg button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    background: none;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink-3);
    padding: 0 14px;
    height: 100%;
    transition: color 0.15s ease;
  }

  .seg button:hover { color: var(--ink); }

  .seg button.on {
    background: var(--ink);
    color: var(--paper);
  }

  /* Grid / rows glyphs read as a view switcher at a glance; dimmed on the
     inactive segment so only the active mode's icon carries full weight. */
  .vicon {
    flex: none;
    opacity: 0.85;
  }

  .seg.density button.on .vicon { opacity: 1; }
  .seg.density button:not(.on) .vicon { opacity: 0.6; }

  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    justify-content: flex-start;
  }

  .clearchip { color: var(--terra-deep); white-space: nowrap; }
  .chip.more { white-space: nowrap; }
  .chip.fav { white-space: nowrap; }

  .chip.fav.on {
    color: var(--terra-deep);
    border-color: var(--terra);
    background: var(--terra-soft, #f6e3d8);
  }

  @media (max-width: 700px) {
    .title-row { gap: 10px 14px; }
    .monthsel { width: 100%; height: 38px; }
    .mbtn { width: auto; flex: 1; }

    .filters {
      flex-wrap: nowrap;
      overflow-x: auto;
      max-width: 100%;
      width: 100%;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      -webkit-mask-image: linear-gradient(90deg, #000 92%, transparent);
      mask-image: linear-gradient(90deg, #000 92%, transparent);
      padding-bottom: 2px;
    }

    .filters::-webkit-scrollbar { display: none; }
    .filters .chip { white-space: nowrap; flex-shrink: 0; }
  }

  .stick-sentinel {
    height: 0;
    margin: 0;
  }

  .stickbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 45;
    background: var(--paper);
    border-bottom: 1px solid var(--line);
    box-shadow: 0 6px 16px -12px rgba(33, 36, 30, 0.4);
    transform: translateY(-100%);
    opacity: 0;
    pointer-events: none;
    transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.18s ease;
  }

  .stickbar.show {
    transform: translateY(0);
    opacity: 1;
    pointer-events: auto;
  }

  .stickbar-inner {
    max-width: 1240px;
    margin: 0 auto;
    padding: 9px 26px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .stick-now {
    font-family: var(--display);
    font-weight: 600;
    font-size: 16px;
    color: var(--ink);
    letter-spacing: -0.01em;
    min-width: 0;
  }

  .monthsel.compact {
    height: 30px;
  }

  .monthsel.compact .mbtn {
    width: 24px;
    font-size: 10.5px;
  }

  .monthsel.compact .mbtn.on {
    width: auto;
    padding: 0 9px;
  }

  .stickbar .seg {
    height: 30px;
    margin-left: auto;
  }

  @media (max-width: 700px) {
    .stickbar-inner { padding: 8px 16px; gap: 8px; }
    .stick-now { display: none; }
    .monthsel.compact { flex: 1; }
    .monthsel.compact .mbtn { flex: 1; width: auto; }
    .stickbar .seg { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .stickbar { transition: opacity 0.18s ease; transform: none; }
  }

  .strip-key {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin-bottom: 18px;
  }

  .key-intro {
    margin: 0;
    max-width: 64ch;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-2);
  }

  .key-row {
    display: flex;
    align-items: center;
    gap: 6px 16px;
    flex-wrap: wrap;
  }

  .key-unit {
    display: flex;
    align-items: center;
    gap: 7px;
    white-space: nowrap;
  }

  .key-label {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-right: 2px;
  }

  .kswatch {
    border-radius: 3px;
    padding: 1px 7px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .kgreat { background: var(--band-great); color: var(--band-great-ink); }
  .kgood  { background: var(--band-good);  color: var(--band-good-ink);  }
  .kok    { background: var(--band-ok);    color: var(--band-ok-ink);    }
  .kbad   { background: var(--band-bad);   color: var(--band-bad-ink);   }

  .emptystate {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 44px 0 30px;
    font-family: var(--display);
    font-style: italic;
    font-size: 14.5px;
    color: var(--ink-2);
  }

  .emptystate p { margin: 0; }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
    gap: 14px;
  }

  .gridfoot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 12px 2px 0;
    padding-bottom: 60px;
  }

  .count {
    font-size: 12px;
    color: var(--ink-3);
  }
</style>
