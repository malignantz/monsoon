<script>
  import { untrack } from 'svelte';
  import MonthStrip from './MonthStrip.svelte';
  import ScoreInfo from './ScoreInfo.svelte';
  import Legend from './Legend.svelte';
  import RegionMenu from './RegionMenu.svelte';
  import {
    cities,
    cityByKey,
    regions,
    stripCells,
    qolFor,
    valueFor,
    band,
    cityCost,
    fmtMoney,
    MONTHS,
    MONTH_LETTERS,
    monthOccupancy,
    routeStats,
    stayMonths,
    schengenCheck,
    partyWord,
    encodeRouteCompact,
    shareUrl,
    shareOrCopy
  } from './data.svelte.js';
  import { screen } from './mobile.svelte.js';
  import { lockScroll } from './sheet.js';
  import {
    defaultFilters,
    filtersActive,
    cityPasses,
    stayPasses,
    normalizeFilters,
    COST_OPTIONS,
    SAFETY_OPTIONS,
    AIR_OPTIONS,
    RAIN_OPTIONS
  } from './planner.js';

  let { preset = $bindable(), onopen, sharedRoute = null, sharedName = '', onsharedresolved } = $props();

  const STORE = 'atlas.route.v1';
  const STORE_F = 'atlas.route.filters.v1';
  const DEFAULT_NAME = 'My Monsoon year';

  // Storage is `{ name, stays }`. Older builds saved a bare stays array; treat
  // that as an unnamed route so existing saved years keep loading.
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE));
      const stays = Array.isArray(raw) ? raw : raw?.stays;
      const name = !Array.isArray(raw) && typeof raw?.name === 'string' ? raw.name : '';
      if (Array.isArray(stays) && stays.every((x) => cityByKey.has(x.key))) {
        return { stays, name };
      }
    } catch {}
    return { stays: [], name: '' };
  }

  function loadFilters() {
    const base = defaultFilters();
    try {
      const f = JSON.parse(localStorage.getItem(STORE_F));
      if (f && typeof f === 'object') {
        for (const k of Object.keys(base)) if (k in f) base[k] = f[k];
        // Sanitize regions into canonical order; empty also resets to all
        // (the pre-all-selected format used [] to mean "all").
        const saved = new Set(Array.isArray(base.regions) ? base.regions : []);
        base.regions = regions.filter((r) => saved.has(r));
        if (!base.regions.length) base.regions = [...regions];
        // The old English dropdown (tier 0/2/3) is now a single checkbox; any
        // "decent+ or higher" selection maps to the new English-friendly toggle.
        if (typeof f.english === 'number' && f.english >= 2) base.englishOk = true;
      }
    } catch {}
    // Snap any free-typed values saved by the old number inputs onto the
    // current dropdown options; the persist effect rewrites the cleaned form.
    return normalizeFilters(base, partyWord());
  }

  const loaded = load();
  let stays = $state(loaded.stays);
  let routeName = $state(loaded.name);
  let selStart = $state(-1);
  let dur = $state(2);
  let query = $state('');

  // Arriving on a shared link (?route=…) shows that itinerary read-only, so it
  // never silently overwrites the visitor's own saved year. They can adopt it
  // ("Save a copy") or dismiss it back to their own route.
  const startsWithSharedRoute = untrack(() => sharedRoute != null);
  let previewing = $state(startsWithSharedRoute);
  const boardStays = $derived(previewing ? (sharedRoute ?? []) : stays);

  function adoptShared() {
    stays = (sharedRoute ?? []).map((s) => ({ ...s }));
    if (sharedName) routeName = sharedName;
    selStart = -1;
    previewing = false;
    onsharedresolved?.();
  }

  function dismissShared() {
    previewing = false;
    onsharedresolved?.();
  }

  // Share a link that encodes the current route into the URL — no backend.
  // Native share sheet on mobile, clipboard copy elsewhere.
  let copied = $state(false);
  let copyTimer;
  async function shareRoute() {
    if (!stays.length) return;
    // Route lives in `i`; the trip name rides along as a decorative `n` that
    // decoding ignores, so links stay valid even if the name is dropped.
    const name = routeName.trim();
    const params = { i: encodeRouteCompact(stays) };
    if (name) params.n = name;
    const result = await shareOrCopy({
      url: shareUrl(params),
      title: name || DEFAULT_NAME,
      text: name || 'My Monsoon travel year'
    });
    if (result !== 'copied') return;
    copied = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = false), 1800);
  }

  let filters = $state(loadFilters());

  // Region selection mirrors This month's convention: an empty set means "all
  // regions" (filtering to zero would show nothing, so empty reads as no filter).
  // This lets My year drive the same shared Regions ▾ menu. The saved/derived
  // `filters.regions` stays the canonical allow-list that cityPasses() reads.
  function initialRegionSet() {
    const saved = filters.regions;
    if (!Array.isArray(saved) || saved.length === 0 || saved.length === regions.length) return new Set();
    return new Set(saved);
  }
  let regionSel = $state(initialRegionSet());

  // Keep the allow-list in sync with the menu selection (empty → all).
  $effect(() => {
    filters.regions = regionSel.size ? regions.filter((r) => regionSel.has(r)) : [...regions];
  });

  // Collapsed by default so the city list is the first thing in view. Mirrors
  // This month's Refine ▾ disclosure.
  let showMore = $state(false);

  // Whether any non-region, non-sort filter is set — drives the Refine ▾ dot.
  const refineActive = $derived(
    (filters.maxCost ?? '') !== '' ||
      (filters.minSafety ?? '') !== '' ||
      (filters.minAir ?? '') !== '' ||
      (filters.maxRain ?? '') !== '' ||
      filters.englishOk ||
      filters.nonSchengen
  );

  // Budget caps offered in the Max $/mo dropdown, scaled to the party-size cost
  // figure we actually display (couple runs ~1.4× solo). Spans roughly the 25th
  // to 95th percentile of the dataset so each step prunes a meaningful slice.
  const costOptions = $derived(COST_OPTIONS[partyWord()] ?? COST_OPTIONS.solo);

  let sortMode = $state('qol');

  // Board element + a one-shot flash so applying a proposal (which fills the
  // timeline far above the proposal list) gives visible, located confirmation.
  let boardEl;
  let flash = $state(false);
  const reducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The timeline scrolls horizontally on narrow viewports; a right-edge fade
  // signals there are more months off-screen (only when there actually are).
  let scrollEl;
  let canScrollRight = $state(false);
  function updateScroll() {
    if (!scrollEl) return;
    canScrollRight = scrollEl.scrollWidth - scrollEl.clientWidth - scrollEl.scrollLeft > 4;
  }

  $effect(() => {
    localStorage.setItem(STORE, JSON.stringify({ name: routeName, stays }));
  });

  $effect(() => {
    localStorage.setItem(STORE_F, JSON.stringify(filters));
  });

  function resetFilters() {
    filters = defaultFilters();
    regionSel = new Set();
  }

  // Clicking a row's "over 90/180" warning points the user at the fix: scroll
  // the non-Schengen filter into view, focus it, and flash it so it's found.
  let nonSchengenEl = $state(null);
  let nonSchengenFlash = $state(false);
  function flagNonSchengen() {
    // The non-Schengen toggle now lives in the collapsed Refine panel; open it
    // first, then scroll/focus/flash once it's rendered.
    showMore = true;
    requestAnimationFrame(() => {
      nonSchengenEl?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
      nonSchengenEl?.querySelector('input')?.focus({ preventScroll: true });
      nonSchengenFlash = false;
      requestAnimationFrame(() => {
        nonSchengenFlash = true;
        setTimeout(() => (nonSchengenFlash = false), 1400);
      });
    });
  }

  function toggleRegion(r) {
    const next = new Set(regionSel);
    next.has(r) ? next.delete(r) : next.add(r);
    regionSel = next;
  }

  const occ = $derived(monthOccupancy(boardStays));
  const stats = $derived(routeStats(boardStays, preset));
  const sch = $derived(stats.schengen);
  const schState = $derived(!sch.ok ? 'Over limit' : sch.atLimit ? 'At the limit' : 'Within limits');

  // Recheck the scroll affordance whenever the route's width could change.
  $effect(() => {
    occ;
    requestAnimationFrame(updateScroll);
  });

  $effect(() => {
    window.addEventListener('resize', updateScroll);
    return () => window.removeEventListener('resize', updateScroll);
  });

  function clearRoute() {
    stays = [];
    selStart = -1;
  }

  function resizeStay(stay, newLen) {
    if (newLen < 1) return;
    if (newLen > stay.len) {
      const maxExtend = stay.len + freeRun((stay.start + stay.len) % 12);
      newLen = Math.min(newLen, maxExtend, 12);
    }
    if (newLen === stay.len) return;
    stays = stays.map((s) => (s === stay ? { ...s, len: newLen } : s));
  }

  function removeStay(stay) {
    stays = stays.filter((s) => s !== stay);
  }

  function freeRun(from) {
    let n = 0;
    while (n < 12 && occ[(from + n) % 12] === null) n++;
    return n;
  }

  function addStay(key) {
    let start = selStart;
    if (start < 0 || occ[start] !== null) start = occ.findIndex((x) => x === null);
    if (start < 0) return;
    const len = Math.max(1, Math.min(dur, freeRun(start)));
    stays = [...stays, { key, start, len }];
    const next = (start + len) % 12;
    selStart = occ[next] === null && freeRun(next) > 0 ? next : -1;
  }

  // Split a stay into render segments (handles Dec→Jan wrap).
  function segments(stay) {
    const first = Math.min(stay.len, 12 - stay.start);
    const segs = [{ from: stay.start, len: first, head: true }];
    if (stay.len > first) segs.push({ from: 0, len: stay.len - first, head: false });
    return segs;
  }

  function stayAvg(stay) {
    const c = cityByKey.get(stay.key);
    const ms = stayMonths(stay);
    return ms.reduce((a, m) => a + qolFor(c, m, preset), 0) / ms.length;
  }

  function stayHazard(stay) {
    const c = cityByKey.get(stay.key);
    return stayMonths(stay).some((m) => c.months[m].risk >= 1);
  }

  const emptyMonths = $derived(occ.map((x, i) => (x === null ? i : -1)).filter((i) => i >= 0));

  // Where addStay would drop the next stay (mirrors addStay exactly): drives
  // both the month-dependent filtering and the Schengen breach preview.
  const prospect = $derived.by(() => {
    const start = selStart >= 0 && occ[selStart] === null ? selStart : occ.findIndex((x) => x === null);
    if (start < 0) return null;
    return { start, len: Math.max(1, Math.min(dur, freeRun(start))) };
  });

  // Heading label for the window the next stay will fill: "Mar" or "Mar–Jun".
  const windowLabel = $derived.by(() => {
    if (!prospect) return '';
    const a = MONTHS[prospect.start];
    if (prospect.len === 1) return a;
    return `${a}–${MONTHS[(prospect.start + prospect.len - 1) % 12]}`;
  });

  // Filtered candidates: static criteria always; month-dependent criteria are
  // checked against the months the prospective stay will actually occupy.
  const filteredCities = $derived.by(() => {
    let list = cities.filter((c) => cityPasses(c, filters));
    if (prospect) list = list.filter((c) => stayPasses(c, prospect.start, prospect.len, filters));
    return list;
  });

  // Remaining Schengen budget (days) in the route's worst rolling window.
  const schLeft = $derived(sch.anySchengen ? sch.remaining : 90);

  // Months the prospective stay would actually occupy — the window we score and
  // frame each city against, so the row number reflects the block you'd book.
  const targetMonths = $derived(
    prospect ? stayMonths({ start: prospect.start, len: prospect.len })
      : emptyMonths.length ? emptyMonths
      : [...Array(12).keys()]
  );

  const pickerList = $derived.by(() => {
    const q = query.trim().toLowerCase();
    let list = filteredCities;
    if (q) list = list.filter((c) => (c.name + ' ' + c.country + ' ' + c.region).toLowerCase().includes(q));
    const target = targetMonths;
    const score = (c) =>
      sortMode === 'value'
        ? target.reduce((a, m) => a + valueFor(c, m, preset), 0) / target.length
        : target.reduce((a, m) => a + qolFor(c, m, preset), 0) / target.length;
    return list
      .map((c) => ({ c, s: score(c) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 30)
      .map(({ c, s }) => ({
        c,
        s,
        // Warn (don't block) when adding this Schengen city where addStay would
        // place it pushes the rolling 90/180 window over the cap.
        breach:
          c.schengen && prospect
            ? !schengenCheck([...stays, { key: c.key, start: prospect.start, len: prospect.len }]).ok
            : false
      }));
  });

  // ───────────────────── Mobile layout ─────────────────────
  // Below 700px the desktop 12-column board (which has to be panned sideways) is
  // replaced by a vertical list of months and a bottom-sheet city picker. All
  // the planning logic above is reused untouched — only the presentation forks.

  // The city picker opens as a bottom sheet, scoped to a tapped month.
  let pickerOpen = $state(false);

  function openPicker(month) {
    selStart = month;
    pickerOpen = true;
  }

  function closePicker() {
    pickerOpen = false;
  }

  // Lock the page behind the open picker sheet and close it on Escape.
  $effect(() => {
    if (!pickerOpen) return;
    const unlock = lockScroll();
    const onkey = (e) => {
      if (e.key === 'Escape') closePicker();
    };
    window.addEventListener('keydown', onkey);
    return () => {
      window.removeEventListener('keydown', onkey);
      unlock();
    };
  });

  // Adding from the sheet advances to the next open month automatically (addStay
  // already parks selStart on the next gap), keeping a fill rhythm without
  // reopening. When the year fills up, close the sheet so the full list shows.
  function addFromPicker(key) {
    addStay(key);
    if (selStart < 0) closePicker();
  }

  // "Jan" for a one-month stay, "Jan–Mar" for a run (handles the Dec→Jan wrap).
  function rangeLabel(start, len) {
    if (len <= 1) return MONTHS[start];
    return `${MONTHS[start]}–${MONTHS[(start + len - 1) % 12]}`;
  }

  // Average monthly cost across the months a stay occupies, for the stay card.
  function stayCostAvg(stay) {
    const c = cityByKey.get(stay.key);
    const ms = stayMonths(stay);
    return ms.reduce((a, m) => a + cityCost(c.months[m]), 0) / ms.length;
  }

  // 12-cell year overview for the mobile mini-strip: filled cells carry the
  // stay's band colour for that month; tapping any cell scrolls to its card.
  const overview = $derived(
    occ.map((o, m) => {
      if (!o) return { m, filled: false, band: 'none', schengen: false, start: false };
      const c = cityByKey.get(o.key);
      return { m, filled: true, band: band(qolFor(c, m, preset)), schengen: c.schengen, start: o.start === m };
    })
  );

  function scrollToMonth(m) {
    const el = typeof document !== 'undefined' && document.getElementById(`myr-m-${m}`);
    el?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }
</script>

<section class="wrap">
  <header class="view-head">
    <div>
      <p class="kicker">Build the year</p>
      <h1>My year<span class="dot">.</span></h1>
      {#if previewing}
        {#if sharedName}<p class="trip-name-static">{sharedName}</p>{/if}
      {:else if stays.length > 0}
        <!-- Inline-editable trip name. The sizer span mirrors the value so the
             input (and its underline) hugs the text instead of trailing into
             empty space. The dotted underline stays visible at rest so the
             field reads as editable on touch, where there is no hover. -->
        <span class="trip-name-field" data-value={routeName || DEFAULT_NAME}>
          <input
            class="trip-name"
            type="text"
            bind:value={routeName}
            placeholder={DEFAULT_NAME}
            aria-label="Trip name"
            size="1"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            maxlength="60"
          />
        </span>
      {/if}
    </div>
    <div class="head-right">
      {#if !previewing && stays.length > 0}
        <button type="button" class="chip share" class:on={copied} onclick={shareRoute}>
          {copied ? '✓ Link copied' : '↗ Share'}
        </button>
        <button type="button" class="chip clear" onclick={clearRoute}>Clear route</button>
      {/if}
    </div>
  </header>

  {#if previewing}
    <div class="previewbar">
      <div class="preview-msg">
        <span class="preview-eyebrow">Shared itinerary</span>
        <span class="preview-sub">You're viewing a year someone shared. Save a copy to edit it as your own.</span>
      </div>
      <div class="preview-act">
        <button type="button" class="chip adopt" onclick={adoptShared}>Save a copy</button>
        <button type="button" class="chip" onclick={dismissShared}>Dismiss</button>
      </div>
    </div>
  {/if}

  {#if !screen.mobile}
  <div class="board" class:flash bind:this={boardEl}>
    <div class="boardscroll-wrap" class:more={canScrollRight}>
    <div class="boardscroll" bind:this={scrollEl} onscroll={updateScroll}>
    <div class="months num">
      {#each MONTH_LETTERS as l, i}
        <span class:sel={i === selStart}>{l}</span>
      {/each}
    </div>

    <div class="timeline">
      {#each occ as o, i}
        {#if o === null && !previewing}
          <button
            type="button"
            class="gap"
            class:sel={i === selStart}
            style="grid-column: {i + 1} / span 1"
            onclick={() => (selStart = selStart === i ? -1 : i)}
            title="Plan {MONTHS[i]}"
          >+</button>
        {:else if o === null}
          <div class="gap empty" style="grid-column: {i + 1} / span 1" aria-hidden="true"></div>
        {/if}
      {/each}
      {#each boardStays as stay (stay)}
        {@const c = cityByKey.get(stay.key)}
        {#each segments(stay) as seg}
          <div
            class="stay"
            class:schengen={c.schengen}
            class:hazard={stayHazard(stay)}
            style="grid-column: {seg.from + 1} / span {seg.len}"
          >
            {#if seg.head}
              <button type="button" class="stayname" onclick={() => onopen(c.key, { month: stay.start })}>{c.name}</button>
              <span class="stayq num">{Math.round(stayAvg(stay))}</span>
              {#if previewing}
                <span class="dur-val preview-len num">{stay.len}mo</span>
              {:else}
                <button type="button" class="x" aria-label="Remove stay" onclick={() => removeStay(stay)}>×</button>
                <div class="dur-ctl">
                  <button type="button" class="dur-btn" aria-label="Shorter" onclick={() => resizeStay(stay, stay.len - 1)} disabled={stay.len <= 1}>−</button>
                  <span class="dur-val num">{stay.len}mo</span>
                  <button type="button" class="dur-btn" aria-label="Longer" onclick={() => resizeStay(stay, stay.len + 1)}>+</button>
                </div>
              {/if}
            {:else}
              <span class="cont">↪ {c.name}</span>
            {/if}
          </div>
        {/each}
      {/each}
    </div>
    </div>
    </div>

    {#if !previewing && stays.length === 0}
      <p class="board-hint">Click any month above to mark a starting point, then choose a city from the list below.</p>
    {/if}

    {#if sch.anySchengen}
      <div class="schline" class:bad={!sch.ok} class:tight={sch.ok && sch.atLimit}>
        <span class="mlabel">◆ Schengen 90/180</span>
        <ScoreInfo title="Schengen 90/180 rule">
          <p>On a tourist visa you can be in the Schengen Area at most 90 days in any rolling 180-day window.</p>
          <p>◆ marks Schengen countries. Staying longer means a longer-stay visa or a break outside the area.</p>
        </ScoreInfo>
        <span class="sch-state">{schState}</span>
        <span class="sch-read">
          {#if !sch.ok}
            <strong class="num">{sch.over}</strong> {sch.over === 1 ? 'day' : 'days'} over
            <span class="sch-sub">· worst window {sch.window}</span>
          {:else if sch.atLimit}
            <strong class="num">0</strong> days left
            <span class="sch-sub">· worst window {sch.window}</span>
          {:else}
            <strong class="num">{sch.remaining}</strong> of 90 days left
            <span class="sch-sub">· worst window {sch.window}</span>
          {/if}
        </span>
      </div>
    {/if}

    <div class="totals">
      <div class="tot">
        <span class="num tv">{Math.round(stats.avgQol) || '—'}</span>
        <span class="tk">avg score</span>
      </div>
      <div class="tot">
        <span class="num tv">{stats.months ? fmtMoney(stats.avgCost) : '—'}</span>
        <span class="tk">avg /mo {partyWord()}</span>
      </div>
      <div class="tot">
        <span class="num tv">{stats.months ? fmtMoney(stats.totalCost) : '—'}</span>
        <span class="tk">{stats.months ? `${stats.months}-month total` : 'trip total'}</span>
      </div>
      <div class="tot">
        <span class="num tv">{stats.festivals}</span>
        <span class="tk">major festivals</span>
      </div>
    </div>
  </div>
  {:else}
  <!-- Mobile: a vertical month list replaces the panned 12-column board. -->
  <div class="myr-m">
    <div class="ov" role="group" aria-label="Year overview — tap a month to jump to it">
      {#each overview as cell}
        <button
          type="button"
          class="ovcell band-{cell.band}"
          class:filled={cell.filled}
          class:sel={cell.m === selStart}
          aria-label="{MONTHS[cell.m]}{cell.filled ? '' : ' — open'}"
          onclick={() => scrollToMonth(cell.m)}
        ><span class="ovl">{MONTH_LETTERS[cell.m]}</span></button>
      {/each}
    </div>

    <div class="mstats">
      <span class="mstat"><strong class="num">{Math.round(stats.avgQol) || '—'}</strong> avg score</span>
      <span class="mstat"><strong class="num">{stats.months ? fmtMoney(stats.avgCost) : '—'}</strong> /mo {partyWord()}</span>
      {#if sch.anySchengen}
        <button type="button" class="mstat sch" class:bad={!sch.ok} class:tight={sch.ok && sch.atLimit} onclick={() => { pickerOpen = true; flagNonSchengen(); }}>
          <strong class="num">◆ {sch.ok ? `${sch.remaining}/90` : `${sch.over} over`}</strong> Schengen
        </button>
      {/if}
    </div>

    <ul class="mlist">
      {#each occ as o, m}
        {#if o === null}
          <li class="mrow empty" id="myr-m-{m}">
            <div class="mrow-head"><span class="mmonth">{MONTHS[m]}</span><span class="mopen">open</span></div>
            {#if !previewing}
              <button type="button" class="madd" onclick={() => openPicker(m)}><span class="plus" aria-hidden="true">+</span> Add a city</button>
            {/if}
          </li>
        {:else if o.start === m}
          {@const c = cityByKey.get(o.key)}
          <li class="mrow filled" class:schengen={c.schengen} class:hazard={stayHazard(o)} id="myr-m-{m}">
            <div class="mrow-head">
              <button type="button" class="mname" onclick={() => onopen(c.key, { month: o.start })}>{c.name}{#if c.schengen}<span class="dia"> ◆</span>{/if}</button>
              <span class="mscore num">{Math.round(stayAvg(o))}</span>
            </div>
            <p class="mmeta num">{rangeLabel(o.start, o.len)} · {o.len}mo · ~{fmtMoney(stayCostAvg(o))}/mo</p>
            <div class="mstrip">
              <MonthStrip cells={stripCells(c, preset)} frameFrom={o.start} frameLen={o.len} />
            </div>
            {#if !previewing}
              <div class="mrow-act">
                <div class="durm" role="group" aria-label="Stay length in months">
                  <button type="button" class="durb" aria-label="Shorter" onclick={() => resizeStay(o, o.len - 1)} disabled={o.len <= 1}>−</button>
                  <span class="durv num">{o.len} mo</span>
                  <button type="button" class="durb" aria-label="Longer" onclick={() => resizeStay(o, o.len + 1)}>+</button>
                </div>
                <button type="button" class="mremove" onclick={() => removeStay(o)}>Remove</button>
              </div>
            {/if}
          </li>
        {/if}
      {/each}
    </ul>

    {#if !previewing && stays.length === 0}
      <p class="board-hint">Tap a month's “Add a city” to start building your year.</p>
    {/if}
  </div>
  {/if}

  {#if !previewing}
  {#snippet pickerBody()}
  <div class="controls">
    <div class="ctl-row">
      <div class="ctl-group">
        <span class="ctl-lbl" aria-hidden="true">Sort by</span>
        <div class="seg sortseg" role="group" aria-label="Sort city list by">
          <button type="button" class="segbtn" class:on={sortMode === 'qol'} aria-pressed={sortMode === 'qol'} onclick={() => (sortMode = 'qol')}>Highest Score</button>
          <button type="button" class="segbtn" class:on={sortMode === 'value'} aria-pressed={sortMode === 'value'} onclick={() => (sortMode = 'value')}>Best Value</button>
        </div>
      </div>
      <span class="fcount num">{filteredCities.length} of {cities.length} cities pass</span>
    </div>

    <div class="filters">
      {#if filtersActive(filters)}
        <button type="button" class="chip clearchip" onclick={resetFilters}>✕ Clear</button>
      {/if}
      <RegionMenu {regions} active={regionSel} ontoggle={toggleRegion} onclear={() => (regionSel = new Set())} />
      <button
        type="button"
        class="chip more"
        class:on={showMore || refineActive}
        aria-expanded={showMore}
        onclick={() => (showMore = !showMore)}
      >
        Refine{refineActive ? ' ·' : ''}{showMore ? ' ▴' : ' ▾'}
      </button>
    </div>
  </div>

  {#if showMore}
    <div class="refine">
      <div class="refine-fields">
        <label class="refine-field">
          <span class="refine-field-lbl">Max $/mo {partyWord()}</span>
          <div class="refine-select">
            <select bind:value={filters.maxCost} aria-label="Max monthly budget, {partyWord()}">
              <option value="">Any</option>
              {#each costOptions as v}<option value={v}>{fmtMoney(v)}</option>{/each}
            </select>
          </div>
        </label>
        <label class="refine-field">
          <span class="refine-field-lbl">Min safety</span>
          <div class="refine-select">
            <select bind:value={filters.minSafety} aria-label="Minimum safety score">
              <option value="">Any</option>
              {#each SAFETY_OPTIONS as o}<option value={o.v}>{o.label}</option>{/each}
            </select>
          </div>
        </label>
        <label class="refine-field">
          <span class="refine-field-lbl">Min air</span>
          <div class="refine-select">
            <select bind:value={filters.minAir} aria-label="Minimum air quality">
              <option value="">Any</option>
              {#each AIR_OPTIONS as o}<option value={o.v}>{o.label}</option>{/each}
            </select>
          </div>
        </label>
        <label class="refine-field">
          <span class="refine-field-lbl">Rain</span>
          <div class="refine-select">
            <select bind:value={filters.maxRain} aria-label="Rain tolerance">
              <option value="">Any rain</option>
              {#each RAIN_OPTIONS as o}<option value={o.v}>{o.label}</option>{/each}
            </select>
          </div>
        </label>
      </div>
      <div class="refine-toggles">
        <label class="refine-toggle" title="Keep only cities where English works day-to-day — skips spots where you'd need translation outside tourist zones">
          <input type="checkbox" bind:checked={filters.englishOk} />
          <span>English-friendly</span>
        </label>
        <label class="refine-toggle" class:flash={nonSchengenFlash} bind:this={nonSchengenEl}>
          <input type="checkbox" bind:checked={filters.nonSchengen} />
          <span>◆ Non-Schengen</span>
        </label>
      </div>
    </div>
  {/if}

  <div class="picker">
    <div class="pickhead">
      <h2>
        {#if selStart >= 0}Fill {windowLabel}{:else if emptyMonths.length}Best for your open months{:else}Year is full — remove a stay to swap{/if}
      </h2>
      <div class="pickctl">
        <div class="stayctl" role="group" aria-label="Stay length in months">
          <span class="stayctl-lbl">Stay</span>
          <div class="seg">
            {#each [1, 2, 3, 4, 5, 6] as n}
              <button type="button" class="segbtn num" class:on={dur === n} aria-pressed={dur === n} onclick={() => (dur = n)}>{n}</button>
            {/each}
          </div>
          <span class="stayctl-unit">mo</span>
        </div>
        <input type="search" placeholder="Search 111 cities…" bind:value={query} />
      </div>
    </div>
    {#if sch.anySchengen}
      <p class="schbudget num" class:warn={!sch.ok}>
        ◆ {#if sch.ok}{schLeft} of 90 Schengen days left in your tightest window{:else}{sch.over} days over the Schengen cap{/if}
      </p>
    {/if}
    <div class="legendrow"><Legend /></div>
    {#if pickerList.length === 0}
      <p class="picker-empty">
        {query.trim()
          ? 'No cities match your search and filters.'
          : `${filteredCities.length} of ${cities.length} cities pass your filters — loosen one to see options here.`}
        {#if filtersActive(filters)}
          <button type="button" class="chip clear" onclick={resetFilters}>Reset filters</button>
        {/if}
      </p>
    {/if}
    <ul class="rows">
      {#each pickerList as { c, s, breach } (c.key)}
        <li>
          <div class="rowbody">
            <div class="rowhead">
              <button type="button" class="rowname" onclick={() => onopen(c.key)}>
                {c.name}<em>{c.country}{c.schengen ? ' ◆' : ''}</em>
              </button>
              <div class="rowmeasure">
                {#if breach}
                  <button type="button" class="rowwarn" onclick={flagNonSchengen} title="Adding this Schengen stay breaks the 90/180 cap — filter to non-Schengen cities">◆ over 90/180</button>
                {/if}
                <span class="num rowq" title={sortMode === 'value' ? "Average Best Value across the months you'd book" : "Average score across the months you'd book"}>{Math.round(s)}</span>
              </div>
            </div>
            <div class="rowstrip">
              <MonthStrip
                cells={stripCells(c, preset)}
                selected={selStart}
                frameFrom={prospect ? prospect.start : -1}
                frameLen={prospect ? prospect.len : 0}
              />
            </div>
          </div>
          <button
            type="button"
            class="add"
            class:warn={breach}
            onclick={() => addFromPicker(c.key)}
            disabled={!emptyMonths.length}
            title={breach ? 'Will exceed the Schengen 90/180 limit' : `Add ${c.name}`}
            aria-label="Add {c.name}"
          >
            <span class="plus" aria-hidden="true">+</span>Add
          </button>
        </li>
      {/each}
    </ul>
  </div>
  {/snippet}

  {#if screen.mobile}
    {#if pickerOpen}
      <div class="picker-scrim">
        <button type="button" class="picker-scrim-back" aria-label="Close picker" onclick={closePicker}></button>
        <div class="picker-sheet" role="dialog" aria-modal="true" aria-label="Add a city to your year">
          <div class="picker-grab" aria-hidden="true"></div>
          <div class="picker-top">
            <strong class="picker-title">
              {#if selStart >= 0}Fill {windowLabel}{:else if emptyMonths.length}Best for your open months{:else}Year is full{/if}
            </strong>
            <button type="button" class="picker-done" onclick={closePicker}>Done</button>
          </div>
          <div class="picker-body">
            {@render pickerBody()}
          </div>
        </div>
      </div>
    {/if}
  {:else}
    {@render pickerBody()}
  {/if}
  {/if}
</section>

<style>
  .wrap { padding-bottom: 70px; }

  .head-right {
    display: flex;
    align-items: flex-end;
    gap: 14px;
  }

  .chip.clear { color: var(--terra-deep); }

  .chip.share.on {
    background: var(--teal, #2f6f5e);
    border-color: var(--teal, #2f6f5e);
    color: var(--paper);
  }

  /* Shared-itinerary banner: a calm, distinct strip above the board so a visitor
     immediately reads "this isn't mine yet" and sees how to make it theirs. */
  .previewbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 16px;
    padding: 12px 16px;
    background: var(--schengen-soft, #e8eef6);
    border: 1px solid var(--line);
    border-radius: 12px;
  }

  .preview-msg { display: flex; flex-direction: column; gap: 2px; }

  .preview-eyebrow {
    font-size: 10.5px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--ink-2);
  }

  .preview-sub { font-size: 12.5px; color: var(--ink-2); }

  .preview-act { display: flex; gap: 8px; flex-shrink: 0; }

  /* Editable trip name sits under the headline. An always-on dotted underline
     signals it's editable (a hover-only cue would vanish on touch).
     Sizer: the ::after mirrors the value and the input overlays it, so the
     field auto-grows to its content. Both must share font + padding box. */
  .trip-name-field {
    display: inline-grid;
    min-width: 1ch;
    max-width: 60vw;
    margin-top: 7px;
  }
  .trip-name-field::after {
    content: attr(data-value);
    visibility: hidden;
    white-space: pre;
  }
  .trip-name,
  .trip-name-field::after {
    grid-area: 1 / 1;
    padding: 1px 1px 2px;
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    letter-spacing: inherit;
  }
  /* The sizer (::after) takes its width from the text; the input fills it. */
  .trip-name {
    width: 100%;
    min-width: 0;
    border: none;
    border-bottom: 1px dotted var(--ink-3);
    border-radius: 0;
    background: transparent;
    color: var(--ink-1);
    transition: border-bottom-color 0.15s;
  }
  .trip-name::placeholder { color: var(--ink-3); font-weight: 400; }
  .trip-name:hover { border-bottom-color: var(--ink-2); }
  .trip-name:focus {
    outline: none;
    border-bottom: 1px solid var(--terra);
  }

  .trip-name-static {
    margin-top: 7px;
    font-size: 15px;
    font-weight: 500;
    color: var(--ink-1);
  }

  .chip.adopt {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
    font-weight: 600;
  }

  .chip.adopt:hover { background: var(--terra); border-color: var(--terra); }

  /* Read-only stay length in preview, sitting where the +/− control would be. */
  .preview-len {
    position: absolute;
    bottom: 5px;
    right: 7px;
    color: var(--ink-2);
  }

  /* Empty months render as quiet placeholders (no + affordance) in preview. */
  .gap.empty {
    border-style: dashed;
    opacity: 0.5;
    pointer-events: none;
  }

  .board {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 18px 20px 16px;
  }

  /* One-shot confirmation when a proposal is applied to the timeline above. */
  .board.flash {
    animation: boardflash 1s ease;
  }

  @keyframes boardflash {
    0% { box-shadow: 0 0 0 0 rgba(193, 79, 43, 0); border-color: var(--line); }
    22% { box-shadow: 0 0 0 4px rgba(193, 79, 43, 0.22); border-color: var(--terra); }
    100% { box-shadow: 0 0 0 0 rgba(193, 79, 43, 0); border-color: var(--line); }
  }

  .boardscroll-wrap {
    position: relative;
  }

  /* Right-edge fade: appears only while more months sit off-screen. */
  .boardscroll-wrap::after {
    content: '';
    position: absolute;
    inset: 0 0 0 auto;
    width: 44px;
    pointer-events: none;
    background: linear-gradient(to right, rgba(253, 250, 242, 0), var(--card));
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .boardscroll-wrap.more::after {
    opacity: 1;
  }

  @media (max-width: 600px) {
    .boardscroll {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .boardscroll .months,
    .boardscroll .timeline {
      min-width: 560px;
    }
  }

  .months {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 4px;
    font-size: 11px;
    color: var(--ink-3);
    text-align: center;
    margin-bottom: 6px;
  }

  .months .sel { color: var(--terra); font-weight: 600; }

  .timeline {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    grid-auto-flow: dense;
    gap: 4px;
    min-height: 58px;
  }

  .gap {
    border: 1.5px dashed var(--line);
    background: transparent;
    border-radius: 9px;
    color: var(--ink-3);
    font-size: 16px;
    min-height: 54px;
    transition: all 0.13s ease;
  }

  .gap:hover, .gap.sel { border-color: var(--terra); color: var(--terra); background: rgba(193, 79, 43, 0.06); }

  .stay {
    position: relative;
    background: #dcebe2;
    border: 1px solid var(--teal);
    border-radius: 9px;
    min-height: 54px;
    padding: 7px 9px;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    overflow: hidden;
  }

  .stay.schengen { background: var(--schengen-soft); border-color: var(--schengen); }
  .stay.hazard { box-shadow: inset 0 0 0 2px rgba(193, 79, 43, 0.5); }

  .stayname {
    background: none;
    border: none;
    padding: 0 14px 0 0;
    font-family: var(--sans);
    font-weight: 650;
    font-size: 12px;
    color: var(--ink);
    text-align: left;
    line-height: 1.2;
    text-decoration: underline transparent;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .stayname:hover { text-decoration-color: var(--ink-2); }

  .stayq {
    position: absolute;
    bottom: 5px;
    left: 9px;
    font-size: 11px;
    color: var(--ink-2);
  }

  .x {
    position: absolute;
    top: 3px;
    right: 5px;
    background: none;
    border: none;
    color: var(--ink-3);
    font-size: 15px;
    line-height: 1;
    padding: 2px;
  }

  .x:hover { color: var(--terra-deep); }

  .dur-ctl {
    position: absolute;
    bottom: 5px;
    right: 5px;
    display: flex;
    align-items: center;
    gap: 1px;
    opacity: 0.5;
    transition: opacity 0.15s;
  }

  /* Visible at rest so the control is discoverable; full on hover/keyboard focus. */
  .stay:hover .dur-ctl,
  .stay:focus-within .dur-ctl { opacity: 1; }

  @media (hover: none) {
    .dur-ctl { opacity: 1; }
  }

  .dur-val {
    font-size: 9.5px;
    color: var(--ink-2);
    padding: 0 1px;
  }

  .dur-btn {
    border: none;
    background: none;
    padding: 1px 4px;
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-2);
    line-height: 1;
    border-radius: 3px;
  }

  .dur-btn:hover:not(:disabled) { background: rgba(33, 36, 30, 0.1); color: var(--ink); }
  .dur-btn:disabled { opacity: 0.25; cursor: default; }

  /* Roomier tap targets on touch, where there's no hover to enlarge intent. */
  @media (hover: none) {
    .dur-btn { min-width: 30px; min-height: 30px; }
    .x { min-width: 30px; min-height: 30px; }
  }

  .cont { font-size: 11px; color: var(--ink-2); white-space: nowrap; }

  /* Schengen status — one compact line, shown only when the route actually
     touches Schengen countries, so non-EU plans don't pay for the real estate. */
  .schline {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 14px;
    --sch-accent: var(--schengen);
  }

  .schline.tight { --sch-accent: var(--band-ok); }
  .schline.bad { --sch-accent: var(--band-bad); }

  .mlabel { font-size: 12px; font-weight: 600; color: var(--sch-accent); white-space: nowrap; }

  .sch-state {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--sch-accent);
    border: 1px solid var(--sch-accent);
    border-radius: 999px;
    padding: 2px 10px;
  }

  .sch-read {
    margin-left: auto;
    font-size: 12.5px;
    color: var(--ink-2);
    white-space: nowrap;
  }

  .sch-read strong { color: var(--sch-accent); font-size: 14px; }
  .sch-sub { color: var(--ink-3); }

  .board-hint {
    margin: 4px 0 10px;
    text-align: center;
    font-family: var(--display);
    font-style: italic;
    font-size: 13px;
    color: var(--ink-3);
  }

  .totals {
    display: flex;
    flex-wrap: wrap;
    gap: 26px;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--line-soft);
  }

  .tot { display: flex; flex-direction: column; }
  .tv { font-size: 19px; font-weight: 600; }
  .tk { font-size: 10.5px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink-3); }

  /* Compact control bar — mirrors This month's Sort + Regions ▾ / Refine ▾ row
     so both surfaces filter the same way. Filters collapse by default, keeping
     the city list the first thing in view. */
  .controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 20px;
  }

  .ctl-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 16px;
  }

  .ctl-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ctl-lbl {
    font-size: 9.5px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--ink-3);
    line-height: 1;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .clearchip { color: var(--terra-deep); white-space: nowrap; }
  .chip.more { white-space: nowrap; }

  @media (max-width: 700px) {
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

  .add {
    border: 1px solid var(--ink);
    background: var(--ink);
    color: var(--paper);
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }

  .add {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 15px 6px 12px;
    min-height: 32px;
  }

  /* The + glyph anchors the action visually; the word keeps it unambiguous. */
  .add .plus {
    font-size: 16px;
    font-weight: 500;
    line-height: 1;
    margin-top: -1px;
  }

  .add:hover:not(:disabled) { background: var(--terra); border-color: var(--terra); }

  .add:disabled { opacity: 0.35; cursor: default; }

  /* Breach-aware Add: warn (terracotta outline) but stay clickable. */
  .add.warn {
    background: transparent;
    color: var(--terra-deep);
    border-color: var(--terra);
  }

  .add.warn:hover:not(:disabled) {
    background: var(--terra);
    color: var(--paper);
  }

  .fcount { font-size: 11.5px; color: var(--ink-3); margin-left: auto; }

  .picker { margin-top: 26px; }

  .pickhead {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }

  h2 { font-size: var(--h2); font-weight: 580; }

  .legendrow { margin-bottom: 8px; }

  .schbudget {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--schengen);
  }

  .schbudget.warn { color: var(--band-bad); }

  .pickctl { display: flex; align-items: center; gap: 14px; font-size: 12.5px; color: var(--ink-2); }
  .pickctl input { width: 200px; }

  /* Stay length as a segmented control: each months a tappable cell so the
     choice reads as a row of widths, echoing the window drawn on every strip. */
  .stayctl {
    display: flex;
    align-items: center;
    gap: 7px;
    white-space: nowrap;
  }

  .stayctl-lbl,
  .stayctl-unit { color: var(--ink-3); }

  .seg {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    background: var(--paper-2);
  }

  .segbtn {
    border: none;
    background: transparent;
    color: var(--ink-2);
    padding: 4px 9px;
    font-size: 12.5px;
    line-height: 1;
    border-left: 1px solid var(--line);
  }

  .segbtn:first-child { border-left: none; }
  .segbtn:hover:not(.on) { background: rgba(33, 36, 30, 0.06); color: var(--ink); }

  .segbtn.on {
    background: var(--ink);
    color: var(--paper);
    font-weight: 600;
  }

  @media (hover: none) {
    .segbtn { min-width: 32px; min-height: 30px; }
  }

  /* The Sort control matches This month's pill segmented control exactly — same
     32px height, rounded ends, and ink fill — so the two surfaces read as one.
     The Stay stepper above keeps the squarer .seg look that suits a number row. */
  .sortseg {
    height: 32px;
    align-items: center;
    border-radius: 999px;
    background: var(--card);
  }

  .sortseg .segbtn {
    height: 100%;
    padding: 0 14px;
    font-weight: 600;
    border-left: none;
  }

  /* Scope the resting gray to the unselected button so it can't override the
     white-on-ink of the selected one (same specificity as .segbtn.on). */
  .sortseg .segbtn:not(.on) {
    color: var(--ink-3);
  }

  .sortseg .segbtn:hover:not(.on) {
    background: transparent;
    color: var(--ink);
  }

  .picker-empty {
    margin: 14px 0;
    padding: 22px 0;
    text-align: center;
    border-top: 1px solid var(--line-soft);
    font-family: var(--display);
    font-style: italic;
    font-size: 13.5px;
    color: var(--ink-2);
  }

  .rows { list-style: none; margin: 0; padding: 0; }

  .rows li {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 16px;
    padding: 11px 0;
    border-top: 1px solid var(--line-soft);
  }

  /* Name + score share a header line; the strip runs full width beneath it so
     the months get the most room and still align column-to-column down the list. */
  .rowbody {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .rowhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .rowwarn {
    font-family: inherit;
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: #7d2c12;
    background: #f3ddd2;
    border: none;
    border-radius: 999px;
    padding: 2px 8px;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.13s ease;
  }

  .rowwarn:hover { background: #ecc6b3; }
  .rowwarn:focus-visible { outline: 2px solid var(--terra); outline-offset: 1px; }

  .rowname {
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    font-family: var(--sans);
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink);
  }

  .rowname em {
    display: block;
    font-style: normal;
    font-weight: 400;
    font-size: 11px;
    color: var(--ink-3);
  }

  .rowname:hover { color: var(--terra-deep); }

  .rowstrip { min-width: 0; }

  /* Score + optional Schengen warning, right side of the header line. Always
     present, so the warning never changes a row's height. */
  .rowmeasure {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  /* Underlined in the same accent as the in-window month marker, so the line
     itself reads as "this number measures those months." */
  .rowq {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    border-bottom: 2px solid var(--terra);
    padding-bottom: 1px;
    line-height: 1.1;
  }

  /* ───────────────────── Mobile My year ─────────────────────
     A vertical month list + a bottom-sheet picker. These elements only render
     when screen.mobile is true, so the rules never touch the desktop board. */
  .myr-m { margin-top: 16px; }

  /* Year overview: 12 read-only cells for orientation; tap scrolls to a month. */
  .ov {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 3px;
    margin-bottom: 14px;
  }

  .ovcell {
    height: 34px;
    border: 1px dashed var(--line);
    border-radius: 6px;
    background: transparent;
    color: var(--ink-3);
    font-size: 10px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .ovcell.filled { border-style: solid; border-color: transparent; }
  .ovcell.filled.band-great { background: var(--band-great); color: var(--band-great-ink); }
  .ovcell.filled.band-good { background: var(--band-good); color: var(--band-good-ink); }
  .ovcell.filled.band-ok { background: var(--band-ok); color: var(--band-ok-ink); }
  .ovcell.filled.band-bad { background: var(--band-bad); color: var(--band-bad-ink); }
  .ovcell.sel { outline: 2px solid var(--terra); outline-offset: 1px; }

  /* Route stats as a compact pill row (replaces the desktop .totals on mobile). */
  .mstats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }

  .mstat {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    padding: 6px 12px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--card);
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .mstat strong { font-size: 14px; font-weight: 600; color: var(--ink); text-transform: none; letter-spacing: 0; }

  .mstat.sch { color: var(--schengen); border-color: var(--schengen); cursor: pointer; }
  .mstat.sch strong { color: var(--schengen); }
  .mstat.sch.tight { color: var(--band-ok); border-color: var(--band-ok); }
  .mstat.sch.tight strong { color: var(--band-ok); }
  .mstat.sch.bad { color: var(--band-bad); border-color: var(--band-bad); }
  .mstat.sch.bad strong { color: var(--band-bad); }

  /* The month list. */
  .mlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }

  .mrow {
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 13px 15px;
    background: var(--card);
    scroll-margin-top: 80px;
  }

  .mrow.empty {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-style: dashed;
    background: transparent;
    flex-wrap: wrap;
  }

  .mrow.filled { background: #dcebe2; border-color: var(--teal); }
  .mrow.filled.schengen { background: var(--schengen-soft); border-color: var(--schengen); }
  .mrow.filled.hazard { box-shadow: inset 0 0 0 2px rgba(193, 79, 43, 0.4); }

  .mrow-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }

  .mmonth { font-family: var(--display); font-size: 18px; font-weight: 580; color: var(--ink); }
  .mopen { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }

  .mname {
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    font-family: var(--display);
    font-size: 18px;
    font-weight: 580;
    color: var(--ink);
    line-height: 1.15;
  }

  .mname .dia { color: var(--schengen); }
  .mscore { font-size: 15px; font-weight: 600; color: var(--ink); flex-shrink: 0; }

  .mmeta { margin: 5px 0 10px; font-size: 12px; color: var(--ink-2); }
  .mstrip { margin-bottom: 12px; }

  .mrow-act { display: flex; align-items: center; justify-content: space-between; gap: 10px; }

  /* Stay-length stepper: full-size touch targets, always visible (no hover). */
  .durm {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--card);
    padding: 2px;
  }

  .durb {
    min-width: 40px;
    min-height: 40px;
    border: none;
    background: none;
    border-radius: 999px;
    font-size: 19px;
    line-height: 1;
    color: var(--ink-2);
  }

  .durb:disabled { opacity: 0.3; }
  .durv { min-width: 44px; text-align: center; font-size: 13px; color: var(--ink); }

  .mremove {
    min-height: 40px;
    padding: 0 16px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--card);
    font-size: 13px;
    font-weight: 500;
    color: var(--terra-deep);
  }

  /* Empty-month primary action: full-width, comfortable. */
  .madd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 18px;
    border: 1px solid var(--ink);
    border-radius: 999px;
    background: var(--ink);
    color: var(--paper);
    font-size: 13.5px;
    font-weight: 600;
  }

  .madd .plus { font-size: 18px; line-height: 1; margin-top: -1px; }
  .mrow.empty .madd { flex: 0 0 auto; }

  /* ── City picker as a bottom sheet ── */
  .picker-scrim {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: flex-end;
    background: rgba(33, 36, 30, 0.45);
  }

  .picker-scrim-back {
    position: fixed;
    inset: 0;
    background: none;
    border: none;
    padding: 0;
    cursor: default;
  }

  .picker-sheet {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: var(--sheet-max-h);
    background: var(--paper);
    border-radius: 18px 18px 0 0;
    border-top: 1px solid var(--line);
    box-shadow: 0 -10px 30px -16px rgba(33, 36, 30, 0.5);
  }

  .picker-grab {
    width: 40px;
    height: 4px;
    margin: 8px auto 0;
    border-radius: 999px;
    background: var(--line);
    flex-shrink: 0;
  }

  .picker-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px var(--pad-x);
    border-bottom: 1px solid var(--line-soft);
    flex-shrink: 0;
  }

  .picker-title { font-family: var(--display); font-size: 18px; font-weight: 580; color: var(--ink); }

  .picker-done {
    min-height: 40px;
    padding: 0 16px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--card);
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink);
    flex-shrink: 0;
  }

  .picker-body {
    flex: 1 1 auto;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 0 var(--pad-x) calc(18px + var(--safe-b));
  }

  /* Tighten the reused desktop control markup for the sheet, and finally kill
     the fixed-width search that caused the original horizontal overflow. */
  .picker-body :global(.controls) { margin-top: 12px; }
  .picker-body :global(.picker) { margin-top: 16px; }
  /* The pinned sheet header already shows the "Fill …" title — drop the dupe. */
  .picker-body :global(.pickhead h2) { display: none; }
  .picker-body :global(.pickhead) { flex-direction: column; align-items: stretch; gap: 10px; }
  .picker-body :global(.pickctl) { flex-wrap: wrap; gap: 12px; }
  .picker-body :global(.pickctl input) { width: 100%; flex: 1 1 100%; min-height: 40px; }
  .picker-body :global(.add) { min-height: 40px; }
  .picker-body :global(.rows li) { padding: 13px 0; }

</style>
