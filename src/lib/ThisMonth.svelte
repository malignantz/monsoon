<script>
  import CityCard from './CityCard.svelte';
  import Legend from './Legend.svelte';
  import { cities, regions, qolFor, valueFor, MONTHS } from './data.svelte.js';

  let { month, preset, mode, valueModel, onopen } = $props();

  let activeRegions = $state(new Set());
  let nonSchengenOnly = $state(false);
  let showAll = $state(false);

  const CAP = 48;

  function toggleRegion(r) {
    const next = new Set(activeRegions);
    next.has(r) ? next.delete(r) : next.add(r);
    activeRegions = next;
  }

  const ranked = $derived.by(() => {
    let list = cities;
    if (activeRegions.size) list = list.filter((c) => activeRegions.has(c.region));
    if (nonSchengenOnly) list = list.filter((c) => !c.schengen);
    return list
      .map((c) => ({
        c,
        s: mode === 'value' ? valueFor(c, month, preset, valueModel) : qolFor(c, month, preset)
      }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
  });
</script>

<section>
  <header class="view-head">
    <div>
      <p class="kicker">Where should I be in</p>
      <h1>{MONTHS[month]}<span class="dot">.</span></h1>
    </div>
    <div class="filters">
      {#if activeRegions.size > 0}
        <span class="fcount">Filters ·</span>
        <button type="button" class="chip clearchip" onclick={() => (activeRegions = new Set())}>
          ✕ Clear
        </button>
      {/if}
      {#each regions as r}
        <button type="button" class="chip" class:on={activeRegions.has(r)} onclick={() => toggleRegion(r)}>
          {r}
        </button>
      {/each}
      <button
        type="button"
        class="chip schengen"
        class:on={nonSchengenOnly}
        onclick={() => (nonSchengenOnly = !nonSchengenOnly)}
      >
        ◆ non-Schengen only
      </button>
    </div>
  </header>

  <div class="strip-key">
    <span class="key-unit">
      <span class="key-label">Quality by month:</span>
      <span class="kswatch kgreat">great</span>
      <span class="kswatch kgood">good</span>
      <span class="kswatch kok">ok</span>
      <span class="kswatch kbad">avoid</span>
    </span>
    <Legend />
  </div>

  {#if ranked.length === 0}
    <div class="emptystate">
      <p>No cities match — try clearing a filter.</p>
      <button
        type="button"
        class="chip clearchip"
        onclick={() => { activeRegions = new Set(); nonSchengenOnly = false; }}
      >
        ✕ Clear filters
      </button>
    </div>
  {/if}

  <div class="grid">
    {#each ranked.slice(0, showAll ? ranked.length : CAP) as city (city.key)}
      <CityCard {city} {month} {preset} {mode} {valueModel} {onopen} />
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
</section>

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    max-width: 560px;
    justify-content: flex-end;
  }

  .fcount {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-3);
    white-space: nowrap;
  }

  .clearchip { color: var(--terra-deep); white-space: nowrap; }

  @media (max-width: 700px) {
    .filters {
      flex-wrap: nowrap;
      overflow-x: auto;
      justify-content: flex-start;
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

  .strip-key {
    display: flex;
    align-items: center;
    gap: 6px 16px;
    margin-bottom: 18px;
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
