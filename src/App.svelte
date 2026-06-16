<script>
  import { tick } from 'svelte';
  import ThisMonth from './lib/ThisMonth.svelte';
  import MyYear from './lib/MyYear.svelte';
  import CitySheet from './lib/CitySheet.svelte';
  import Settings from './lib/Settings.svelte';
  import Methodology from './lib/Methodology.svelte';
  import About from './lib/About.svelte';
  import HowTo from './lib/HowTo.svelte';
  import { cities, cityByKey, qolFor, valueFor, onboarded, saveSettings, decodeRouteCompact, decodeRoute, normalizePresetKey } from './lib/data.svelte.js';

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

  // First-visit nudge (no saved settings yet): a non-blocking hint plus a one-time
  // pulse on the top-right utilities, so people discover personalization and the
  // guide without being gated by a modal.
  let showNudge = $state(!onboarded.done);
  let utilPulse = $state(false);
  let didPulse = false;

  $effect(() => {
    if (!showNudge || didPulse) return;
    didPulse = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    utilPulse = true;
    setTimeout(() => (utilPulse = false), 1100);
  });

  // Any first-run engagement (or an explicit dismiss) retires the nudge for good:
  // saveSettings() persists the current (default) prefs so it won't return.
  function dismissNudge() {
    if (!showNudge) return;
    showNudge = false;
    saveSettings();
  }

  function openSettings() {
    settingsOpen = true;
    dismissNudge();
  }

  function openHowTo() {
    howToOpen = true;
    dismissNudge();
  }

  function closeSettings() {
    settingsOpen = false;
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

  // Skip view transitions when unsupported or when the user prefers reduced
  // motion — the underlying state change still happens, just without the morph.
  const canAnimate = () =>
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function applyOpen(key, { replace = false, month: sheetMonth } = {}) {
    if (Number.isInteger(sheetMonth) && sheetMonth >= 0 && sheetMonth < 12) month = sheetMonth;
    cityKey = key;
    const u = new URL(location.href);
    u.searchParams.set('city', key);
    replace ? history.replaceState({}, '', u) : history.pushState({}, '', u);
  }

  function applyClose() {
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
      <button type="button" class="util" class:pulse={utilPulse} onclick={openHowTo} aria-label="How to use Monsoon" title="How to use Monsoon">?</button>
      <button type="button" class="gear util" class:pulse={utilPulse} onclick={openSettings} aria-label="Settings" title="Settings">⚙</button>
    </nav>

  </header>

  {#if showNudge}
    <div class="nudge" role="note">
      <span class="nudge-txt">
        New here? <button type="button" class="nudge-link" onclick={openSettings}>Tune your atlas</button>
        or <button type="button" class="nudge-link" onclick={openHowTo}>see how it works</button>
        — anytime from <span class="gly" aria-hidden="true">⚙</span> and <span class="gly" aria-hidden="true">?</span> up top.
      </span>
      <button type="button" class="nudge-x" onclick={dismissNudge} aria-label="Dismiss this tip">×</button>
    </div>
  {/if}

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
    background: none;
    border: none;
    font-size: 17px;
    color: var(--ink-3);
    padding: 7px 8px;
    margin-left: 2px;
    border-radius: 999px;
    line-height: 1;
  }

  .util:hover { color: var(--ink); }

  /* The "?" is a glyph in the body font, not an icon — nudge it to optically
     match the gear's weight and size. */
  .util:not(.gear) {
    font-size: 15px;
    font-weight: 700;
    width: 31px;
  }

  /* First-visit cue: a quick pop + terracotta flash on the ? and gear, so a new
     user clocks where personalization and help live. */
  .util.pulse {
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
    .util.pulse { animation: none; }
  }

  .nudge {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 12px 0 0;
    padding: 9px 8px 9px 16px;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 14px;
    font-size: 13px;
    color: var(--ink-2);
  }

  .nudge-txt { flex: 1; line-height: 1.4; }

  .nudge-link {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-weight: 600;
    color: var(--terra-deep);
    border-bottom: 1px dotted var(--terra);
    cursor: pointer;
  }

  .nudge-link:hover { color: var(--terra); }

  .gly {
    font-weight: 700;
    color: var(--ink);
  }

  .nudge-x {
    flex: none;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--ink-3);
    font-size: 17px;
    line-height: 1;
    cursor: pointer;
  }

  .nudge-x:hover { color: var(--ink); background: var(--paper-3); }

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
