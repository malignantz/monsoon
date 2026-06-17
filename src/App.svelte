<script>
  import { tick } from 'svelte';
  import ThisMonth from './lib/ThisMonth.svelte';
  import MyYear from './lib/MyYear.svelte';
  import CitySheet from './lib/CitySheet.svelte';
  import Settings from './lib/Settings.svelte';
  import Methodology from './lib/Methodology.svelte';
  import About from './lib/About.svelte';
  import HowTo from './lib/HowTo.svelte';
  import { cities, cityByKey, qolFor, valueFor, decodeRouteCompact, decodeRoute, normalizePresetKey } from './lib/data.svelte.js';
  import { track } from './lib/analytics.js';

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
  // Decorative trip name carried alongside the route; decoded independently so a
  // missing or malformed name never affects the itinerary itself.
  const sharedName = initialRoute.length ? (shareParams.get('n') ?? '').slice(0, 60) : '';

  // 'explore' merged into 'month' as a card/table density toggle; fall back for saved prefs.
  let view = $state(initialRoute.length ? 'year' : p.view === 'explore' ? 'month' : (p.view ?? 'month'));
  let month = $state(currentMonth);
  let mode = $state(p.mode ?? 'quality');
  let preset = $state(normalizePresetKey(p.preset));
  let valueModel = $state(p.valueModel ?? 'adjusted');
  let density = $state(p.density === 'table' ? 'table' : 'cards');
  let cityKey = $state(new URLSearchParams(location.search).get('city'));
  // The city whose card should wear the shared `city-hero` name during a
  // card↔sheet view transition. Held only across the transition, then cleared.
  let transitioningKey = $state(null);

  // No first-run gate: everyone lands straight in the app. The settings panel is
  // always re-openable from the gear (mode is always "settings" now).
  let settingsOpen = $state(false);
  let aboutOpen = $state(false);
  let methodOpen = $state(false);
  let howToOpen = $state(false);

  // No first-run banner or glow cues. Discovery rides on the controls themselves:
  // a labelled, warm-tinted "How it works" button is the brightest thing in an
  // otherwise neutral bar, so the eye lands there without us pushing instruction
  // (NN/g: a labelled control out-discovers any bare icon + decoration).
  function openSettings() {
    settingsOpen = true;
  }

  function openHowTo() {
    howToOpen = true;
  }

  function closeSettings() {
    settingsOpen = false;
  }

  $effect(() => {
    localStorage.setItem(PREFS, JSON.stringify({ view, mode, preset, valueModel, density }));
  });

  // Surface view: fires on load and on every This month ↔ My year switch, so we
  // can see which surface people land on and whether they discover the second.
  $effect(() => {
    track('surface_view', { surface: view === 'year' ? 'my_year' : 'this_month' });
  });

  // Dwell timing for the city sheet: how long a detail view holds attention is a
  // proxy for whether the detail actually delivered.
  let sheetOpenedAt = 0;

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

  // Skip view transitions when unsupported or when the user prefers reduced
  // motion — the underlying state change still happens, just without the morph.
  const canAnimate = () =>
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function applyOpen(key, { replace = false, month: sheetMonth } = {}) {
    if (Number.isInteger(sheetMonth) && sheetMonth >= 0 && sheetMonth < 12) month = sheetMonth;
    cityKey = key;
    sheetOpenedAt = Date.now();
    track('city_sheet_open', { city: key, month, from: view === 'year' ? 'my_year' : 'this_month' });
    const u = new URL(location.href);
    u.searchParams.set('city', key);
    replace ? history.replaceState({}, '', u) : history.pushState({}, '', u);
  }

  function applyClose() {
    if (sheetOpenedAt) {
      track('city_sheet_close', { city: cityKey, dwell_ms: Date.now() - sheetOpenedAt });
      sheetOpenedAt = 0;
    }
    cityKey = null;
    const u = new URL(location.href);
    u.searchParams.delete('city');
    history.pushState({}, '', u);
  }

  // Card → sheet: tag the clicked card with the hero name in the outgoing
  // snapshot, then let the same name on the sheet's title morph into place.
  async function openSheet(key, opts = {}) {
    if (!canAnimate()) {
      applyOpen(key, opts);
      return;
    }
    transitioningKey = key;
    await tick();
    const vt = document.startViewTransition(async () => {
      applyOpen(key, opts);
      await tick();
    });
    vt.finished.finally(() => (transitioningKey = null));
  }

  // Sheet → card: hold the hero name on the closing city so it flies back to
  // its card, which reappears as the sheet unmounts.
  async function closeSheet() {
    if (!canAnimate()) {
      applyClose();
      return;
    }
    transitioningKey = cityKey;
    await tick();
    const vt = document.startViewTransition(async () => {
      applyClose();
      await tick();
    });
    vt.finished.finally(() => (transitioningKey = null));
  }

  // ←/→ stepping swaps cities within the open sheet: a plain crossfade (no card
  // hero) lets the title morph from one city to the next.
  function stepCity(dir) {
    const i = rankedKeys.indexOf(cityKey);
    if (i < 0) return;
    const next = rankedKeys[(i + dir + rankedKeys.length) % rankedKeys.length];
    if (!canAnimate()) {
      applyOpen(next, { replace: true });
      return;
    }
    document.startViewTransition(() => applyOpen(next, { replace: true }));
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
      <button type="button" class="howto" onclick={openHowTo} aria-label="How to use Monsoon">How it works</button>
      <button type="button" class="gear util" onclick={openSettings} aria-label="Settings" title="Settings">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </nav>

  </header>

  <main>
    {#if view === 'month'}
      <ThisMonth bind:month bind:mode {currentMonth} {preset} {valueModel} bind:density heroKey={transitioningKey} openKey={cityKey} onopen={openSheet} onmodel={(m) => (valueModel = m)} />
    {:else}
      <MyYear bind:preset {sharedRoute} {sharedName} onsharedresolved={resolveShared} onopen={openSheet} />
    {/if}
  </main>

  <footer class="basefoot">
    <span>Your ancestors moved with the seasons. 111 cities, scored month by month — clean air, mild weather, no typhoons, festivals on, 90 Schengen days at a time.</span>
    <span class="footlinks">
      <button type="button" class="num footlink" onclick={() => (aboutOpen = true)}>about</button>
      <span aria-hidden="true">·</span>
      <button type="button" class="num footlink" onclick={() => (methodOpen = true)}>methodology · 2026</button>
    </span>
  </footer>
</div>

{#if openCity}
  <CitySheet city={openCity} {month} {preset} onclose={closeSheet} onmonth={(i) => (month = i)} onstep={stepCity} />
{/if}

{#if settingsOpen}
  <Settings bind:preset onclose={closeSettings} />
{/if}

{#if aboutOpen}
  <About onclose={() => (aboutOpen = false)} />
{/if}

{#if methodOpen}
  <Methodology onclose={() => (methodOpen = false)} />
{/if}

{#if howToOpen}
  <HowTo onclose={() => (howToOpen = false)} />
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

  .util {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--ink-3);
    padding: 9px;
    margin-left: 2px;
    border-radius: 999px;
    line-height: 1;
  }

  .util:hover { color: var(--ink); }

  /* The help control carries a word, not a glyph: a warm-tinted "How it works"
     button is the brightest element in an otherwise neutral bar, so the eye finds
     it without a banner or a glow ring. */
  .howto {
    background: none;
    border: none;
    font-size: 14px;
    font-weight: 600;
    color: var(--terra-deep);
    padding: 7px 13px;
    margin-left: 2px;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
  }

  .howto:hover { color: var(--terra); background: var(--paper-2); }

  .howto:focus-visible {
    outline: 2px solid var(--terra);
    outline-offset: 2px;
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

  .footlinks {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    flex-shrink: 0;
    font-family: var(--mono);
    font-style: normal;
    white-space: nowrap;
  }

  .footlink {
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

  .footlink:hover {
    color: var(--terra-deep);
    text-decoration-color: var(--terra);
  }

  @media (max-width: 700px) {
    .basefoot {
      flex-direction: column;
      gap: 8px;
    }

    .footlinks {
      align-self: flex-start;
    }
  }
</style>
