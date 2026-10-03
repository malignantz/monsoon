<script>
  import CityCard from './CityCard.svelte';
  import CityTable from './CityTable.svelte';
  import Legend from './Legend.svelte';
  import RegionMenu from './RegionMenu.svelte';
  import { cities, regions, qolFor, valueFor, swimNow, cityCost, partyWord, fmtMoney, routeStats, prefs, PRESETS, normalizePresetKey, MONTHS, MONTH_LETTERS, favorites } from './data.svelte.js';
  import { COST_OPTIONS } from './planner.js';
  import { route } from './route.svelte.js';

  let {
    month = $bindable(0),
    preset,
    mode = $bindable('quality'),
    currentMonth,
    valueModel,
    density = $bindable('cards'),
    activeRegions = $bindable(new Set()),
    keyHidden = $bindable(false),
    // The list as the user currently sees it (filtered + sorted), so the city
    // sheet's ←/→ steps through the same order.
    visibleKeys = $bindable([]),
    heroKey = null,
    openKey = null,
    onopen,
    onmodel,
    onsettings,
    onresume
  } = $props();

  let nonSchengenOnly = $state(false);
  let favOnly = $state(false);
  let swimOnly = $state(false);
  let maxCost = $state('');
  let minQol = $state('');
  let query = $state('');
  let showMore = $state(false);
  let showAll = $state(false);
  let tableOrder = $state([]);

  // Once the hero scrolls away, a compact bar re-exposes month + rank — exactly
  // what the old sticky toolbar carried, nothing more.
  let stuck = $state(false);
  let sentinel = $state();

  $effect(() => {
    if (!sentinel) return;
    // Only "stuck" once the sentinel has left through the TOP of the viewport.
    // A sentinel still below the fold (short phones, or on first paint) is also
    // "not intersecting" — without the top check the bar used to appear on top
    // of the static controls it duplicates.
    const io = new IntersectionObserver(([e]) => (stuck = !e.isIntersecting && e.boundingClientRect.top < 0), {
      rootMargin: '-4px 0px 0px 0px'
    });
    io.observe(sentinel);
    return () => io.disconnect();
  });

  const CAP = 48;
  const monthLong = $derived(new Date(2026, month, 1).toLocaleString('en-US', { month: 'long' }));

  // Budget caps scale with party size, mirroring My year's Max $/mo dropdown so
  // the two surfaces offer the same choices in the same control.
  const costOptions = $derived(COST_OPTIONS[partyWord()] ?? COST_OPTIONS.solo);

  // Score floors share the month strip's band vocabulary (great 85+, good 75+,
  // ok 65+), so a filter label always means the same thing as a strip colour.
  const QOL_OPTIONS = [
    { v: 65, label: 'OK (65+)' },
    { v: 75, label: 'Good (75+)' },
    { v: 85, label: 'Great (85+)' }
  ];

  function toggleRegion(r) {
    const next = new Set(activeRegions);
    next.has(r) ? next.delete(r) : next.add(r);
    activeRegions = next;
  }

  const moreActive = $derived(maxCost !== '' || minQol !== '' || swimOnly || nonSchengenOnly);
  const filtersActive = $derived(activeRegions.size > 0 || favOnly || moreActive);

  function resetFilters() {
    activeRegions = new Set();
    nonSchengenOnly = false;
    favOnly = false;
    swimOnly = false;
    maxCost = '';
    minQol = '';
  }

  // ── Find a city ──
  // Diacritics-insensitive: NFD strips combining accents (Málaga → malaga), and
  // the handful of letters NFD can't split (ł, ø, ß…) are folded by hand so
  // "wroclaw" finds Wrocław and "gdansk" finds Gdańsk.
  const FOLD = { ł: 'l', ø: 'o', đ: 'd', ð: 'd', ß: 'ss', æ: 'ae', œ: 'oe', ı: 'i', þ: 'th' };
  const fold = (s) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[łøđðßæœıþ]/g, (ch) => FOLD[ch]);

  const haystack = new Map(cities.map((c) => [c.key, fold(`${c.name} ${c.country}`)]));
  const terms = $derived(fold(query).trim().split(/\s+/).filter(Boolean));
  const matchesQuery = (c) => terms.every((t) => haystack.get(c.key).includes(t));

  function clearQuery(e) {
    query = '';
    e?.currentTarget?.closest('.find')?.querySelector('input')?.focus();
  }

  // One filter pass, shared by both densities. Cards re-rank it by the toolbar's
  // Highest Score/Best Value mode; the table column-sorts it itself.
  const filtered = $derived.by(() => {
    let list = cities;
    if (terms.length) list = list.filter(matchesQuery);
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

  // How many cities the search alone matches — tells the empty state whether
  // the query or the filters are what's excluding everything.
  const queryHits = $derived(terms.length ? cities.filter(matchesQuery).length : 0);

  function rank(list, by) {
    return list
      .map((c) => ({
        c,
        s: by === 'value' ? valueFor(c, month, preset, valueModel) : qolFor(c, month, preset),
        cost: c.months[month].cost2
      }))
      .sort((a, b) => {
        const diff = b.s - a.s;
        // Best Value tiebreaker (within 1pt): no budget cap here, so cheaper first.
        if (by === 'value' && Math.abs(diff) < 1.0) return a.cost - b.cost;
        return diff;
      });
  }

  const rankedScored = $derived(rank(filtered, mode));
  const ranked = $derived(rankedScored.map((x) => x.c));

  $effect(() => {
    visibleKeys = density === 'table' ? tableOrder : ranked.map((c) => c.key);
  });

  // ── The #1 answer ──
  // One plain finding under the dek: the top of the list exactly as ranked (the
  // table hides the sort toggle, so it answers by Score there).
  const answer = $derived.by(() => {
    const by = density === 'table' ? 'quality' : mode;
    const top = (by === mode ? rankedScored : rank(filtered, by))[0];
    if (!top) return null;
    const narrowed = filtersActive || terms.length > 0;
    const lead = by === 'value' ? 'Best Value' : 'Top';
    return { city: top.c, score: Math.round(top.s), label: `${lead}${narrowed ? ' match' : ''} for ${monthLong}` };
  });

  // ── Active scoring lens ──
  // Only surfaced when it isn't the default, so the browse page stays quiet for
  // most people but never silently ranks by a lens someone forgot they set.
  const lensKey = $derived(normalizePresetKey(preset));
  const lensLabel = $derived(
    lensKey === 'balanced' && !prefs.womensSafety
      ? ''
      : `${PRESETS[lensKey].label}${prefs.womensSafety ? ' · women’s safety' : ''}`
  );

  // ── Returning-user resume line ──
  const yourYear = $derived.by(() => {
    if (!route.stays.length) return null;
    const st = routeStats(route.stays, preset);
    return { stays: route.stays.length, avg: Math.round(st.avgQol) };
  });
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
            aria-pressed={i === month}
            tabindex={stuck ? 0 : -1}
            onclick={() => (month = i)}
          >
            {i === month ? MONTHS[i] : l}
          </button>
        {/each}
      </div>
      {#if density !== 'table'}
        <div class="seg" role="group" aria-label="Sort by">
          <button type="button" class:on={mode === 'quality'} aria-pressed={mode === 'quality'} tabindex={stuck ? 0 : -1} onclick={() => (mode = 'quality')}>Highest Score</button>
          <button type="button" class:on={mode === 'value'} aria-pressed={mode === 'value'} tabindex={stuck ? 0 : -1} onclick={() => (mode = 'value')}>Best Value</button>
        </div>
      {/if}
    </div>
  </div>

  {#if yourYear}
    <button type="button" class="resume" onclick={onresume}>
      <span class="resume-k">Your year:</span>
      <span class="num">{yourYear.stays} {yourYear.stays === 1 ? 'stay' : 'stays'}</span>
      <span class="resume-sep" aria-hidden="true">·</span>
      <span>avg score <span class="num">{yourYear.avg}</span></span>
      <span class="resume-sep" aria-hidden="true">·</span>
      <span class="resume-go">Resume <span aria-hidden="true">→</span></span>
    </button>
  {/if}

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
    {#if answer}
      <p class="answer">
        <button type="button" class="answer-btn" onclick={() => onopen(answer.city.key)}>
          <span class="answer-k">{answer.label}:</span>
          <span class="answer-city">{answer.city.name}, {answer.city.country}</span>
          <span class="answer-score">— <span class="num">{answer.score}</span>.</span>
        </button>
      </p>
    {/if}
  </header>

  <div class="controls">
    <div class="toolbar">
      <div class="meta-row">
        <p class="result-count num">{filtered.length} {filtered.length === 1 ? 'city' : 'cities'}</p>
        {#if lensLabel}
          <button type="button" class="lens" onclick={onsettings} title="Change in Settings">
            Ranked for: <strong>{lensLabel}</strong>
          </button>
        {/if}
        {#if density === 'cards' && keyHidden}
          <button type="button" class="keylink" onclick={() => (keyHidden = false)}>What do the colours mean?</button>
        {/if}
      </div>
      <div class="segs">
        {#if density !== 'table'}
          <div class="seg" role="group" aria-label="Sort by">
            <button type="button" class:on={mode === 'quality'} aria-pressed={mode === 'quality'} onclick={() => (mode = 'quality')}>Highest Score</button>
            <button type="button" class:on={mode === 'value'} aria-pressed={mode === 'value'} onclick={() => (mode = 'value')}>Best Value</button>
          </div>
        {/if}
        <div class="seg density" role="group" aria-label="View as">
          <button type="button" class:on={density === 'cards'} aria-pressed={density === 'cards'} onclick={() => (density = 'cards')}>
            <svg class="vicon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" />
            </svg>
            <span class="seglbl">Cards</span>
          </button>
          <button type="button" class:on={density === 'table'} aria-pressed={density === 'table'} onclick={() => (density = 'table')}>
            <svg class="vicon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
              <line x1="2.5" y1="4" x2="13.5" y2="4" /><line x1="2.5" y1="8" x2="13.5" y2="8" /><line x1="2.5" y1="12" x2="13.5" y2="12" />
            </svg>
            <span class="seglbl">Table</span>
          </button>
        </div>
      </div>
    </div>

    <div class="filterbar">
      <div class="find" role="search">
        <svg class="find-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" /><line x1="10.4" y1="10.4" x2="14" y2="14" />
        </svg>
        <input
          type="search"
          placeholder="Find a city"
          aria-label="Find a city or country"
          autocomplete="off"
          spellcheck="false"
          bind:value={query}
          onkeydown={(e) => {
            if (e.key === 'Escape' && query) {
              e.stopPropagation();
              query = '';
            }
          }}
        />
        {#if query}
          <button type="button" class="find-clear" aria-label="Clear search" onclick={clearQuery}>×</button>
        {/if}
      </div>

      <div class="filters">
        {#if filtersActive}
          <button type="button" class="chip clearchip" onclick={resetFilters}>✕ Clear</button>
        {/if}
        <button
          type="button"
          class="chip fav"
          class:on={favOnly}
          aria-pressed={favOnly}
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

  {#if density === 'cards' && !keyHidden}
    <!-- The whole key on one compact line: what a strip is, the four bands (with
         their height cue), the icons. Dismissed once, it stays dismissed. -->
    <div class="keyline">
      <span class="key-intro">Each strip is a city’s year:</span>
      <Legend bands />
      <button type="button" class="key-x" aria-label="Hide the colour key" title="Hide" onclick={() => (keyHidden = true)}>×</button>
    </div>
  {/if}

  {#if filtered.length === 0}
    <div class="emptystate">
      {#if terms.length && queryHits === 0}
        <p>No city or country matches “{query.trim()}”.</p>
        <button type="button" class="chip clearchip" onclick={clearQuery}>✕ Clear search</button>
      {:else if terms.length && filtersActive}
        <p>“{query.trim()}” matches {queryHits} {queryHits === 1 ? 'city' : 'cities'}, but none pass your filters.</p>
        <button type="button" class="chip clearchip" onclick={resetFilters}>✕ Clear filters</button>
      {:else if favOnly && favorites.size === 0}
        <p>No saved cities yet — tap ♡ on any city to save it here.</p>
        <button type="button" class="chip clearchip" onclick={() => (favOnly = false)}>← Back to all cities</button>
      {:else}
        <p>No cities match — try clearing a filter.</p>
        <button type="button" class="chip clearchip" onclick={resetFilters}>✕ Clear filters</button>
      {/if}
    </div>
  {:else if density === 'table'}
    <CityTable cities={filtered} {month} {preset} {valueModel} {onmodel} {onopen} bind:order={tableOrder} />
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
          {showAll ? `Show top ${CAP}` : `Show all ${ranked.length}`}
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

  /* The #1 answer: one plain finding, set in the body face so it reads as the
     page answering its own question rather than as another control. */
  .answer {
    margin: 10px 0 0;
    font-size: 13.5px;
    line-height: 1.4;
  }

  .answer-btn {
    display: inline;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: var(--ink-2);
    text-align: left;
  }

  .answer-city {
    font-weight: 600;
    color: var(--ink);
    text-decoration: underline;
    text-decoration-color: var(--line);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
    transition: text-decoration-color 0.15s ease, color 0.15s ease;
  }

  .answer-btn:hover .answer-city {
    color: var(--terra-deep);
    text-decoration-color: var(--terra);
  }

  .answer-score .num {
    font-weight: 600;
    color: var(--ink);
  }

  /* Returning-user resume line: a quiet slip above the hero, not a banner. */
  .resume {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 7px;
    margin: 18px 0 -8px;
    padding: 6px 14px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--card);
    font-size: 12.5px;
    color: var(--ink-2);
    text-align: left;
    transition: border-color 0.15s ease;
  }

  .resume:hover { border-color: var(--ink-3); }

  .resume-k { color: var(--ink-3); }
  .resume-sep { color: var(--ink-3); }

  .resume-go {
    font-weight: 600;
    color: var(--terra-deep);
  }

  .resume:hover .resume-go { color: var(--terra); }

  @media (max-width: 700px) {
    .view-head { margin: 18px 0 16px; }
    .view-head .kicker { margin: 0; }
    .resume {
      min-height: var(--tap);
      margin: 14px 0 -4px;
    }
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

  /* Content toolbar: the result count reads as a quiet caption, and the two pill
     controls (Highest Score/Best Value + Cards/Table) sit together beneath it as
     one left-aligned group, wrapping side-by-side → stacked as width allows. They
     look alike, so grouping them — rather than splitting them to opposite ends —
     keeps them from reading as misaligned. */
  .toolbar {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 9px;
  }

  /* Caption row: count, then (only when relevant) the active lens and the
     colour-key affordance — all quiet text, wrapping as width allows. */
  .meta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
  }

  .result-count {
    margin: 0;
    font-size: 12.5px;
    color: var(--ink-3);
  }

  /* Active-lens pill: says what the ranking is for, opens Settings to change it. */
  .lens {
    align-self: center;
    border: 1px solid var(--line);
    background: var(--card);
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 11.5px;
    color: var(--ink-3);
    white-space: nowrap;
    transition: border-color 0.15s ease, color 0.15s ease;
  }

  .lens strong {
    font-weight: 600;
    color: var(--terra-deep);
  }

  .lens:hover { border-color: var(--ink-3); color: var(--ink-2); }

  .keylink {
    border: none;
    background: none;
    padding: 0;
    font-size: 12px;
    color: var(--ink-3);
    text-decoration: underline;
    text-decoration-color: var(--line);
    text-underline-offset: 3px;
    white-space: nowrap;
    transition: color 0.15s ease, text-decoration-color 0.15s ease;
  }

  .keylink:hover {
    color: var(--terra-deep);
    text-decoration-color: var(--terra);
  }

  .segs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
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

  /* Search leads the filter row on desktop; on phones it takes its own row. */
  .filterbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
  }

  .find {
    position: relative;
    flex: 0 1 220px;
    min-width: 0;
  }

  .find-icon {
    position: absolute;
    left: 11px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ink-3);
    pointer-events: none;
  }

  .find input {
    width: 100%;
    height: 30px;
    padding: 0 30px 0 30px;
    border-radius: 999px;
    font-size: 12.5px;
    transition: border-color 0.15s ease;
  }

  .find input:hover { border-color: var(--ink-3); }
  .find input:focus { border-color: var(--terra); }

  .find input::placeholder {
    color: var(--ink-3);
    opacity: 1;
  }

  /* We draw our own clear button (consistent across browsers, tap-sized on phones). */
  .find input::-webkit-search-cancel-button,
  .find input::-webkit-search-decoration {
    -webkit-appearance: none;
    appearance: none;
  }

  .find-clear {
    position: absolute;
    right: 3px;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--ink-3);
    font-size: 16px;
    line-height: 1;
  }

  .find-clear:hover { color: var(--ink); background: var(--paper-2); }

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
    .monthsel { width: 100%; height: var(--tap); }
    .mbtn { width: auto; flex: 1; }

    /* Sort + Cards/Table segmented controls meet the tap floor on touch. The
       density toggle goes icon-only (labels stay for screen readers) so both
       controls share one row at 375px. */
    .seg,
    .seg.density { height: var(--tap); }

    .seg button { padding: 0 13px; }

    .seg.density button { padding: 0 15px; }

    .seglbl {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }

    .find { flex: 1 1 100%; }

    .find input {
      height: var(--tap);
      font-size: 16px; /* ≥16px stops iOS zooming the page on focus */
      padding-left: 34px;
      padding-right: var(--tap);
    }

    .find-icon { left: 13px; }

    .find-clear {
      right: 0;
      width: var(--tap);
      height: var(--tap);
      font-size: 19px;
    }

    .find-clear:hover { background: none; }

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

  /* A solid paper slab, never translucent: it slides (transform only — no
     opacity fade, which left it half-transparent over cards mid-scroll on
     phones) and is fully hidden with visibility when parked off-screen. Its own
     layer + an opaque background-color keep card text from showing through. */
  .stickbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: var(--z-sticky);
    isolation: isolate;
    background-color: var(--paper);
    border-bottom: 1px solid var(--line);
    box-shadow: 0 8px 18px -14px rgba(33, 36, 30, 0.45);
    padding-top: var(--safe-t);
    transform: translateY(-100%);
    visibility: hidden;
    pointer-events: none;
    transition:
      transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
      visibility 0s linear 0.22s;
  }

  .stickbar.show {
    transform: translateY(0);
    visibility: visible;
    pointer-events: auto;
    transition:
      transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
      visibility 0s;
  }

  .stickbar-inner {
    max-width: 1240px;
    margin: 0 auto;
    padding: 9px var(--pad-x);
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
    .stickbar-inner { padding: 8px var(--pad-x); gap: 8px; }
    .stick-now { display: none; }
    .monthsel.compact { flex: 1; }
    .monthsel.compact .mbtn { flex: 1; width: auto; }
    .stickbar .seg { display: none; }
  }

  /* The colour key, compressed to one quiet line (wraps to two on phones),
     with a dismiss control at its end. */
  .keyline {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 10px;
    margin: -4px 0 14px;
    padding: 0 0 0 1px;
  }

  .key-intro {
    font-size: 11.5px;
    color: var(--ink-2);
    white-space: nowrap;
  }

  .keyline :global(.legend) { flex: 0 1 auto; min-width: 0; }

  .key-x {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 999px;
    background: none;
    color: var(--ink-3);
    font-size: 15px;
    line-height: 1;
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .key-x:hover { color: var(--ink); border-color: var(--line); }

  @media (max-width: 700px) {
    /* Phones: the swatches sit right above the strips they explain, so the
       intro drops and the key packs into two short lines (bands, then icons).
       The dismiss button's 44px tap area overhangs into the page gutter. */
    .keyline { position: relative; padding-right: 26px; }
    .key-intro { display: none; }
    .keyline :global(.bandkey) { flex-wrap: wrap; }

    /* Tap-sized, pinned to the line's top-right so wrapping never strands it. */
    .key-x {
      position: absolute;
      top: -10px;
      right: -10px;
      width: var(--tap);
      height: var(--tap);
    }
  }

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
