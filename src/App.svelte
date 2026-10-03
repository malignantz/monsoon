<script>
  import { tick, untrack } from 'svelte';
  import ThisMonth from './lib/ThisMonth.svelte';
  import CompareTray from './lib/CompareTray.svelte';
  import { lazy } from './lib/lazy.svelte.js';
  import { focusTrap, focusTopLayer } from './lib/focusTrap.js';
  import { cities, cityByKey, regions, qolFor, valueFor, decodeRouteCompact, decodeRoute, normalizePresetKey, MONTHS, prefetchDetail } from './lib/data.svelte.js';
  import { addCity, removeStayRef } from './lib/route.svelte.js';
  import { track } from './lib/analytics.js';
  import { readUrlState, buildUrl } from './lib/urlState.js';
  import { MAX_COMPARE, sanitizeCompare, loadCompare, saveCompare } from './lib/compare.js';

  // Code-split: This month is the landing surface and ships in the entry
  // chunk; My year and every dialog/sheet load on first use (or on intent —
  // see prefetch below), each with a small loading/reload fallback.
  const MyYearL = lazy(() => import('./lib/MyYear.svelte'));
  const CitySheetL = lazy(() => import('./lib/CitySheet.svelte'));
  const CompareSheetL = lazy(() => import('./lib/CompareSheet.svelte'));
  const SettingsL = lazy(() => import('./lib/Settings.svelte'));
  const MethodologyL = lazy(() => import('./lib/Methodology.svelte'));
  const AboutL = lazy(() => import('./lib/About.svelte'));
  const HowToL = lazy(() => import('./lib/HowTo.svelte'));
  const quiet = (p) => p.catch(() => {}); // the fallback shows the error

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

  // Shareable state from the query string wins field by field; anything absent
  // falls back to saved prefs, then defaults (see urlState.js for the params).
  const fromUrl = readUrlState(location.search, regions);

  // 'explore' merged into 'month' as a card/table density toggle; fall back for saved prefs.
  // A bare shared city link (?city=…) opens over This month, so closing the
  // sheet lands on the ranked list rather than wherever the visitor last was.
  // Any This-month param (month, sort, layout, region) is a link to the
  // ranking too, so it wins over the visitor's last-used view.
  const linksToRanking =
    fromUrl.city || fromUrl.compare || fromUrl.month != null || fromUrl.mode || fromUrl.density || fromUrl.regions;
  let view = $state(
    fromUrl.view ??
      (initialRoute.length ? 'year' : linksToRanking ? 'month' : p.view === 'explore' ? 'month' : (p.view ?? 'month'))
  );
  let month = $state(fromUrl.month ?? currentMonth);
  // A ranking link with no sort param means the default sort (that is how the
  // sender's clean URL was built), not the recipient's last-used one.
  const rankingLink = fromUrl.month != null || fromUrl.density || fromUrl.regions || fromUrl.compare;
  let mode = $state(fromUrl.mode ?? (rankingLink ? 'quality' : (p.mode ?? 'quality')));
  let preset = $state(normalizePresetKey(p.preset));
  let valueModel = $state(p.valueModel ?? 'adjusted');
  let density = $state(fromUrl.density ?? (p.density === 'table' ? 'table' : 'cards'));
  let activeRegions = $state(new Set(fromUrl.regions ?? []));
  let cityKey = $state(fromUrl.city && cityByKey.has(fromUrl.city) ? fromUrl.city : null);

  // ── Compare ──
  // compareKeys is the in-progress pick (session-only, max three). A
  // `?compare=a,b` link replaces it and opens the comparison over This month;
  // a link with fewer than two usable cities just seeds the tray. Picking mode
  // (checkboxes on cards/rows, the tray) is on while there are picks, or once
  // the Compare toggle has been switched on; clearing the tray ends it.
  const urlCompare = fromUrl.compare ? sanitizeCompare(fromUrl.compare) : null;
  let compareKeys = $state(urlCompare?.length ? urlCompare : loadCompare());
  let comparePicking = $state(untrack(() => compareKeys.length) > 0);
  let compareOpen = $state(untrack(() => view) === 'month' && (urlCompare?.length ?? 0) >= 2);
  const comparing = $derived(view === 'month' && (comparePicking || compareKeys.length > 0));
  const trayVisible = $derived(comparing && !compareOpen);

  $effect(() => saveCompare([...compareKeys]));

  // First-visit colour key on This month; dismissed once, it stays dismissed.
  let keyHidden = $state(p.keyHidden === true);
  // This month's list in on-screen order (filtered + sorted) for ←/→ stepping.
  let visibleKeys = $state([]);
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
    const next = JSON.stringify({ view, mode, preset, valueModel, density, keyHidden });
    try {
      localStorage.setItem(PREFS, next);
    } catch {}
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

  // ── Lazy surfaces: load on demand, prefetch on intent ──
  // Each surface starts loading the moment it is asked for; the template shows
  // a small fallback until it arrives. Hovering, focusing or touching a city
  // (card, table row, #1 answer, a stay or picker row) fetches the sheet chunk
  // and the detail data ahead of the click; the header and footer buttons that
  // open a dialog prefetch it the same way (data-prefetch).
  $effect(() => {
    if (view === 'year') quiet(MyYearL.load());
  });
  $effect(() => {
    if (openCity) quiet(CitySheetL.load());
  });
  $effect(() => {
    // With two picks the comparison is one tap away; once it is open, any of
    // its cities is one tap from a sheet.
    if (comparing && compareKeys.length >= 2) quiet(CompareSheetL.load());
    if (compareOpen) quiet(CitySheetL.load());
  });
  $effect(() => {
    if (settingsOpen) quiet(SettingsL.load());
  });
  $effect(() => {
    if (aboutOpen) quiet(AboutL.load());
  });
  $effect(() => {
    if (howToOpen) quiet(HowToL.load());
  });
  $effect(() => {
    if (!methodOpen) return;
    quiet(MethodologyL.load());
    prefetchDetail(); // its coverage line counts per-city provenance
  });

  const PREFETCH = { year: MyYearL, settings: SettingsL, about: AboutL, method: MethodologyL, howto: HowToL };
  const CITY_TARGETS = '.cardwrap, .tablewrap tbody tr, .answer-btn, .stayname, .rowname, .mname';

  function prefetchCity() {
    prefetchDetail();
    quiet(CitySheetL.load());
  }

  $effect(() => {
    const onIntent = (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const named = t.closest('[data-prefetch]');
      if (named) {
        const l = PREFETCH[named.getAttribute('data-prefetch')];
        if (l) quiet(l.load());
      } else if (t.closest(CITY_TARGETS)) {
        prefetchCity();
      }
    };
    const types = ['pointerover', 'focusin', 'touchstart'];
    for (const type of types) document.addEventListener(type, onIntent, { passive: true });
    return () => {
      for (const type of types) document.removeEventListener(type, onIntent);
    };
  });

  // ── URL state ──
  // view / month / sort / layout / region (+ the open city) live in the query
  // string so any state is shareable and bookmarkable. Filter tweaks replace the
  // current entry; a view change pushes one, so Back moves between views. The
  // sheet pushes on open and goes *back* on close (see applyOpen/applyClose).
  // Defaults emit no params, and unrelated params (?i=, ?n=, utm…) pass through.
  const defaultView = () => (sharedRoute ? 'year' : 'month');
  const urlFor = () =>
    buildUrl(
      { view, month, mode, density, regions: activeRegions, city: cityKey, compare: compareOpen ? compareKeys : null },
      { defaultView: defaultView(), currentMonth }
    );
  const here = () => location.pathname + location.search + location.hash;

  let lastView = untrack(() => view);
  // Set while our own history.back() (closing a pushed sheet) is in flight, so
  // the sync effect doesn't rewrite the entry we're leaving.
  let pendingBack = false;

  $effect(() => {
    const target = urlFor();
    const v = view;
    untrack(() => {
      const viewChanged = v !== lastView;
      lastView = v;
      if (pendingBack || target === here()) return;
      if (viewChanged) history.pushState({}, '', target);
      else history.replaceState(history.state, '', target);
    });
  });

  // Fallback order for ←/→ when the sheet wasn't opened from the visible This
  // month list (e.g. from My year): the unfiltered ranking for the month.
  function rankedKeys() {
    return [...cities]
      .map((c) => ({
        key: c.key,
        s: mode === 'value' ? valueFor(c, month, preset, valueModel) : qolFor(c, month, preset)
      }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.key);
  }

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
    // Stepping (replace) keeps the entry's `sheet` flag; a fresh open pushes an
    // entry marked as ours, so closing can simply go back to the list.
    if (replace) history.replaceState(history.state, '', urlFor());
    else history.pushState({ sheet: true }, '', urlFor());
  }

  function trackClose() {
    if (sheetOpenedAt) {
      track('city_sheet_close', { city: cityKey, dwell_ms: Date.now() - sheetOpenedAt });
      sheetOpenedAt = 0;
    }
  }

  function applyClose() {
    trackClose();
    cityKey = null;
    if (history.state?.sheet) {
      // Opened in-app via pushState: step back, so Back never reopens the sheet.
      pendingBack = true;
      history.back();
    } else {
      // Landed directly on a ?city= link: there's nothing of ours behind it, so
      // drop the param in place and land cleanly on the list.
      history.replaceState(history.state, '', urlFor());
    }
  }

  // Card → sheet: tag the clicked card with the hero name in the outgoing
  // snapshot, then let the same name on the sheet's title morph into place.
  async function openSheet(key, opts = {}) {
    // The morph needs the sheet in the new snapshot, so wait for its chunk
    // (usually already prefetched on hover/focus). A failed load still opens:
    // the fallback offers a reload.
    prefetchDetail();
    await CitySheetL.load().catch(() => {});
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
  // its card, which reappears as the sheet unmounts. Resolves once the close
  // has been applied, so callers can switch view *after* the history step.
  async function closeSheet() {
    // Over a comparison there is no visible card to fly back to.
    if (!canAnimate() || compareOpen) {
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
    await vt.updateCallbackDone.catch(() => {});
  }

  // ←/→ stepping swaps cities within the open sheet: a plain crossfade (no card
  // hero) lets the title morph from one city to the next. It follows the list
  // exactly as This month shows it (filters, search, sort, table column order).
  function stepCity(dir) {
    const list =
      compareOpen && compareKeys.includes(cityKey)
        ? compareKeys
        : view === 'month' && visibleKeys.includes(cityKey)
          ? visibleKeys
          : rankedKeys();
    const i = list.indexOf(cityKey);
    if (i < 0) return;
    const next = list[(i + dir + list.length) % list.length];
    if (!canAnimate()) {
      applyOpen(next, { replace: true });
      return;
    }
    document.startViewTransition(() => applyOpen(next, { replace: true }));
  }

  $effect(() => {
    const onPop = () => {
      const s = readUrlState(location.search, regions);
      const nextCity = s.city && cityByKey.has(s.city) ? s.city : null;
      if (pendingBack) {
        // Our own close landed. Keep in-memory state (e.g. a month picked inside
        // the sheet) and rewrite this entry to match it — pushing instead if the
        // view changed meanwhile (toast "View year"), so Back still works.
        pendingBack = false;
        if ((s.view ?? defaultView()) !== view) history.pushState({}, '', urlFor());
        else history.replaceState(history.state, '', urlFor());
        return;
      }
      const nextCompare = s.compare ? sanitizeCompare(s.compare) : [];
      if (cityKey && !nextCity) {
        // Browser Back out of an open sheet behaves exactly like closing it.
        trackClose();
        cityKey = null;
        // …landing on the comparison it was opened from, if that is where Back went.
        if (nextCompare.length >= 2) compareKeys = nextCompare;
        compareOpen = nextCompare.length >= 2;
        history.replaceState(history.state, '', urlFor());
        return;
      }
      if (compareOpen && nextCompare.length < 2 && !nextCity) {
        // Browser Back out of the comparison closes it, keeping the picks and
        // any month chosen inside it.
        compareOpen = false;
        history.replaceState(history.state, '', urlFor());
        return;
      }
      if (nextCompare.length >= 2) compareKeys = nextCompare;
      compareOpen = nextCompare.length >= 2 && (s.view ?? defaultView()) === 'month';
      cityKey = nextCity;
      view = lastView = s.view ?? defaultView();
      month = s.month ?? currentMonth;
      mode = s.mode ?? 'quality';
      density = s.density ?? 'cards';
      activeRegions = new Set(s.regions ?? []);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });

  // ── Compare actions ──
  function toggleCompare(key) {
    if (compareKeys.includes(key)) {
      compareKeys = compareKeys.filter((k) => k !== key);
      if (compareOpen && compareKeys.length < 2) closeCompare();
      return;
    }
    if (compareKeys.length >= MAX_COMPARE) return;
    compareKeys = [...compareKeys, key];
    // Once you've started picking, emptying the tray keeps you in picking mode
    // until you dismiss it.
    comparePicking = true;
    track('compare_add', { city: key, count: compareKeys.length });
  }

  function clearCompare() {
    compareKeys = [];
    comparePicking = false;
  }

  function toggleCompareMode() {
    if (comparing) clearCompare();
    else comparePicking = true;
  }

  // Pushes an entry marked as ours, so closing can step back (like the sheet).
  function openCompare() {
    if (compareKeys.length < 2) return;
    compareOpen = true;
    track('compare_open', { cities: compareKeys.join(','), month });
    history.pushState({ compare: true }, '', urlFor());
  }

  function closeCompare() {
    compareOpen = false;
    if (history.state?.compare) {
      pendingBack = true;
      history.back();
    } else {
      // Landed directly on a ?compare= link: drop the param in place.
      history.replaceState(history.state, '', urlFor());
    }
  }

  // A city from the comparison opens its sheet on top (crossfade, no card
  // morph — the card is under the comparison). Closing it returns here.
  async function openFromCompare(key) {
    await CitySheetL.load().catch(() => {});
    if (!canAnimate()) applyOpen(key);
    else document.startViewTransition(() => applyOpen(key));
  }

  // Leaving for My year from inside an overlay (toast "View year"): drop the
  // sheet and comparison in place, then let the view change push its entry.
  function dropOverlays() {
    if (cityKey) trackClose();
    cityKey = null;
    compareOpen = false;
    history.replaceState({}, '', urlFor());
  }

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

  async function goHome() {
    if (cityKey) await closeSheet();
    view = 'month';
  }

  // ── Add to my year ──
  // The bridge that closes the browse↔plan seam: any surface can drop the viewed
  // city into the itinerary at the viewed month, and a toast confirms it with an
  // Undo and a jump into My year. The route store does the placement (bumping to
  // the first open month if the viewed one is taken) and reports what it did.
  //
  // The toast never times out while the pointer is over it or focus is inside
  // it (its Undo must not vanish mid-reach), and focusTrap pulls it into the
  // Tab cycle of an open sheet. Screen readers hear it through a live region
  // that is always mounted, so the message lands in an existing region (a
  // region inserted together with its text is often not announced).
  let toast = $state(null);
  let announce = $state('');
  let toastTimer;
  let announceTimer;
  let toastHover = false;
  let toastFocus = false;

  function armToast(ms) {
    clearTimeout(toastTimer);
    if (toast && !toastHover && !toastFocus) toastTimer = setTimeout(() => (toast = null), ms);
  }

  function showToast(t) {
    toast = t;
    // Clear, then set after a beat, so a repeated message is announced again.
    announce = '';
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => (announce = t.text), 80);
    armToast(6000);
  }

  // Closing the toast from inside it would drop focus on <body>; hand it back
  // to the open sheet, if any.
  function closeToast() {
    const hadFocus = toastFocus;
    toast = null;
    if (hadFocus) focusTopLayer();
  }

  $effect(() => {
    if (toast) return;
    toastHover = toastFocus = false;
    clearTimeout(toastTimer);
  });

  const toastEvents = {
    onpointerenter: () => {
      toastHover = true;
      armToast(0);
    },
    onpointerleave: () => {
      toastHover = false;
      armToast(4000);
    },
    onfocusin: () => {
      toastFocus = true;
      armToast(0);
    },
    onfocusout: (e) => {
      if (e.currentTarget.contains(e.relatedTarget)) return;
      toastFocus = false;
      armToast(4000);
    }
  };

  function addToYear(key, m) {
    const res = addCity(key, { start: m, len: 2 });
    const name = cityByKey.get(key)?.name ?? 'City';
    if (!res.ok) {
      showToast({
        kind: 'warn',
        text: res.reason === 'full' ? 'Your year is full — remove a stay to make room.' : `Couldn't add ${name}.`
      });
      return;
    }
    track('add_to_year', { city: key, month: res.start, from: view === 'year' ? 'my_year' : 'this_month' });
    const range =
      res.len > 1 ? `${MONTHS[res.start]}–${MONTHS[(res.start + res.len - 1) % 12]}` : MONTHS[res.start];
    const bumped = res.bumped ? ` · ${MONTHS[m]} was taken` : '';
    const added = res.stay;
    showToast({
      kind: 'ok',
      text: `Added ${name} to ${range}${bumped}`,
      undo: () => {
        removeStayRef(added);
        closeToast();
      },
      view: async () => {
        toast = null;
        if (compareOpen) dropOverlays();
        else if (cityKey) await closeSheet();
        view = 'year';
      }
    });
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
        <button type="button" class="navbtn" class:on={view === n.id} data-prefetch={n.id === 'year' ? 'year' : undefined} onclick={() => (view = n.id)}>
          {n.label}
        </button>
      {/each}
      <button type="button" class="howto" data-prefetch="howto" onclick={openHowTo} aria-label="How to use Monsoon"><span class="howto-long">How it works</span><span class="howto-short">Guide</span></button>
    </nav>

    <!-- The gear sits outside <nav> so on phones it can ride up beside the logo,
         leaving the nav row to the three labelled buttons (no label wrapping). -->
    <button type="button" class="gear util" data-prefetch="settings" onclick={openSettings} aria-label="Settings" title="Settings">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  </header>

  <main>
    {#if view === 'month'}
      <ThisMonth
        bind:month
        bind:mode
        bind:density
        bind:activeRegions
        bind:keyHidden
        bind:visibleKeys
        {currentMonth}
        {preset}
        {valueModel}
        heroKey={transitioningKey}
        openKey={cityKey}
        onopen={openSheet}
        {comparing}
        {compareKeys}
        oncompare={toggleCompare}
        oncomparemode={toggleCompareMode}
        onmodel={(m) => (valueModel = m)}
        onsettings={openSettings}
        onresume={() => (view = 'year')}
      />
    {:else if MyYearL.C}
      <MyYearL.C bind:preset {valueModel} {sharedRoute} {sharedName} onsharedresolved={resolveShared} onopen={openSheet} />
    {:else}
      {@render lazyWait(MyYearL, null, 'Loading your year…')}
    {/if}
  </main>

  <footer class="basefoot">
    <span>Your ancestors moved with the seasons. {cities.length} cities, scored month by month — clean air, mild weather, no typhoons, festivals on, 90 Schengen days at a time.</span>
    <span class="footlinks">
      <a class="num footlink" href="/cities/">all cities</a>
      <span aria-hidden="true">·</span>
      <button type="button" class="num footlink" data-prefetch="about" onclick={() => (aboutOpen = true)}>about</button>
      <span aria-hidden="true">·</span>
      <button type="button" class="num footlink" data-prefetch="method" onclick={() => (methodOpen = true)}>methodology · 2026</button>
    </span>
  </footer>
  {#if trayVisible}<div class="trayspace" aria-hidden="true"></div>{/if}
</div>

{#if trayVisible}
  <CompareTray keys={compareKeys} onremove={toggleCompare} onclear={clearCompare} onopen={openCompare} />
{/if}

{#if compareOpen && compareKeys.length >= 2 && !CompareSheetL.C}
  {@render lazyWait(CompareSheetL, closeCompare)}
{:else if compareOpen && compareKeys.length >= 2}
  <CompareSheetL.C
    keys={compareKeys}
    {month}
    {preset}
    {valueModel}
    covered={!!openCity}
    onmonth={(i) => (month = i)}
    onremove={toggleCompare}
    onclose={closeCompare}
    onopencity={openFromCompare}
    onaddtoyear={addToYear}
  />
{/if}

{#if openCity && !CitySheetL.C}
  {@render lazyWait(CitySheetL, closeSheet)}
{:else if openCity}
  <CitySheetL.C
    city={openCity}
    {month}
    {preset}
    onclose={closeSheet}
    onmonth={(i) => (month = i)}
    onstep={stepCity}
    onaddtoyear={addToYear}
    onmethod={() => (methodOpen = true)}
    compared={compareKeys.includes(openCity.key)}
    compareFull={compareKeys.length >= MAX_COMPARE}
    oncompare={view === 'month' && !compareOpen ? toggleCompare : null}
  />
{/if}

<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announce}</div>
{#if toast}
  <div class="toast" class:warn={toast.kind === 'warn'} class:lifted={trayVisible} role="group" aria-label="Notification" data-trap-include onpointerenter={toastEvents.onpointerenter} onpointerleave={toastEvents.onpointerleave} onfocusin={toastEvents.onfocusin} onfocusout={toastEvents.onfocusout}>
    <span class="toast-msg">{toast.text}</span>
    {#if toast.undo}<button type="button" class="toast-act" onclick={toast.undo}>Undo</button>{/if}
    {#if toast.view}<button type="button" class="toast-act primary" onclick={toast.view}>{toast.viewLabel ?? 'View year'}</button>{/if}
    <button type="button" class="toast-x" aria-label="Dismiss" onclick={closeToast}>×</button>
  </div>
{/if}

{#if settingsOpen}
  {#if SettingsL.C}<SettingsL.C bind:preset onclose={closeSettings} />{:else}{@render lazyWait(SettingsL, closeSettings)}{/if}
{/if}

{#if aboutOpen}
  {#if AboutL.C}<AboutL.C onclose={() => (aboutOpen = false)} />{:else}{@render lazyWait(AboutL, () => (aboutOpen = false))}{/if}
{/if}

{#if methodOpen}
  <!-- Methodology manages its own Escape (capture phase), focus and scroll
       lock; this host only adds it to the layer stack for the Tab cycle and
       so the sheet under it stops taking ←/→. -->
  {#if MethodologyL.C}<div class="layer-host" use:focusTrap={{ autofocus: false, restore: false, lock: false }}><MethodologyL.C onclose={() => (methodOpen = false)} /></div>{:else}{@render lazyWait(MethodologyL, () => (methodOpen = false))}{/if}
{/if}

{#if howToOpen}
  {#if HowToL.C}<HowToL.C onclose={() => (howToOpen = false)} />{:else}{@render lazyWait(HowToL, () => (howToOpen = false))}{/if}
{/if}

<!-- Fallback while a code-split surface loads: invisible for the first 300ms
     (most loads finish sooner), then a quiet pill; on failure (typically a
     deploy replaced the chunk under an open tab) a Reload. -->
{#snippet lazyWait(l, onclose, label = 'Loading…')}
  <div class="lazywait" class:inline={!onclose} class:failed={l.error} role="status">
    {#if l.error}
      <span>Couldn't load this part of Monsoon.</span>
      <button type="button" class="lazy-act" onclick={() => location.reload()}>Reload</button>
      {#if onclose}<button type="button" class="lazy-x" aria-label="Close" onclick={onclose}>×</button>{/if}
    {:else}
      <span>{label}</span>
    {/if}
  </div>
{/snippet}

<style>
  .shell {
    max-width: 1240px;
    margin: 0 auto;
    padding: calc(18px + var(--safe-t)) var(--pad-x) 0;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 2px;
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

  nav {
    display: flex;
    gap: 2px;
    margin-left: 24px;
  }

  .navbtn {
    background: none;
    border: none;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink-2);
    padding: 7px 13px;
    border-radius: 999px;
    white-space: nowrap;
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

    .footlink {
      min-height: 36px;
      display: inline-flex;
      align-items: center;
    }

    /* Header controls meet the 44px tap floor on touch. */
    .navbtn,
    .howto {
      min-height: var(--tap);
      display: inline-flex;
      align-items: center;
    }

    .util {
      min-height: var(--tap);
      min-width: var(--tap);
      margin-right: -10px; /* optical: align the glyph, not its tap box, to the gutter */
    }

    /* Two rows on phones: logo + gear, then the three labelled nav buttons on
       their own full-width row, so "This month" / "My year" never wrap. */
    .bar {
      row-gap: 8px;
      padding-bottom: 10px;
    }

    .gear { order: 2; }

    nav {
      order: 3;
      width: 100%;
      margin-left: 0;
    }
  }

  /* Narrow phones: trim the pills so all three labels still fit one row; at
     ~320px the guide button drops to its short label. */
  @media (max-width: 360px) {
    .navbtn,
    .howto {
      padding-left: 11px;
      padding-right: 11px;
      font-size: 13.5px;
    }
  }

  .howto-short { display: none; }

  @media (max-width: 340px) {
    .howto-long { display: none; }
    .howto-short { display: inline; }
  }

  .layer-host { display: contents; }

  .lazywait {
    position: fixed;
    left: 50%;
    top: 40%;
    transform: translateX(-50%);
    z-index: var(--z-sheet);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 16px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 999px;
    box-shadow: 0 14px 34px -14px rgba(33, 36, 30, 0.4);
    font-size: 13.5px;
    color: var(--ink-2);
    animation: lazy-in 0.2s ease 0.3s both;
  }

  .lazywait.inline {
    position: static;
    transform: none;
    width: max-content;
    margin: 48px auto;
    box-shadow: none;
  }

  .lazywait.failed { animation: none; }

  @keyframes lazy-in {
    from { opacity: 0; }
  }

  .lazy-act {
    border: 1px solid var(--line);
    background: var(--card);
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }

  .lazy-x {
    border: none;
    background: none;
    font-size: 18px;
    line-height: 1;
    color: var(--ink-3);
    padding: 4px 6px;
  }

  @media (prefers-reduced-motion: reduce) {
    .lazywait { animation: none; }
  }

  /* Add-to-year confirmation. Sits above every sheet (city sheet is z70, the My
     year picker z60) and clears the iOS home indicator. */
  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(20px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    z-index: var(--z-toast);
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: min(520px, calc(100vw - 24px));
    padding: 10px 10px 10px 16px;
    background: var(--ink);
    color: var(--paper);
    border-radius: 999px;
    box-shadow: 0 14px 34px -12px rgba(33, 36, 30, 0.55);
    animation: toast-in 0.22s ease;
  }

  .toast.warn { background: var(--terra-deep); }

  /* Clear the compare tray when both are up. */
  .toast.lifted { bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }

  /* Room under the footer so the fixed compare tray never covers the last row. */
  .trayspace { height: calc(72px + var(--safe-b)); }

  /* Opacity-only so it never fights the transform used to centre the pill. */
  @keyframes toast-in {
    from { opacity: 0; }
  }

  .toast-msg {
    font-size: 13.5px;
    font-weight: 500;
    line-height: 1.3;
    flex: 1 1 auto;
    min-width: 0;
  }

  .toast-act {
    flex-shrink: 0;
    border: 1px solid rgba(246, 241, 230, 0.4);
    background: transparent;
    color: var(--paper);
    border-radius: 999px;
    padding: 6px 13px;
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
  }

  .toast-act:hover { border-color: var(--paper); }

  .toast-act.primary {
    background: var(--paper);
    border-color: var(--paper);
    color: var(--ink);
  }

  .toast-x {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    border: none;
    background: transparent;
    color: var(--paper);
    font-size: 18px;
    line-height: 1;
    border-radius: 999px;
    opacity: 0.7;
  }

  .toast-x:hover { opacity: 1; }

  @media (max-width: 700px) {
    .toast {
      left: 12px;
      right: 12px;
      transform: none;
      max-width: none;
    }

    .toast-act {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
    }

    .toast-x {
      width: 40px;
      height: 40px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast { animation: none; }
  }
</style>
