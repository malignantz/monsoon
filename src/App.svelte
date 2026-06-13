<script>
  import ThisMonth from './lib/ThisMonth.svelte';
  import MyYear from './lib/MyYear.svelte';
  import Explore from './lib/Explore.svelte';
  import CitySheet from './lib/CitySheet.svelte';
  import { cityByKey, MONTHS, MONTH_LETTERS, PRESETS } from './lib/data.svelte.js';

  const PREFS = 'atlas.prefs.v1';

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS)) ?? {};
    } catch {
      return {};
    }
  }

  const p = loadPrefs();

  let view = $state(p.view ?? 'month');
  let month = $state(p.month ?? new Date().getMonth());
  let mode = $state(p.mode ?? 'quality');
  let preset = $state(PRESETS[p.preset] ? p.preset : 'balanced');
  let valueModel = $state(p.valueModel ?? 'adjusted');
  let cityKey = $state(new URLSearchParams(location.search).get('city'));

  $effect(() => {
    localStorage.setItem(PREFS, JSON.stringify({ view, month, mode, preset, valueModel }));
  });

  const openCity = $derived(cityKey ? cityByKey.get(cityKey) : null);

  function openSheet(key) {
    cityKey = key;
    const u = new URL(location.href);
    u.searchParams.set('city', key);
    history.pushState({}, '', u);
  }

  function closeSheet() {
    cityKey = null;
    const u = new URL(location.href);
    u.searchParams.delete('city');
    history.pushState({}, '', u);
  }

  $effect(() => {
    const onPop = () => (cityKey = new URLSearchParams(location.search).get('city'));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });

  const NAV = [
    { id: 'month', label: 'This month' },
    { id: 'year', label: 'My year' },
    { id: 'explore', label: 'Explore' }
  ];
</script>

<div class="shell">
  <header class="bar">
    <div class="brand">
      <span class="mark">✳</span>
      <div>
        <span class="name">Slow Travel Atlas</span>
        <span class="tag">follow the good months</span>
      </div>
    </div>

    <nav>
      {#each NAV as n}
        <button type="button" class="navbtn" class:on={view === n.id} onclick={() => (view = n.id)}>
          {n.label}
        </button>
      {/each}
    </nav>

  </header>

  {#if view !== 'year'}
    <div class="toolbar">
      <div class="ctl-group">
        <span class="ctl-lbl" aria-hidden="true">Viewing</span>
        <div class="monthsel" role="group" aria-label="Month">
          {#each MONTH_LETTERS as l, i}
            <button
              type="button"
              class="mbtn"
              class:on={i === month}
              title={MONTHS[i]}
              onclick={() => (month = i)}
            >
              {l}
            </button>
          {/each}
        </div>
      </div>

      <div class="ctl-group">
        <span class="ctl-lbl" aria-hidden="true">Rank by</span>
        <div class="seg" role="group" aria-label="Rank by">
          <button type="button" class:on={mode === 'quality'} onclick={() => (mode = 'quality')}>Quality</button>
          <button type="button" class:on={mode === 'value'} onclick={() => (mode = 'value')}>Value</button>
        </div>
      </div>

      <div class="ctl-group">
        <span class="ctl-lbl" aria-hidden="true">Optimize for</span>
        <select bind:value={preset} title={PRESETS[preset].blurb} aria-label="Priority preset">
          {#each Object.entries(PRESETS) as [k, v]}
            <option value={k}>{v.label}</option>
          {/each}
        </select>
      </div>
    </div>
  {/if}

  <main>
    {#if view === 'month'}
      <ThisMonth {month} {preset} {mode} {valueModel} onopen={openSheet} />
    {:else if view === 'year'}
      <MyYear {preset} onpreset={(p) => (preset = p)} onopen={openSheet} />
    {:else}
      <Explore {month} {preset} {mode} {valueModel} onmodel={(m) => (valueModel = m)} onopen={openSheet} />
    {/if}
  </main>

  <footer class="basefoot">
    <span>Your ancestors moved with the seasons. 111 cities, scored month by month — clean air, mild weather, no typhoons, festivals on, 90 Schengen days at a time.</span>
    <span class="num">methodology v5 · 2026</span>
  </footer>
</div>

{#if openCity}
  <CitySheet city={openCity} {month} {preset} onclose={closeSheet} onmonth={(i) => (month = i)} />
{/if}

<style>
  .shell {
    max-width: 1240px;
    margin: 0 auto;
    padding: 18px 26px 0;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 26px;
    padding-bottom: 16px;
    border-bottom: 1.5px solid var(--ink);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-right: auto;
  }

  .mark {
    font-size: 26px;
    color: var(--terra);
    line-height: 1;
  }

  .name {
    display: block;
    font-family: var(--display);
    font-weight: 620;
    font-size: 19px;
    line-height: 1.1;
  }

  .tag {
    display: block;
    font-family: var(--display);
    font-style: italic;
    font-size: 12px;
    color: var(--ink-2);
  }

  nav { display: flex; gap: 2px; }

  .navbtn {
    background: none;
    border: none;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink-2);
    padding: 7px 13px;
    border-radius: 999px;
  }

  .navbtn:hover { color: var(--ink); }

  .navbtn.on {
    background: var(--ink);
    color: var(--paper);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 10px;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }

  .ctl-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .ctl-lbl {
    font-size: 9.5px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--ink-3);
    font-family: var(--sans);
    line-height: 1;
  }

  .monthsel {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 999px;
    overflow: hidden;
    background: var(--card);
  }

  .mbtn {
    border: none;
    background: none;
    width: 26px;
    padding: 5px 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-3);
  }

  .mbtn:hover { color: var(--ink); }

  .mbtn.on {
    background: var(--terra);
    color: #fdf3ec;
  }

  .seg {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 999px;
    overflow: hidden;
    background: var(--card);
  }

  .seg button {
    border: none;
    background: none;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink-3);
    padding: 6px 14px;
  }

  .seg button.on {
    background: var(--ink);
    color: var(--paper);
  }

  .basefoot {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    border-top: 1px solid var(--line);
    padding: 16px 0 28px;
    font-family: var(--display);
    font-style: italic;
    font-size: 13px;
    color: var(--ink-3);
  }

  .basefoot .num {
    font-family: var(--mono);
    font-style: normal;
    white-space: nowrap;
  }
</style>
