<script>
  // Phone-only bottom sheet that holds every home control that left the fold.
  // The filter sections are rendered from the registry's groups
  // (filters.svelte.js), so a new filter appears here with no edit; View
  // (Cards/Table, Compare), the Best Value weight and the key sit in their own
  // section that is not counted and that "Clear all" leaves alone.
  // Dialog behaviour (focus in and back, Tab cycle, Escape, scroll lock) is the
  // shared focusTrap; motion is switched off by the global reduced-motion rule.
  import Legend from './Legend.svelte';
  import CostWeight from './CostWeight.svelte';
  import FilterControl from './FilterControl.svelte';
  import { focusTrap } from './focusTrap.js';
  import { GROUPS, filtersIn, filterState, setFilter } from './filters.svelte.js';

  let {
    ctx,
    count,
    total,
    favCount = 0,
    density = $bindable('cards'),
    mode = 'quality',
    costWeight,
    oncostweight,
    comparing = false,
    oncomparemode,
    keyHidden = $bindable(false),
    anyActive = false,
    onclear,
    onclose
  } = $props();

  const sections = GROUPS.map((g) => ({ ...g, items: filtersIn(g.id) })).filter((g) => g.items.length);
  const allRegions = $derived(filterState.regions.length === 0);
  const countText = $derived(count === total ? `${total} cities` : `${count} of ${total} cities`);

  function toggleRegion(r) {
    const cur = filterState.regions;
    setFilter('regions', cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]);
  }

  function toggleCompare() {
    const turningOn = !comparing;
    oncomparemode?.();
    if (turningOn) onclose();
  }
</script>

<div class="scrim">
  <button type="button" class="scrim-back" aria-label="Close refine" tabindex="-1" onclick={onclose}></button>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="refine-h" tabindex="-1" use:focusTrap={{ onescape: onclose }}>
    <div class="grab" aria-hidden="true"></div>
    <div class="body">
      <div class="head">
        <h2 id="refine-h">Refine</h2>
        <span class="num n" aria-live="polite">{countText}</span>
      </div>

      {#each sections as g (g.id)}
        <section aria-labelledby="refine-{g.id}">
          <h3 class="k" id="refine-{g.id}">{g.label}</h3>
          {#if g.id === 'regions'}
            <div class="chips" role="group" aria-labelledby="refine-{g.id}">
              <button type="button" class="chip" class:on={allRegions} aria-pressed={allRegions} onclick={() => setFilter('regions', [])}>All</button>
              {#each g.items[0].options(ctx) as o (o.v)}
                {@const on = filterState.regions.includes(o.v)}
                <button type="button" class="chip" class:on aria-pressed={on} onclick={() => toggleRegion(o.v)}>{o.label}</button>
              {/each}
            </div>
          {:else if g.id === 'show'}
            <button type="button" class="chip fav" class:on={filterState.favOnly} aria-pressed={filterState.favOnly} onclick={() => setFilter('favOnly', !filterState.favOnly)}>
              <span aria-hidden="true">{filterState.favOnly ? '♥' : '♡'}</span> Favorites only{favCount ? ` · ${favCount}` : ''}
            </button>
          {:else}
            <div class="rows">
              {#each g.items as f (f.id)}
                <FilterControl filter={f} {ctx} variant="pills" />
              {/each}
            </div>
          {/if}
        </section>
      {/each}

      <section class="viewsec" aria-labelledby="refine-view">
        <h3 class="k" id="refine-view">View</h3>
        <div class="viewrow">
          <div class="vseg" role="group" aria-label="View as">
            <button type="button" class:on={density === 'cards'} aria-pressed={density === 'cards'} onclick={() => (density = 'cards')}>Cards</button>
            <button type="button" class:on={density === 'table'} aria-pressed={density === 'table'} onclick={() => (density = 'table')}>Table</button>
          </div>
          <button type="button" class="cmp" class:on={comparing} aria-pressed={comparing} onclick={toggleCompare}>
            {comparing ? 'Stop comparing' : 'Compare cities'}
          </button>
        </div>
        {#if mode === 'value' && density === 'cards'}
          <div class="cw">
            <CostWeight value={costWeight} onchange={oncostweight} context="refine_sheet" />
          </div>
        {/if}
        <p class="k k2">Key</p>
        <Legend bands />
        {#if keyHidden}
          <button type="button" class="textbtn showkey" onclick={() => (keyHidden = false)}>Show key on the page</button>
        {/if}
      </section>
    </div>

    <footer class="foot">
      <button type="button" class="textbtn" disabled={!anyActive} onclick={onclear}>Clear all</button>
      <button type="button" class="done" onclick={onclose}>Show {count} {count === 1 ? 'city' : 'cities'}</button>
    </footer>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    display: flex;
    align-items: flex-end;
    background: var(--scrim);
  }

  .scrim-back {
    position: fixed;
    inset: 0;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
  }

  .sheet {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: var(--sheet-max-h);
    background: var(--paper);
    border-radius: 16px 16px 0 0;
    outline: none;
    animation: sheet-up 0.24s cubic-bezier(0.22, 1, 0.36, 1);
  }

  @keyframes sheet-up {
    from { transform: translateY(24px); opacity: 0.4; }
    to { transform: none; opacity: 1; }
  }

  .grab {
    flex: none;
    width: 36px;
    height: 4px;
    margin: 8px auto 4px;
    border-radius: 999px;
    background: var(--line);
  }

  .body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px var(--pad-x) 8px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  h2 {
    margin: 0;
    font-family: var(--display);
    font-size: 20px;
    font-weight: 600;
    color: var(--ink);
  }

  .n { font-size: 12.5px; color: var(--ink-3); }

  .k {
    margin: 0 0 8px;
    font-family: var(--sans);
    line-height: 1.3;
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .rows { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
  .rows :global(.refine-toggle) { min-height: var(--tap); }
  .viewsec { padding-top: 16px; border-top: 1px solid var(--line); }
  .cw { margin-top: 12px; }
  .k2 { margin-top: 16px; }

  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { min-height: var(--tap); white-space: nowrap; }

  .chip.fav { gap: 5px; }

  .chip.fav.on {
    color: var(--terra-deep);
    border-color: var(--terra);
    background: var(--terra-soft);
  }

  .viewrow { display: flex; flex-direction: column; gap: 10px; }

  .vseg {
    display: flex;
    height: var(--tap);
    border: 1px solid var(--line);
    border-radius: 999px;
    overflow: hidden;
    background: var(--card);
  }

  .vseg button {
    flex: 1;
    border: none;
    background: none;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink-3);
  }

  .vseg button.on { background: var(--ink); color: var(--paper); }

  .cmp {
    height: var(--tap);
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--card);
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink-2);
  }

  .cmp.on { background: var(--ink); border-color: var(--ink); color: var(--paper); }

  .textbtn {
    min-height: var(--tap);
    padding: 0 4px;
    border: none;
    background: none;
    font-size: 14px;
    font-weight: 600;
    color: var(--terra-deep);
  }

  .textbtn:disabled { color: var(--ink-3); opacity: 0.6; }
  .showkey { display: block; margin-top: 4px; padding-left: 0; }

  .foot {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px var(--pad-x) calc(12px + var(--safe-b));
    border-top: 1px solid var(--line);
    background: var(--paper);
  }

  .done {
    height: var(--tap);
    padding: 0 22px;
    border: none;
    border-radius: 999px;
    background: var(--ink);
    color: var(--paper);
    font-size: 14px;
    font-weight: 600;
  }
</style>
