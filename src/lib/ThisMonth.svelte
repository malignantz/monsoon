<script>
  import CityCard from './CityCard.svelte';
  import { cities, regions, qolFor, valueFor, MONTHS } from './data.svelte.js';

  let { month, preset, mode, valueModel, onopen } = $props();

  let activeRegions = $state(new Set());
  let nonSchengenOnly = $state(false);

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
  <header class="head">
    <div>
      <p class="kicker">Where should I be in</p>
      <h1>{MONTHS[month]}<span class="dot">.</span></h1>
    </div>
    <div class="filters">
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
    <span class="key-label">Quality by month:</span>
    <span class="kswatch kgreat">great</span>
    <span class="kswatch kgood">good</span>
    <span class="kswatch kok">ok</span>
    <span class="kswatch kbad">avoid</span>
    <span class="kfest">· ★ festival</span>
  </div>

  <div class="grid">
    {#each ranked.slice(0, 48) as city (city.key)}
      <CityCard {city} {month} {preset} {mode} {valueModel} {onopen} />
    {/each}
  </div>
</section>

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin: 28px 0 22px;
  }

  h1 {
    font-size: 56px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .dot {
    color: var(--terra);
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-width: 560px;
    justify-content: flex-end;
  }

  .strip-key {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 18px;
    flex-wrap: wrap;
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

  .kfest {
    font-size: 11px;
    color: var(--ink-3);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
    gap: 14px;
    padding-bottom: 60px;
  }
</style>
