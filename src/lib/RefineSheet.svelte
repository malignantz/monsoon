<script>
  // Phone-only bottom sheet that holds every home control that left the fold:
  // Favorites, Non-Schengen, Swimmable, Regions, budget and score floor, the
  // Best Value weight, Cards/Table, Compare and the full colour key.
  // Dialog behaviour (focus in and back, Tab cycle, Escape, scroll lock) is the
  // shared focusTrap; motion is switched off by the global reduced-motion rule.
  import Legend from './Legend.svelte';
  import CostWeight from './CostWeight.svelte';
  import { focusTrap } from './focusTrap.js';
  import { fmtMoney, moneySymbol, partyWord, MONTHS } from './data.svelte.js';

  let {
    month,
    count,
    regions,
    costOptions,
    qolOptions,
    favCount = 0,
    favOnly = $bindable(false),
    nonSchengenOnly = $bindable(false),
    swimOnly = $bindable(false),
    maxCost = $bindable(''),
    minQol = $bindable(''),
    activeRegions = $bindable(new Set()),
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

  function toggleRegion(r) {
    const next = new Set(activeRegions);
    next.has(r) ? next.delete(r) : next.add(r);
    activeRegions = next;
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
        <span class="num n">{count} {count === 1 ? 'city' : 'cities'}</span>
      </div>

      <section>
        <p class="k">Show</p>
        <div class="rows">
          <button type="button" class="chip fav" class:on={favOnly} aria-pressed={favOnly} onclick={() => (favOnly = !favOnly)}>
            {favOnly ? '♥' : '♡'} Favorites{favCount ? ` · ${favCount}` : ''}
          </button>
          <label class="refine-toggle">
            <input type="checkbox" bind:checked={nonSchengenOnly} />
            <span>◆ Non-Schengen</span>
          </label>
          <label class="refine-toggle">
            <input type="checkbox" bind:checked={swimOnly} />
            <span>≋ Swimmable in {MONTHS[month]}</span>
          </label>
        </div>
      </section>

      <section>
        <p class="k" id="refine-regions">Regions</p>
        <div class="chips" role="group" aria-labelledby="refine-regions">
          <button type="button" class="chip" class:on={activeRegions.size === 0} aria-pressed={activeRegions.size === 0} onclick={() => (activeRegions = new Set())}>All</button>
          {#each regions as r}
            <button type="button" class="chip" class:on={activeRegions.has(r)} aria-pressed={activeRegions.has(r)} onclick={() => toggleRegion(r)}>{r}</button>
          {/each}
        </div>
      </section>

      <section>
        <p class="k">Budget and score</p>
        <div class="refine-fields">
          <label class="refine-field">
            <span class="refine-field-lbl">Max {moneySymbol()}/mo {partyWord()}</span>
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
                {#each qolOptions as o}<option value={o.v}>{o.label}</option>{/each}
              </select>
            </div>
          </label>
        </div>
      </section>

      {#if mode === 'value' && density === 'cards'}
        <section>
          <CostWeight value={costWeight} onchange={oncostweight} context="refine_sheet" />
        </section>
      {/if}

      <section>
        <p class="k">View</p>
        <div class="viewrow">
          <div class="vseg" role="group" aria-label="View as">
            <button type="button" class:on={density === 'cards'} aria-pressed={density === 'cards'} onclick={() => (density = 'cards')}>Cards</button>
            <button type="button" class:on={density === 'table'} aria-pressed={density === 'table'} onclick={() => (density = 'table')}>Table</button>
          </div>
          <button type="button" class="cmp" class:on={comparing} aria-pressed={comparing} onclick={toggleCompare}>
            {comparing ? 'Stop comparing' : 'Compare cities'}
          </button>
        </div>
      </section>

      <section>
        <p class="k">Key</p>
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
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .rows { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
  .rows .chip { align-self: flex-start; }
  .rows .refine-toggle { min-height: var(--tap); }

  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { min-height: var(--tap); white-space: nowrap; }

  .chip.fav.on {
    color: var(--terra-deep);
    border-color: var(--terra);
    background: var(--terra-soft);
  }

  .refine-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .refine-select select { height: var(--tap); }

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
