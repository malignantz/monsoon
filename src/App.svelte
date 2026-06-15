<script>
  import ThisMonth from './lib/ThisMonth.svelte';
  import MyYear from './lib/MyYear.svelte';
  import CitySheet from './lib/CitySheet.svelte';
  import Settings from './lib/Settings.svelte';
  import Methodology from './lib/Methodology.svelte';
  import { cities, cityByKey, qolFor, valueFor, MONTHS, MONTH_LETTERS, PRESETS, onboarded, decodeRouteCompact, decodeRoute } from './lib/data.svelte.js';

  const PREFS = 'atlas.prefs.v1';

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS)) ?? {};
    } catch {
      return {};
    }
  }

  const p = loadPrefs();

  const currentMonth = new Date().getMonth();

  // A `?i=` (compact) or `?route=` (readable fallback) link opens straight into
  // My year as a read-only shared itinerary.
  const shareParams = new URLSearchParams(location.search);
  const compact = decodeRouteCompact(shareParams.get('i'));
  const initialRoute = compact.length ? compact : decodeRoute(shareParams.get('route'));
  let sharedRoute = $state(initialRoute.length ? initialRoute : null);

  // 'explore' merged into 'month' as a card/table density toggle; fall back for saved prefs.
  let view = $state(initialRoute.length ? 'year' : p.view === 'explore' ? 'month' : (p.view ?? 'month'));
  let month = $state(currentMonth);
  let mode = $state(p.mode ?? 'quality');
  let preset = $state(PRESETS[p.preset] ? p.preset : 'balanced');
  let valueModel = $state(p.valueModel ?? 'adjusted');
  let density = $state(p.density === 'table' ? 'table' : 'cards');
  let cityKey = $state(new URLSearchParams(location.search).get('city'));

  // First run (no saved settings) shows onboarding; the gear re-opens the same
  // panel in "settings" mode. onboarded.done flips once settings are saved.
  let settingsOpen = $state(!onboarded.done);
  let settingsMode = $state(onboarded.done ? 'settings' : 'onboarding');
  let methodOpen = $state(false);
  // Brief highlight on the gear after onboarding collapses into it, so the new
  // user clocks where their settings landed.
  let gearPulse = $state(false);

  function openSettings() {
    settingsMode = 'settings';
    settingsOpen = true;
  }

  function closeSettings() {
    const fromOnboarding = settingsMode === 'onboarding';
    settingsOpen = false;
    if (fromOnboarding) {
      gearPulse = true;
      setTimeout(() => (gearPulse = false), 1100);
    }
  }

  $effect(() => {
    localStorage.setItem(PREFS, JSON.stringify({ view, mode, preset, valueModel, density }));
  });

  const openCity = $derived(cityKey ? cityByKey.get(cityKey) : null);

  // Same ranking the views use (unfiltered), so ←/→ in the sheet flips
  // through the deck in the order the user is browsing it.
  const rankedKeys = $derived(
    [...cities]
      .map((c) => ({
        key: c.key,
        s: mode === 'value' ? valueFor(c, month, preset, valueModel) : qolFor(c, month, preset)
      }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.key)
  );

  function openSheet(key, { replace = false, month: sheetMonth } = {}) {
    if (Number.isInteger(sheetMonth) && sheetMonth >= 0 && sheetMonth < 12) month = sheetMonth;
    cityKey = key;
    const u = new URL(location.href);
    u.searchParams.set('city', key);
    replace ? history.replaceState({}, '', u) : history.pushState({}, '', u);
  }

  function stepCity(dir) {
    const i = rankedKeys.indexOf(cityKey);
    if (i < 0) return;
    openSheet(rankedKeys[(i + dir + rankedKeys.length) % rankedKeys.length], { replace: true });
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
    { id: 'year', label: 'My year' }
  ];

  // The logo strip is real data: Bali's twelve months under the balanced lens —
  // the dry season cresting to two great months, monsoon softening the edges.
  // The brand primitive, doing the brand's one job.
  const BRAND_BANDS = ['ok', 'ok', 'good', 'good', 'good', 'great', 'great', 'good', 'good', 'good', 'ok', 'ok'];

  // Visitor adopted or dismissed the shared route: drop it from state and strip
  // the param so a reload (or a later share) starts from their own year.
  function resolveShared() {
    sharedRoute = null;
    const u = new URL(location.href);
    u.searchParams.delete('i');
    u.searchParams.delete('route');
    history.replaceState({}, '', u);
  }

  function goHome() {
    if (cityKey) closeSheet();
    view = 'month';
  }
</script>

<div class="shell">
  <header class="bar">
    <button type="button" class="brand" onclick={goHome} aria-label="Monsoon — go to This month">
      <span class="lockup">
        <span class="name">Monsoon<span class="tld">.fyi</span></span>
        <span class="brandstrip" aria-hidden="true">
          {#each BRAND_BANDS as b}<span class="bcell band-{b}"></span>{/each}
        </span>
      </span>
      <span class="tag">follow the good months</span>
    </button>

    <nav>
      {#each NAV as n}
        <button type="button" class="navbtn" class:on={view === n.id} onclick={() => (view = n.id)}>
          {n.label}
        </button>
      {/each}
      <button type="button" class="gear" class:pulse={gearPulse} onclick={openSettings} aria-label="Settings" title="Settings">⚙</button>
    </nav>

  </header>

  {#if view !== 'year'}
    <div class="toolbar">
      <div class="ctl-group monthgroup">
        <span class="ctl-lbl" aria-hidden="true">Viewing</span>
        <div class="monthsel" role="group" aria-label="Month">
          {#each MONTH_LETTERS as l, i}
            <button
              type="button"
              class="mbtn"
              class:on={i === month}
              class:now={i === currentMonth}
              title="{MONTHS[i]}{i === currentMonth ? ' (current month)' : ''}"
              onclick={() => (month = i)}
            >
              {i === month ? MONTHS[i] : l}
            </button>
          {/each}
        </div>
      </div>

      {#if density !== 'table'}
        <div class="ctl-group">
          <span class="ctl-lbl" aria-hidden="true">Rank by</span>
          <div class="seg" role="group" aria-label="Rank by">
            <button type="button" class:on={mode === 'quality'} onclick={() => (mode = 'quality')}>Quality</button>
            <button type="button" class:on={mode === 'value'} onclick={() => (mode = 'value')}>Value</button>
          </div>
        </div>
      {/if}

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
      <ThisMonth {month} {preset} {mode} {valueModel} bind:density onopen={openSheet} onmodel={(m) => (valueModel = m)} />
    {:else}
      <MyYear bind:preset {sharedRoute} onsharedresolved={resolveShared} onopen={openSheet} />
    {/if}
  </main>

  <footer class="basefoot">
    <span>Your ancestors moved with the seasons. 111 cities, scored month by month — clean air, mild weather, no typhoons, festivals on, 90 Schengen days at a time.</span>
    <button type="button" class="num methodlink" onclick={() => (methodOpen = true)}>methodology v5 · 2026</button>
  </footer>
</div>

{#if openCity}
  <CitySheet city={openCity} {month} {preset} onclose={closeSheet} onmonth={(i) => (month = i)} onstep={stepCity} />
{/if}

{#if settingsOpen}
  <Settings mode={settingsMode} onclose={closeSettings} />
{/if}

{#if methodOpen}
  <Methodology onclose={() => (methodOpen = false)} />
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
    align-items: baseline;
    gap: 14px;
    margin-right: auto;
    padding: 4px 6px 4px 0;
    background: none;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
  }

  .brand:focus-visible {
    outline: 2px solid var(--terra);
    outline-offset: 3px;
  }

  .lockup {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .name {
    display: block;
    font-family: var(--display);
    font-optical-sizing: auto;
    font-weight: 600;
    font-size: 23px;
    letter-spacing: -0.018em;
    line-height: 1;
    color: var(--ink);
  }

  .tld {
    color: var(--terra);
    font-family: var(--mono);
    font-weight: 500;
    font-size: 0.56em;
    letter-spacing: 0;
  }

  /* The signature strip, scaled down as a wordmark underline. Sized to sit
     flush under "Monsoon" so the lockup reads as one object. */
  .brandstrip {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 1.5px;
    width: 122px;
  }

  .bcell {
    height: 5px;
    border-radius: 1.5px;
  }

  .bcell.band-great { background: var(--band-great); }
  .bcell.band-good { background: var(--band-good); }
  .bcell.band-ok { background: var(--band-ok); }
  .bcell.band-bad { background: var(--band-bad); }

  .brand:hover .bcell { opacity: 0.88; }

  .tag {
    display: block;
    font-family: var(--display);
    font-style: italic;
    font-size: 12px;
    color: var(--ink-2);
    line-height: 1;
  }

  @media (max-width: 460px) {
    .tag { display: none; }
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

  .gear {
    background: none;
    border: none;
    font-size: 17px;
    color: var(--ink-3);
    padding: 7px 8px;
    margin-left: 2px;
    border-radius: 999px;
    line-height: 1;
  }

  .gear:hover { color: var(--ink); }

  /* Lands the onboarding collapse: a quick pop + terracotta flash on the gear. */
  .gear.pulse {
    animation: gearpop 0.95s ease;
    color: var(--terra);
  }

  @keyframes gearpop {
    0% { transform: scale(0.7); }
    35% { transform: scale(1.3); }
    60% { transform: scale(0.96); }
    100% { transform: scale(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .gear.pulse { animation: none; }
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 10px;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
    position: sticky;
    top: 0;
    z-index: 40;
    background: var(--paper);
    box-shadow: 0 6px 14px -12px rgba(33, 36, 30, 0.35);
  }

  .toolbar select {
    height: 32px;
    padding: 0 10px;
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
    align-items: center;
    height: 32px;
    border: 1px solid var(--line);
    border-radius: 999px;
    overflow: hidden;
    background: var(--card);
  }

  .mbtn {
    position: relative;
    border: none;
    background: none;
    width: 26px;
    height: 100%;
    padding: 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-3);
  }

  .mbtn.now::after {
    content: '';
    position: absolute;
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--terra);
  }

  .mbtn.on.now::after { background: #fdf3ec; }

  .mbtn.on { width: auto; padding: 0 10px; }

  @media (max-width: 700px) {
    .monthgroup { width: 100%; }
    .monthsel { width: 100%; height: 36px; }
    .mbtn { width: auto; flex: 1; }
  }

  .mbtn:hover { color: var(--ink); }

  .mbtn.on {
    background: var(--terra);
    color: #fdf3ec;
  }

  .seg {
    display: flex;
    align-items: center;
    height: 32px;
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
    padding: 0 14px;
    height: 100%;
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

  .methodlink {
    background: none;
    border: none;
    padding: 0;
    font-size: inherit;
    color: var(--ink-3);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: var(--line);
    text-underline-offset: 3px;
    transition: color 0.15s ease, text-decoration-color 0.15s ease;
  }

  .methodlink:hover {
    color: var(--terra-deep);
    text-decoration-color: var(--terra);
  }
</style>
